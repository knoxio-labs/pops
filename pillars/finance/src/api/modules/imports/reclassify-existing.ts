/**
 * Retroactively re-classify pre-existing transactions against the updated rule
 * set after a commit (US-04). Excludes the just-imported batch by checksum.
 *
 * Ported from the monolith `lib/reclassify-existing.ts`, db-injected. Matching
 * reuses the corrections module's pure `findMatchingCorrectionFromRules`, and
 * only high-confidence, review-free matches are applied: retroactive changes
 * pass the same `resolveCorrectionApplyStatus` gate as live import, so an
 * `uncertain` (sub-threshold, or entity-less purchase) match is skipped rather
 * than silently written without review.
 */
import { asc, eq, notInArray } from 'drizzle-orm';

import { type FinanceDb, transactionCorrections, transactions } from '../../../db/index.js';
import {
  type CorrectionRow,
  findMatchingCorrectionFromRules,
  normalizeEntityId,
  resolveCorrectionApplyStatus,
} from '../corrections/index.js';

const RECLASSIFY_BATCH_SIZE = 500;

interface BatchTxn {
  id: string;
  description: string;
  entityId: string | null;
  type: string;
  location: string | null;
}

function deriveNewType(ruleType: string | null): 'Transfer' | 'Income' | 'Expense' | null {
  if (!ruleType) return null;
  if (ruleType === 'transfer') return 'Transfer';
  if (ruleType === 'income') return 'Income';
  return 'Expense';
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

function changedType(txn: BatchTxn, rule: CorrectionRow): 'Transfer' | 'Income' | 'Expense' | null {
  const newType = deriveNewType(rule.transactionType);
  return newType !== null && newType !== txn.type ? newType : null;
}

function changedLocation(txn: BatchTxn, rule: CorrectionRow): string | null {
  const newLocation = rule.location ?? null;
  return newLocation !== null && newLocation !== (txn.location ?? null) ? newLocation : null;
}

/**
 * Build the DB update for a matched rule, or `null` when nothing changed. Never
 * clears an existing entity — see {@link providedEntityChange}.
 */
function buildReclassifyUpdates(
  txn: BatchTxn,
  rule: CorrectionRow
): Record<string, unknown> | null {
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

  if (Object.keys(updates).length === 0) return null;
  updates.lastEditedTime = new Date().toISOString();
  return updates;
}

function fetchBatch(db: FinanceDb, importedChecksums: string[], offset: number): BatchTxn[] {
  let batchQuery = db
    .select({
      id: transactions.id,
      description: transactions.description,
      entityId: transactions.entityId,
      type: transactions.type,
      location: transactions.location,
    })
    .from(transactions)
    .$dynamic();

  if (importedChecksums.length > 0) {
    batchQuery = batchQuery.where(notInArray(transactions.checksum, importedChecksums));
  }

  return batchQuery.orderBy(asc(transactions.id)).limit(RECLASSIFY_BATCH_SIZE).offset(offset).all();
}

/**
 * Re-evaluate every existing transaction (excluding the current import batch)
 * against the current rule set; apply and count the ones whose classification
 * changed.
 */
export function reclassifyExistingTransactions(db: FinanceDb, importedChecksums: string[]): number {
  const allRules = db
    .select()
    .from(transactionCorrections)
    .orderBy(asc(transactionCorrections.priority), asc(transactionCorrections.id))
    .all();

  if (allRules.length === 0) return 0;

  let reclassified = 0;
  let offset = 0;

  while (true) {
    const batch = fetchBatch(db, importedChecksums, offset);
    if (batch.length === 0) break;

    for (const txn of batch) {
      const match = findMatchingCorrectionFromRules(txn.description, allRules);
      if (!match) continue;
      if (resolveCorrectionApplyStatus(match.correction) !== 'matched') continue;
      const updates = buildReclassifyUpdates(txn, match.correction);
      if (!updates) continue;
      db.update(transactions).set(updates).where(eq(transactions.id, txn.id)).run();
      reclassified++;
    }

    offset += RECLASSIFY_BATCH_SIZE;
  }

  return reclassified;
}
