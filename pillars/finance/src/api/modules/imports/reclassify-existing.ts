/**
 * Retroactive correction-rule application.
 *
 * `reclassifyExistingTransactions` re-classifies pre-existing transactions
 * against the full active rule set after every import commit (US-04),
 * excluding the just-imported batch by checksum. Ported from the monolith
 * `lib/reclassify-existing.ts`, db-injected. Matching reuses the corrections
 * module's pure `findMatchingCorrectionFromRules`, and only review-free
 * matches are applied: retroactive changes pass the same
 * `resolveCorrectionApplyStatus` gate as live import, so an `uncertain`
 * (entity-less purchase — no merchant resolved yet, ADR-053) match is skipped
 * rather than silently written without review. A changed row merges the winning rule's
 * tags in (additive-only) and stamps match provenance (`matchType: 'learned'`,
 * `matchRuleId`, `matchConfidence`) — mirroring the live-import path
 * (`apply-learned-correction.ts`, CF057/#3658) so a retroactively-classified
 * row is indistinguishable from one classified at import time. Every rule
 * that produces at least one change has its `timesApplied`/`lastUsedAt`
 * bumped once per pass, by the number of rows it actually changed — see
 * {@link reclassifyExistingTransactions} for how that count is aggregated.
 *
 * `applyCorrectionRuleToExistingTransactions` is the single-rule, explicit-apply
 * counterpart (#3660), invoked on demand from `POST /corrections/:id/apply-existing`
 * rather than on every import commit. It shares the same matching/skip rules
 * and the same tag-merge/provenance/usage-bump behaviour, scoped to one
 * target rule.
 *
 * A row whose `matchType` is `manual` (a direct PATCH touched a classification
 * field — see `transactions.ts`'s `buildTransactionUpdates`) is skipped
 * entirely by both: the user's hand-fix must survive a future import's rule
 * set instead of being silently reverted (CF017/#3623).
 *
 * What a rule would change about a single row lives in `retroactive-updates.ts`
 * — pure, no database, no batching. This file is the two passes: fetching rows,
 * driving those builders, writing the result and tallying rule usage. See that
 * file's header for why the seam is worth keeping (POPS-3068).
 */
import { asc, eq, notInArray } from 'drizzle-orm';

import {
  type FinanceDb,
  transactionCorrections,
  transactionCorrectionsService,
  transactions,
} from '../../../db/index.js';
import {
  type CorrectionRow,
  findMatchingCorrectionFromRules,
  resolveCorrectionApplyStatus,
} from '../corrections/index.js';
import { type BatchTxn, buildRetroactiveApplyUpdates } from './retroactive-updates.js';

const RECLASSIFY_BATCH_SIZE = 500;

function fetchBatch(db: FinanceDb, excludedChecksums: string[], offset: number): BatchTxn[] {
  let batchQuery = db
    .select({
      id: transactions.id,
      description: transactions.description,
      // Selected so the retroactive pass narrows to the same account scope the
      // live import does — a rule scoped to one account must not be replayed
      // across the whole ledger (POPS-2593).
      accountId: transactions.accountId,
      amountCents: transactions.amountCents,
      entityId: transactions.entityId,
      type: transactions.type,
      location: transactions.location,
      tags: transactions.tags,
      matchType: transactions.matchType,
    })
    .from(transactions)
    .$dynamic();

  if (excludedChecksums.length > 0) {
    batchQuery = batchQuery.where(notInArray(transactions.checksum, excludedChecksums));
  }

  return batchQuery.orderBy(asc(transactions.id)).limit(RECLASSIFY_BATCH_SIZE).offset(offset).all();
}

function loadActiveCorrectionRules(db: FinanceDb): CorrectionRow[] {
  return db
    .select()
    .from(transactionCorrections)
    .where(eq(transactionCorrections.isActive, true))
    .orderBy(asc(transactionCorrections.priority), asc(transactionCorrections.id))
    .all();
}

/**
 * Re-evaluate every existing transaction (excluding the current import batch)
 * against the current rule set; apply and count the ones whose classification
 * changed.
 *
 * Each changed row's winning rule is tallied in `appliedCounts` instead of
 * bumping `timesApplied` inline — after the full batch scan finishes, each
 * rule that produced at least one change gets exactly one
 * `incrementTransactionCorrectionUsage` call carrying its total, rather than
 * one call per row. Since usage is only tallied for rows a rule actually
 * changed, a second pass with nothing left to change writes nothing and
 * bumps no rule's usage.
 */
