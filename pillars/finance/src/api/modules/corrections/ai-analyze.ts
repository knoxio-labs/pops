/**
 * AI rule derivation: `analyzeCorrection` (one signal → a validated rule) and
 * `generateRules` (a batch of transactions → proposed tagging rules). Ported
 * from the monolith `core/corrections/lib/{analyze-correction,rule-generator}.ts`,
 * routed through the injectable Claude completer (`ai-runtime.ts`).
 */
import { desc, eq } from 'drizzle-orm';

import {
  type FinanceDb,
  transactionCorrections,
  transactions,
  transactionCorrectionsService,
} from '../../../db/index.js';
import { extractJsonFromReply } from '../ai-json.js';
import { getClaudeCompleter } from './ai-runtime.js';
import { type CorrectionAnalysis, type ProposedRule } from './ai-types.js';
import { parseCorrectionTags } from './types.js';

const MIN_PATTERN_LENGTH = 3;
const MATCH_TYPES = ['exact', 'contains', 'regex'] as const;
const RECENT_CORRECTIONS_LIMIT = 5;

export interface CorrectionInput {
  description: string;
  entityName: string;
  amount: number;
}

export interface GenerateRulesTransaction {
  description: string;
  entityName: string | null;
  amount: number;
  account: string;
  currentTags: string[];
}

/** A previously accepted correction rule, shown to the AI as a few-shot example (CF062/#3661). */
export interface AcceptedCorrectionExample {
  pattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  entityName: string | null;
  tags: string[];
}

/**
 * The most recently accepted correction rules, newest first — few-shot
 * grounding for `analyzeCorrection`/`generateRules` so the AI learns this
 * user's own pattern conventions instead of reasoning from scratch every
 * time. Bounded to keep the per-row token cost small.
 */
export function loadRecentAcceptedCorrections(db: FinanceDb): AcceptedCorrectionExample[] {
  const rows = db
    .select({
      descriptionPattern: transactionCorrections.descriptionPattern,
      matchType: transactionCorrections.matchType,
      entityName: transactionCorrections.entityName,
      tags: transactionCorrections.tags,
    })
    .from(transactionCorrections)
    .where(eq(transactionCorrections.isActive, true))
    .orderBy(desc(transactionCorrections.createdAt))
    .limit(RECENT_CORRECTIONS_LIMIT)
    .all();
  return rows.map((row) => ({
    pattern: row.descriptionPattern,
    matchType: row.matchType,
    entityName: row.entityName,
    tags: parseCorrectionTags(row.tags ?? '[]'),
  }));
}

/** Render accepted-correction examples as a few-shot block, or '' when there are none. */
function formatFewShotExamples(examples: AcceptedCorrectionExample[]): string {
  if (examples.length === 0) return '';
  const lines = examples
    .map((example, i) => {
      const tagsPart = example.tags.length > 0 ? `, tags: ${example.tags.join(', ')}` : '';
      return `${i + 1}. pattern: "${example.pattern}" (${example.matchType}) -> entity: ${
        example.entityName ?? 'none'
      }${tagsPart}`;
    })
    .join('\n');
  return `\n\nExamples of rules already accepted by this user (for calibration only — match this transaction on its own merits, do not copy an example verbatim unless it genuinely fits):\n${lines}`;
}

function patternMatchesDescription(
  pattern: string,
  matchType: 'exact' | 'contains' | 'regex',
  description: string
): boolean {
  const { normalizeDescription } = transactionCorrectionsService;
  const normalizedDescription = normalizeDescription(description);
  const normalizedPattern = matchType === 'regex' ? pattern : normalizeDescription(pattern);
  if (normalizedPattern.length === 0) return false;
  if (matchType === 'exact') return normalizedPattern === normalizedDescription;
  if (matchType === 'contains') return normalizedDescription.includes(normalizedPattern);
  try {
    return new RegExp(normalizedPattern).test(normalizedDescription);
  } catch {
    return false;
  }
}

export function buildAnalyzePrompt(
  input: CorrectionInput,
  examples: AcceptedCorrectionExample[] = []
): string {
  return `You are a bank transaction pattern analyzer. A user has assigned a transaction to an entity and we need a reusable rule that will identify FUTURE transactions belonging to the same entity.

Transaction description: "${input.description}"
Entity (context only — may not appear in the description): "${input.entityName}"
Amount: ${input.amount}

Pick a stable identifier from the description (merchant token, keyword). Strip volatile parts (numeric codes, dates, amounts). The entity name is context only — do not put it in the pattern unless it literally appears in the description.${formatFewShotExamples(examples)}

Return a single JSON object:
- "matchType": "exact" | "contains" | "regex"
- "pattern": the matching pattern (min ${MIN_PATTERN_LENGTH} chars, uppercase); for exact/contains it must appear verbatim (case-insensitive) in the description; for regex it must test true against the description.
- "confidence": 0.0-1.0

Return ONLY the JSON object, no markdown.`;
}

