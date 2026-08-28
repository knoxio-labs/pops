/**
 * Retroactive tag-rule application (#3660): given an already-persisted tag
 * rule, find every existing transaction it matches and merge the rule's tags
 * into that transaction's `tags` column — the catch-up pass a rule created or
 * edited after those transactions were imported never got.
 *
 * Additive only: never removes a tag the transaction already carries, and
 * skips a transaction whose `matchType` is `manual` (CF017/#3623's
 * hand-fix marker) so a user's own correction is never touched. A transaction
 * that already carries every one of the rule's tags is left untouched, which
 * is what makes a second run against the same rule a no-op (idempotent).
 *
 * `dryRun` computes the identical match set without writing anything or
 * bumping the rule's usage telemetry (`timesApplied`/`lastUsedAt`) — a
 * preview must never count as usage, mirroring the honesty telemetry
 * established by #3719/#3740.
 */
import { asc, eq } from 'drizzle-orm';

import {
  type FinanceDb,
  transactionCorrectionsService,
  transactionTagRulesService,
  transactions,
} from '../../../db/index.js';
import { parseStoredTags } from '../../../db/tag-facets.js';

import type { MatchableDescription } from '../../../contract/pattern-match.js';

const BATCH_SIZE = 500;

interface BatchTxn {
  id: string;
  description: string;
  entityId: string | null;
  tags: string;
  matchType: string | null;
}

function fetchBatch(db: FinanceDb, offset: number): BatchTxn[] {
  return db
    .select({
      id: transactions.id,
      description: transactions.description,
      entityId: transactions.entityId,
      tags: transactions.tags,
      matchType: transactions.matchType,
    })
    .from(transactions)
    .orderBy(asc(transactions.id))
    .limit(BATCH_SIZE)
    .offset(offset)
    .all();
}

interface RuleScope {
  descriptionPattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  entityId: string | null;
}

function ruleMatchesTransaction(
  rule: RuleScope,
  txn: BatchTxn,
  description: MatchableDescription
): boolean {
  if (rule.entityId && rule.entityId !== txn.entityId) return false;
  return transactionCorrectionsService.patternMatchesDescription(
    rule.descriptionPattern,
    rule.matchType,
    description
  );
}

/**
 * Outcome of a retroactive tag-rule apply — see {@link applyTagRuleToExistingTransactions}.
 *
 * `matched` mirrors the correction-rule counterpart's semantics
 * (`CorrectionRuleRetroactiveResult.matched`): it counts every transaction the
 * rule's pattern (and entity scope) matches, including ones then skipped as
 * `skippedManual`. `updated` and `skippedManual` are sub-counts of `matched`,
 * not a disjoint partition of it.
 */
export interface TagRuleRetroactiveResult {
  dryRun: boolean;
  /** Transactions this rule matches (pattern + entity scope), regardless of outcome. */
  matched: number;
  /** Of `matched`, the ones actually written (or that would be, under `dryRun`). */
  updated: number;
  /** Of `matched`, skipped because the transaction carries a manual override. */
  skippedManual: number;
}

/**
 * Retroactively apply one tag rule to every existing transaction it matches.
 * Throws `TransactionTagRuleNotFoundError` (mapped to 404 by the REST layer)
 * when `ruleId` doesn't exist. A disabled rule or a rule with no tags to
 * apply is a no-op — it can't retroactively add anything.
 */
export function applyTagRuleToExistingTransactions(
  db: FinanceDb,
  ruleId: string,
  options: { dryRun?: boolean } = {}
): TagRuleRetroactiveResult {
  const dryRun = options.dryRun ?? false;
  const result: TagRuleRetroactiveResult = { dryRun, matched: 0, updated: 0, skippedManual: 0 };

  const rule = transactionTagRulesService.getTransactionTagRule(db, ruleId);
  const ruleTags = parseStoredTags(rule.tags);
  if (!rule.isActive || ruleTags.length === 0) return result;

  const { describeForMatching } = transactionCorrectionsService;
  const scope: RuleScope = {
    descriptionPattern: rule.descriptionPattern,
    matchType: rule.matchType,
    entityId: rule.entityId,
  };

  let offset = 0;
  while (true) {
    const batch = fetchBatch(db, offset);
    if (batch.length === 0) break;

    for (const txn of batch) {
      const matchable = describeForMatching(txn.description);
      if (!ruleMatchesTransaction(scope, txn, matchable)) continue;

      result.matched++;

      if (txn.matchType === 'manual') {
        result.skippedManual++;
        continue;
      }

      const existingTags = parseStoredTags(txn.tags);
      const missing = ruleTags.filter((t) => !existingTags.includes(t));
      if (missing.length === 0) continue;

      result.updated++;
      if (dryRun) continue;

      db.update(transactions)
        .set({
          tags: JSON.stringify([...existingTags, ...missing]),
          lastEditedTime: new Date().toISOString(),
        })
        .where(eq(transactions.id, txn.id))
        .run();
      transactionTagRulesService.incrementTransactionTagRuleUsage(db, rule.id);
    }

    offset += BATCH_SIZE;
  }

  return result;
}