export function reclassifyExistingTransactions(db: FinanceDb, importedChecksums: string[]): number {
  const allRules = loadActiveCorrectionRules(db);
  if (allRules.length === 0) return 0;

  let reclassified = 0;
  let offset = 0;
  const appliedCounts = new Map<string, number>();

  while (true) {
    const batch = fetchBatch(db, importedChecksums, offset);
    if (batch.length === 0) break;

    for (const txn of batch) {
      if (txn.matchType === 'manual') continue;
      const match = findMatchingCorrectionFromRules(txn.description, allRules, txn.accountId);
      if (!match) continue;
      if (resolveCorrectionApplyStatus(match.correction) !== 'matched') continue;
      const updates = buildRetroactiveApplyUpdates(txn, match.correction);
      if (!updates) continue;
      db.update(transactions).set(updates).where(eq(transactions.id, txn.id)).run();
      reclassified++;
      appliedCounts.set(match.correction.id, (appliedCounts.get(match.correction.id) ?? 0) + 1);
    }

    offset += RECLASSIFY_BATCH_SIZE;
  }

  for (const [ruleId, count] of appliedCounts) {
    transactionCorrectionsService.incrementTransactionCorrectionUsage(db, ruleId, count);
  }

  return reclassified;
}

/** Outcome of a single-rule retroactive apply — see {@link applyCorrectionRuleToExistingTransactions}. */
export interface CorrectionRuleRetroactiveResult {
  dryRun: boolean;
  /** Transactions where this rule is the winning match, including ones skipped below. */
  matched: number;
  /** Of `matched`, the ones actually written (or that would be, under `dryRun`). */
  updated: number;
  /** Of `matched`, skipped because the transaction carries a manual override. */
  skippedManual: number;
  /** Of `matched`, skipped because the rule's classification is uncertain (needs review). */
  skippedUncertain: number;
}

interface SingleRuleApplyArgs {
  db: FinanceDb;
  ruleId: string;
  dryRun: boolean;
  allRules: CorrectionRow[];
  result: CorrectionRuleRetroactiveResult;
}

/** One transaction's outcome against the single targeted rule; mutates `args.result`. */
function applySingleRuleToTxn(args: SingleRuleApplyArgs, txn: BatchTxn): void {
  const { db, ruleId, dryRun, allRules, result } = args;

  const match = findMatchingCorrectionFromRules(txn.description, allRules, txn.accountId);
  if (!match || match.correction.id !== ruleId) return;

  result.matched++;

  if (txn.matchType === 'manual') {
    result.skippedManual++;
    return;
  }
  if (resolveCorrectionApplyStatus(match.correction) !== 'matched') {
    result.skippedUncertain++;
    return;
  }

  const updates = buildRetroactiveApplyUpdates(txn, match.correction);
  if (!updates) return;

  result.updated++;
  if (dryRun) return;

  db.update(transactions).set(updates).where(eq(transactions.id, txn.id)).run();
  transactionCorrectionsService.incrementTransactionCorrectionUsage(db, match.correction.id);
}

/**
 * Retroactively apply one correction rule to every existing transaction it
 * currently wins against (US-04/#3660 — the explicit, single-rule counterpart
 * to {@link reclassifyExistingTransactions}'s whole-rule-set catch-up).
 *
 * Matching still runs against the full active rule set so priority ordering
 * is respected: a transaction only counts toward this rule when it is the
 * highest-priority match, exactly as at import time. `dryRun` computes the
 * same result without writing anything or bumping `rule.timesApplied` — a
 * preview must never count as usage.
 */
export function applyCorrectionRuleToExistingTransactions(
  db: FinanceDb,
  ruleId: string,
  options: { dryRun?: boolean } = {}
): CorrectionRuleRetroactiveResult {
  const dryRun = options.dryRun ?? false;
  const result: CorrectionRuleRetroactiveResult = {
    dryRun,
    matched: 0,
    updated: 0,
    skippedManual: 0,
    skippedUncertain: 0,
  };

  const targetRule = transactionCorrectionsService.getTransactionCorrection(db, ruleId);
  if (!targetRule.isActive) return result;

  const allRules = loadActiveCorrectionRules(db);
  const applyArgs: SingleRuleApplyArgs = { db, ruleId, dryRun, allRules, result };

  let offset = 0;
  while (true) {
    const batch = fetchBatch(db, [], offset);
    if (batch.length === 0) break;

    for (const txn of batch) applySingleRuleToTxn(applyArgs, txn);

    offset += RECLASSIFY_BATCH_SIZE;
  }

  return result;
}
