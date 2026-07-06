/**
 * Read-only data-hygiene audit for `transaction_tag_rules` (CF060/#3650).
 *
 * Split out of `transaction-tag-rules.ts` to stay under the 200-line cap.
 * Neither function mutates anything — both are reporting tools for a human
 * to review and decide on a manual merge/disable/delete, mirroring the "surface
 * conflicts for manual merge" fix on CF060 rather than auto-resolving live data.
 */
import { eq } from 'drizzle-orm';

import { transactionTagRules, transactions } from '../schema.js';
import {
  normalizeDescription,
  patternMatchesNormalizedDescription,
} from './transaction-corrections-types.js';

import type { FinanceDb } from './internal.js';

/**
 * Raw drizzle row shape — duplicated from `transaction-tag-rules.ts`'s
 * `TransactionTagRuleRow` (kept structurally identical, both `$inferSelect`
 * off the same table) rather than imported, so this audit module has no
 * dependency back on its sibling and the two can be split either direction
 * without a cycle.
 */
type TransactionTagRuleRow = typeof transactionTagRules.$inferSelect;

/** A group of active rules sharing the same `(normalized descriptionPattern, matchType)` — a duplicate/contradictory cluster. `descriptionPattern` is the shared normalized key, not any one row's raw stored pattern. */
export interface TagRuleConflictGroup {
  descriptionPattern: string;
  matchType: TransactionTagRuleRow['matchType'];
  rules: TransactionTagRuleRow[];
}

/**
 * Normalize a stored pattern the same way {@link createTransactionTagRule}
 * does before persisting: non-regex patterns fold through
 * {@link normalizeDescription} (uppercase, digit-strip, whitespace-collapse),
 * regex patterns stay raw (normalizing would corrupt metacharacters). Applied
 * to the grouping key so two rows the create path would treat as the same
 * pattern collapse into one cluster even when a legacy/un-normalized row stored
 * a case/digit/whitespace variant of the pattern.
 */
function normalizeTagRulePattern(
  pattern: string,
  matchType: TransactionTagRuleRow['matchType']
): string {
  return matchType === 'regex' ? pattern : normalizeDescription(pattern);
}

/**
 * Group every active rule by normalized `(descriptionPattern, matchType)` and
 * return only the groups with more than one row — active rules that would
 * collide at match time, with the winner decided by an incidental
 * priority/id tie-break rather than a deliberate choice.
 *
 * `entityId` is deliberately NOT part of the grouping key: two rows for the
 * same pattern with *different* `entityId`s (a valid id vs. an orphaned or
 * temp-leaked one, per CF060) are exactly the nondeterministic-winner case
 * this audit exists to surface, not a case to skip.
 */
export function findDuplicateTransactionTagRules(db: FinanceDb): TagRuleConflictGroup[] {
  const rules = db
    .select()
    .from(transactionTagRules)
    .where(eq(transactionTagRules.isActive, true))
    .all();

  const groups = new Map<string, { normalizedPattern: string; rules: TransactionTagRuleRow[] }>();
  for (const rule of rules) {
    const normalizedPattern = normalizeTagRulePattern(rule.descriptionPattern, rule.matchType);
    const key = `${rule.matchType} ${normalizedPattern}`;
    const bucket = groups.get(key);
    if (bucket) bucket.rules.push(rule);
    else groups.set(key, { normalizedPattern, rules: [rule] });
  }

  return [...groups.values()]
    .filter((group) => group.rules.length > 1)
    .map((group) => ({
      descriptionPattern: group.normalizedPattern,
      matchType: group.rules[0]?.matchType ?? 'exact',
      rules: group.rules,
    }));
}

/**
 * Active rules whose pattern matches none of the transactions currently in
 * the table — the "7/61 tag rules ... match none of the 87 live descriptions"
 * case from the CF060 audit. Intended for occasional/admin use: it's an
 * O(rules × transactions) scan, not something to call on a request path.
 *
 * An empty transaction table means every rule is (currently) unreachable but
 * cannot yet be blamed on the rule itself, so this returns `[]` rather than
 * flagging the whole rule set.
 */
export function findUnreachableTransactionTagRules(db: FinanceDb): TransactionTagRuleRow[] {
  const rules = db
    .select()
    .from(transactionTagRules)
    .where(eq(transactionTagRules.isActive, true))
    .all();
  if (rules.length === 0) return [];

  const rows = db.select({ description: transactions.description }).from(transactions).all();
  if (rows.length === 0) return [];

  const normalizedDescriptions = rows.map((row) => normalizeDescription(row.description));

  return rules.filter(
    (rule) =>
      !normalizedDescriptions.some((description) =>
        patternMatchesNormalizedDescription(rule.descriptionPattern, rule.matchType, description)
      )
  );
}
