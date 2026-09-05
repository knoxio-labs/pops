/**
 * `analyzeCorrection`: one signal → a validated rule. Ported from the
 * monolith `core/corrections/lib/analyze-correction.ts`, routed through the
 * injectable Claude completer (`ai-runtime.ts`).
 *
 * Also owns the few-shot grounding (`loadRecentAcceptedCorrections`,
 * `formatFewShotExamples`) and the shared `MATCH_TYPES`/`AcceptedCorrectionExample`
 * that `ai-generate-rules.ts`'s `generateRules` reuses — split out to stay
 * under the per-file line cap.
 */
import { desc, eq } from 'drizzle-orm';

import { describeForMatching, patternMatchesDescription } from '../../../contract/pattern-match.js';
import { type FinanceDb, transactionCorrections } from '../../../db/index.js';
import { extractJsonFromReply } from '../ai-json.js';
import { getClaudeCompleter } from './ai-runtime.js';
import { type CorrectionAnalysis } from './ai-types.js';
import { parseCorrectionTags } from './types.js';

const MIN_PATTERN_LENGTH = 3;
export const MATCH_TYPES = ['exact', 'contains', 'regex'] as const;
const RECENT_CORRECTIONS_LIMIT = 5;

export interface CorrectionInput {
  description: string;
  entityName: string;
  amount: number;
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
export function formatFewShotExamples(examples: AcceptedCorrectionExample[]): string {
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
  if (
    !patternMatchesDescription(
      result.pattern,
      result.matchType,
      describeForMatching(input.description)
    )
  ) {
    return null;
  }
  return result;
}
