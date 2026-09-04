/**
 * `generateRules`: a batch of transactions → proposed tagging rules. Ported
 * from the monolith `core/corrections/lib/rule-generator.ts`, routed through
 * the injectable Claude completer (`ai-runtime.ts`).
 *
 * Split out of `ai-analyze.ts` (which keeps `analyzeCorrection`) to stay under
 * the per-file line cap — the two share `AcceptedCorrectionExample`'s few-shot
 * formatting but are otherwise independent prompts.
 */
import { accountsService, type FinanceDb, transactions } from '../../../db/index.js';
import { extractJsonFromReply } from '../ai-json.js';
import {
  formatFewShotExamples,
  loadRecentAcceptedCorrections,
  MATCH_TYPES,
  type AcceptedCorrectionExample,
} from './ai-analyze.js';
import { getClaudeCompleter } from './ai-runtime.js';
import { type ProposedRule } from './ai-types.js';
import { parseCorrectionTags } from './types.js';

export interface GenerateRulesTransaction {
  description: string;
  entityName: string | null;
  amount: number;
  account: string;
  /**
   * Preferred over `account` when both are supplied (POPS-2769) — resolved
   * via `getAccount` for the prompt text rather than trusting the
   * caller-supplied `account` string verbatim. Silently falls back to
   * `account` if the id does not resolve, since this is a display nicety for
   * an AI prompt, not a write that must fail loudly.
   */
  accountId?: string | undefined;
  currentTags: string[];
}

/** The account name to show the AI for one transaction — see `GenerateRulesTransaction.accountId`. */
function resolveAccountNameForPrompt(db: FinanceDb, txn: GenerateRulesTransaction): string {
  if (txn.accountId === undefined) return txn.account;
  try {
    return accountsService.getAccount(db, txn.accountId).name;
  } catch {
    return txn.account;
  }
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
  const resolvedTxns = txns.map((t) => ({ ...t, account: resolveAccountNameForPrompt(db, t) }));
  const text = await getClaudeCompleter()({
    prompt: buildGeneratePrompt(
      resolvedTxns,
      loadAvailableTags(db),
      loadRecentAcceptedCorrections(db)
    ),
    maxTokens: 2000,
    operation: 'generate-rules',
  });
  if (!text) return [];
  return parseProposals(text);
}
