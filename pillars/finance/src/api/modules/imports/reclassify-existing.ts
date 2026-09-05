/**
 * Retroactive correction-rule application.
 *
 * `reclassifyExistingTransactions` re-classifies pre-existing transactions
 * against the full active rule set after every import commit (US-04),
 * excluding the just-imported batch by checksum. Ported from the monolith
 * `lib/reclassify-existing.ts`, db-injected. Matching reuses the corrections
 * module's pure `findMatchingCorrectionFromRules`, and only high-confidence,
 * review-free matches are applied: retroactive changes pass the same
 * `resolveCorrectionApplyStatus` gate as live import, so an `uncertain`
 * (sub-threshold, or entity-less purchase) match is skipped rather than
 * silently written without review. A changed row merges the winning rule's
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
  normalizeEntityId,
  parseCorrectionTags,
  resolveCorrectionApplyStatus,
} from '../corrections/index.js';

const RECLASSIFY_BATCH_SIZE = 500;

interface BatchTxn {
  id: string;
  description: string;
  accountId: string;
  entityId: string | null;
  type: string;
  location: string | null;
  tags: string;
  matchType: string | null;
}

/**
 * The entity a rule would newly assign, or `null` when it must be left alone.
 *
 * Only rules that carry an entity of their own can change one, and only when it
 * differs — so an entity-less transfer/income rule can never null out a
 * transaction's correctly-assigned merchant (the CF006 regression).
 */
function providedEntityChange(
  txn: BatchTxn,
  rule: CorrectionRow
): { entityId: string; entityName: string | null } | null {
  const ruleEntityId = normalizeEntityId(rule.entityId);
  if (ruleEntityId === null || ruleEntityId === (txn.entityId ?? null)) return null;
  return { entityId: ruleEntityId, entityName: rule.entityName ?? null };
}

/** The lowercase canonical `type` the rule would newly assign (written verbatim
 * to `transactions.type` since #3607 stage 2 — no more capitalized collapse), or
 * `null` when the rule carries no type or it already matches. */
function changedType(txn: BatchTxn, rule: CorrectionRow): string | null {
  const newType = rule.transactionType;
  return newType != null && newType !== txn.type ? newType : null;
}

function changedLocation(txn: BatchTxn, rule: CorrectionRow): string | null {
  const newLocation = rule.location ?? null;
  return newLocation !== null && newLocation !== (txn.location ?? null) ? newLocation : null;
}

/**
 * Tags the rule would add to the transaction (additive-only, never removes an
 * existing tag), or `null` when the rule carries no tags or the transaction
 * already has every one of them.
 */
function mergedTags(txn: BatchTxn, rule: CorrectionRow): string[] | null {
  const ruleTags = parseCorrectionTags(rule.tags);
  if (ruleTags.length === 0) return null;
  const existing = parseCorrectionTags(txn.tags);
  const missing = ruleTags.filter((t) => !existing.includes(t));
  return missing.length > 0 ? [...existing, ...missing] : null;
}

/** Entity/type/location changes a rule makes, shared by every retroactive builder. */
function buildCoreFieldUpdates(txn: BatchTxn, rule: CorrectionRow): Record<string, unknown> {
  const updates: Record<string, unknown> = {};

  const entity = providedEntityChange(txn, rule);
  if (entity) {
    updates.entityId = entity.entityId;
    updates.entityName = entity.entityName;
  }

  const newType = changedType(txn, rule);
  if (newType !== null) updates.type = newType;

  const newLocation = changedLocation(txn, rule);
  if (newLocation !== null) updates.location = newLocation;

  return updates;
}

/**
 * Build the DB update for a matched rule, or `null` when nothing changed.
 * Never clears an existing entity — see {@link providedEntityChange}. Extends
 * {@link buildCoreFieldUpdates} with tag-merge (additive-only) and
 * match-provenance stamping, shared by both the always-on catch-up
 * (`reclassifyExistingTransactions`) and the single-rule explicit apply
 * (`applyCorrectionRuleToExistingTransactions`).
 */
function buildRetroactiveApplyUpdates(
  txn: BatchTxn,
  rule: CorrectionRow
): Record<string, unknown> | null {
  const updates = buildCoreFieldUpdates(txn, rule);

  const newTags = mergedTags(txn, rule);
  if (newTags !== null) updates.tags = JSON.stringify(newTags);

  if (Object.keys(updates).length === 0) return null;

  updates.matchType = 'learned';
  updates.matchRuleId = rule.id;
  updates.matchConfidence = rule.confidence;
  updates.lastEditedTime = new Date().toISOString();
  return updates;
}

function fetchBatch(db: FinanceDb, excludedChecksums: string[], offset: number): BatchTxn[] {
  let batchQuery = db
    .select({
      id: transactions.id,
      description: transactions.description,
      // Selected so the retroactive pass narrows to the same account scope the
      // live import does — a rule scoped to one account must not be replayed
      // across the whole ledger (POPS-2593).
      accountId: transactions.accountId,
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
