/**
 * Retroactive tag-rule application (#3660): given an already-persisted tag
 * rule, find every existing transaction it matches and merge the rule's tags
 * into that transaction's `tags` column — the catch-up pass a rule created or
 * edited after those transactions were imported never got.
 *
 * Additive only: never removes a tag the transaction already carries, and a
 * transaction that already carries every one of the rule's tags is left
 * untouched, which is what makes a second run against the same rule a no-op
 * (idempotent).
 *
 * Additive is also the one operation `single: true` cannot survive unaided —
 * a merge cannot overwrite, so a rule asserting `venue:supermarket` over a row
 * already reading `venue:cafe` would store both and take the axis out of
 * service. Such a value is refused and logged, matching what the AI write path
 * already does through the same `exceedsFacetCardinality`. This runs on every
 * caller, including the `tagRules.applyExisting` endpoint, not just the
 * reviewed one-off backfills.
 *
 * It does NOT skip a `matchType: 'manual'` row (POPS-2662). That marker is
 * stamped when a PATCH touches `entityId`/`entityName`/`type`/`location` — it
 * says the user fixed the *classification*, not that they curated the tags —
 * and `transactions.ts` already argues the case above `CLASSIFICATION_PATCH_FIELDS`:
 * additive tag merging "never reverts anything", which is why a tags-only PATCH
 * does not set the marker in the first place. The correction-rule counterpart
 * does still skip manual rows, and correctly: it rewrites the classification,
 * which is exactly what a hand-fix needs protecting from.
 *
 * The guard cost 23 of 106 matched rows on POPS-2607's merchant backfill, and
 * all 15 rows of its Amazon `enrich:` marking — disproportionately the rows a
 * human had touched, which are the ones most likely to be under-tagged.
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
import { mergeTagsWithinFacetLimits, parseStoredTags } from '../../../db/tag-facets.js';

import type { MatchableDescription } from '../../../contract/pattern-match.js';

const BATCH_SIZE = 500;

/**
 * `existing` plus every rule tag that can join it — dropping any that would be
 * a second value on a single-valued facet, and saying so.
 */
function mergeTags(
  existing: readonly string[],
  ruleTags: readonly string[],
  ruleId: string,
  transactionId: string
): string[] {
  const { tags, dropped } = mergeTagsWithinFacetLimits(existing, ruleTags);
  for (const tag of dropped) {
    console.warn(
      `[tag-rules] rule ${ruleId} not applying ${JSON.stringify(tag)} to transaction ` +
        `${transactionId}: the row already carries a value on that single-valued facet`
    );
  }
  return tags;
}

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
  /**
   * Always 0 since POPS-2662 — a manual classification fix no longer blocks an
   * additive tag merge. Kept because the field is in the published REST
   * response; removing it is a contract change with a codegen fan-out, and
   * belongs in its own edit rather than a data fix.
   */
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

      const existingTags = parseStoredTags(txn.tags);
      const merged = mergeTags(existingTags, ruleTags, rule.id, txn.id);
      if (merged.length === existingTags.length) continue;

      result.updated++;
      if (dryRun) continue;

      db.update(transactions)
        .set({
          tags: JSON.stringify(merged),
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