function parseAnalysis(text: string): CorrectionAnalysis | null {
  const jsonSlice = extractJsonFromReply(text);
  if (jsonSlice === null) return null;
  try {
    const parsed = JSON.parse(jsonSlice) as Record<string, unknown>;
    const matchType = typeof parsed['matchType'] === 'string' ? parsed['matchType'] : '';
    const pattern = typeof parsed['pattern'] === 'string' ? parsed['pattern'] : '';
    const confidence = typeof parsed['confidence'] === 'number' ? parsed['confidence'] : 0;
    if (
      !MATCH_TYPES.includes(matchType as (typeof MATCH_TYPES)[number]) ||
      pattern.length < MIN_PATTERN_LENGTH ||
      confidence < 0 ||
      confidence > 1
    ) {
      return null;
    }
    return { matchType: matchType as CorrectionAnalysis['matchType'], pattern, confidence };
  } catch {
    return null;
  }
}

/** Derive + validate a correction rule from one labelled transaction. Null when the AI is unavailable or proposes a non-matching pattern. */
export async function analyzeCorrection(
  db: FinanceDb,
  input: CorrectionInput
): Promise<CorrectionAnalysis | null> {
  const text = await getClaudeCompleter()({
    prompt: buildAnalyzePrompt(input, loadRecentAcceptedCorrections(db)),
    maxTokens: 200,
    operation: 'analyze-correction',
  });
  if (!text) return null;
  const result = parseAnalysis(text);
  if (!result) return null;
  if (!patternMatchesDescription(result.pattern, result.matchType, input.description)) return null;
  return result;
}

function loadAvailableTags(db: FinanceDb): string[] {
  const rows = db.select({ tags: transactions.tags }).from(transactions).all();
  const seen = new Set<string>();
  for (const row of rows) {
    for (const tag of parseCorrectionTags(row.tags ?? '[]')) seen.add(tag);
  }
  return [...seen].toSorted();
}

export function buildGeneratePrompt(
  txns: GenerateRulesTransaction[],
  availableTags: string[],
  examples: AcceptedCorrectionExample[] = []
): string {
  const lines = txns
    .map((t, i) => {
      const entity = t.entityName ?? 'unknown';
      const tags = t.currentTags.length > 0 ? t.currentTags.join(', ') : 'none';
      return `${i + 1}. "${t.description}" | entity: ${entity} | amount: ${t.amount} | account: ${t.account} | current tags: ${tags}`;
    })
    .join('\n');
  const tagList =
    availableTags.length > 0 ? availableTags.join(', ') : 'common financial categories';
  return `You are a transaction categorization assistant. Propose reusable tagging rules for these transactions.

Available tags: ${tagList}

Transactions:
${lines}${formatFewShotExamples(examples)}

Return a JSON array; each rule: {"descriptionPattern":"...","matchType":"exact|contains|regex","tags":["Tag1"],"reasoning":"..."}.
Return ONLY the JSON array, no markdown.`;
}

function parseProposals(text: string): ProposedRule[] {
  const jsonSlice = extractJsonFromReply(text);
  if (jsonSlice === null) return [];
  try {
    const parsed = JSON.parse(jsonSlice) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === 'object' && !Array.isArray(item)
      )
      .map((item) => ({
        descriptionPattern:
          typeof item['descriptionPattern'] === 'string' ? item['descriptionPattern'] : '',
        matchType: (MATCH_TYPES.includes(String(item['matchType']) as (typeof MATCH_TYPES)[number])
          ? item['matchType']
          : 'contains') as ProposedRule['matchType'],
        tags: Array.isArray(item['tags'])
          ? item['tags'].filter((t): t is string => typeof t === 'string')
          : [],
        reasoning: typeof item['reasoning'] === 'string' ? item['reasoning'] : '',
      }))
      .filter((p) => p.descriptionPattern.length > 0);
  } catch {
    return [];
  }
}

/** Batch-propose reusable tagging rules from a set of transactions. */
export async function generateRules(
  db: FinanceDb,
  txns: GenerateRulesTransaction[]
): Promise<ProposedRule[]> {
  const text = await getClaudeCompleter()({
    prompt: buildGeneratePrompt(txns, loadAvailableTags(db), loadRecentAcceptedCorrections(db)),
    maxTokens: 2000,
    operation: 'generate-rules',
  });
  if (!text) return [];
  return parseProposals(text);
}
