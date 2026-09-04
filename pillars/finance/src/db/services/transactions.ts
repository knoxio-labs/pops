/**
 * Transactions CRUD against finance's SQLite via drizzle.
 *
 * Standard service pattern: db-arg services, typed domain errors, no HTTP
 * concerns.
 *
 * The `tags` column is stored as a JSON-encoded array of strings — the
 * caller passes a `string[]` and persists `JSON.stringify(...)`. The
 * parsing back into a `string[]` is the responsibility of the API
 * presentation layer (it stays out of the persistence service so the
 * raw row shape stays Drizzle-native).
 *
 * `restoreTransaction` exists for the Undo flow: delete returns the
 * raw row snapshot, restore re-inserts it preserving the original `id`,
 * `checksum`, `rawRow`, and `notionId` so dedup metadata is intact and
 * any downstream link that still points at the original id resolves
 * again.
 */
import { eq } from 'drizzle-orm';

import { TransactionAlreadyExistsError, TransactionNotFoundError } from '../errors.js';
import { transactions } from '../schema.js';
import { getAccount } from './accounts.js';

import type { TransactionType } from '../../contract/corrections-constants.js';
import type { FinanceDb, TransactionRow } from './internal.js';

/** Raw drizzle row shape — exposed so callers can reuse the inferred select type. */
export type { TransactionRow };

/** Mutable subset accepted on create. `notionId` stays the import/sync layer's job. */
export interface CreateTransactionInput {
  description: string;
  /** FK to `accounts.id`. Throws `AccountNotFoundError` for an unknown id. */
  accountId: string;
  amountCents: number;
  date: string;
  type?: TransactionType | undefined;
  tags?: string[] | undefined;
  entityId?: string | null | undefined;
  entityName?: string | null | undefined;
  location?: string | null | undefined;
  country?: string | null | undefined;
  relatedTransactionId?: string | null | undefined;
  notes?: string | null | undefined;
  /** Import-only: raw CSV row for audit trail. */
  rawRow?: string | null | undefined;
  /** Import-only: checksum for dedup. */
  checksum?: string | null | undefined;
}

/** Same shape as create — all fields optional for PATCH semantics. */
export interface UpdateTransactionInput {
  description?: string;
  /** FK to `accounts.id`. Throws `AccountNotFoundError` for an unknown id. */
  accountId?: string;
  amountCents?: number;
  date?: string;
  type?: TransactionType;
  tags?: string[];
  entityId?: string | null;
  entityName?: string | null;
  location?: string | null;
  country?: string | null;
  relatedTransactionId?: string | null;
  notes?: string | null;
}

/**
 * The list read lives in `transactions-list.js` — its ordering and its keyset
 * anchor are one idea and must be read together. Re-exported so
 * `transactionsService.listTransactions` stays one import for callers.
 */
export { listTransactions } from './transactions-list.js';
export type { TransactionFilters, TransactionListResult } from './transactions-list.js';

/** Get a single transaction by id. Throws `TransactionNotFoundError` if missing. */
export function getTransaction(db: FinanceDb, id: string): TransactionRow {
  const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!row) throw new TransactionNotFoundError(id);
  return row;
}

/**
 * Create a new transaction. Generates a UUID, persists, and returns the row.
 *
 * `type` defaults to `'purchase'` (the default debit type since #3607) when the
 * caller supplies none — the column is `NOT NULL`. `tags` defaults to `[]`
 * serialised.
 */
export function createTransaction(db: FinanceDb, input: CreateTransactionInput): TransactionRow {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const accountId = getAccount(db, input.accountId).id;

  db.insert(transactions)
    .values({
      id,
      description: input.description,
      accountId,
      amountCents: input.amountCents,
      date: input.date,
      type: input.type ?? 'purchase',
      tags: JSON.stringify(input.tags ?? []),
      entityId: input.entityId ?? null,
      entityName: input.entityName ?? null,
      location: input.location ?? null,
      country: input.country ?? null,
      relatedTransactionId: input.relatedTransactionId ?? null,
      notes: input.notes ?? null,
      checksum: input.checksum ?? null,
      rawRow: input.rawRow ?? null,
      lastEditedTime: now,
    })
    .run();

  return getTransaction(db, id);
}

type TransactionUpdate = Partial<typeof transactions.$inferInsert>;

function applyCoreFields(
  db: FinanceDb,
  input: UpdateTransactionInput,
  updates: TransactionUpdate
): void {
  if (input.description !== undefined) updates.description = input.description;
  if (input.accountId !== undefined) {
    updates.accountId = getAccount(db, input.accountId).id;
  }
  if (input.amountCents !== undefined) updates.amountCents = input.amountCents;
  if (input.date !== undefined) updates.date = input.date;
  if (input.type !== undefined) updates.type = input.type;
  if (input.tags !== undefined) updates.tags = JSON.stringify(input.tags);
}

function applyEntityFields(input: UpdateTransactionInput, updates: TransactionUpdate): void {
  if (input.entityId !== undefined) updates.entityId = input.entityId ?? null;
  if (input.entityName !== undefined) updates.entityName = input.entityName ?? null;
}

function applyLocationFields(input: UpdateTransactionInput, updates: TransactionUpdate): void {
  if (input.location !== undefined) updates.location = input.location ?? null;
  if (input.country !== undefined) updates.country = input.country ?? null;
}

function applyMetadataFields(input: UpdateTransactionInput, updates: TransactionUpdate): void {
  if (input.relatedTransactionId !== undefined) {
    updates.relatedTransactionId = input.relatedTransactionId ?? null;
  }
  if (input.notes !== undefined) updates.notes = input.notes ?? null;
}

/**
 * The classification fields a direct PATCH must touch to count as a manual
 * override (CF017/#3623): doing so stamps `matchType: 'manual'` and clears
 * the stale rule-match provenance so a future reclassify pass leaves the row
 * alone instead of silently reverting the user's hand-fix.
 *
 * `buildRetroactiveApplyUpdates` (`reclassifyExistingTransactions`/
 * `applyCorrectionRuleToExistingTransactions`) also merges `tags` and stamps
 * match-provenance columns on a reclassify pass, but a `tags`-only PATCH is
 * deliberately excluded from this list: tag merging is additive-only, so
 * re-merging a rule's tags onto a row the user only re-tagged (rather than
 * reclassified) never reverts anything.
 */
const CLASSIFICATION_PATCH_FIELDS = ['entityId', 'entityName', 'type', 'location'] as const;

function touchesClassificationFields(input: UpdateTransactionInput): boolean {
  return CLASSIFICATION_PATCH_FIELDS.some((field) => input[field] !== undefined);
}

function buildTransactionUpdates(db: FinanceDb, input: UpdateTransactionInput): TransactionUpdate {
  const updates: TransactionUpdate = {};
  applyCoreFields(db, input, updates);
  applyEntityFields(input, updates);
  applyLocationFields(input, updates);
  applyMetadataFields(input, updates);
  if (touchesClassificationFields(input)) {
    updates.matchType = 'manual';
    updates.matchRuleId = null;
    updates.matchConfidence = null;
  }
  return updates;
}

/**
 * Patch a transaction. Throws `TransactionNotFoundError` if missing.
 * No-op writes (empty `input`) still re-read the row but skip the UPDATE.
 */
export function updateTransaction(
  db: FinanceDb,
  id: string,
  input: UpdateTransactionInput
): TransactionRow {
  getTransaction(db, id);

  const updates = buildTransactionUpdates(db, input);
  if (Object.keys(updates).length > 0) {
    updates.lastEditedTime = new Date().toISOString();
    db.update(transactions).set(updates).where(eq(transactions.id, id)).run();
  }

  return getTransaction(db, id);
}

/**
 * Delete a transaction by id. Throws `TransactionNotFoundError` if missing.
 *
 * Returns the deleted row snapshot so a caller can hand it to
 * `restoreTransaction` for an Undo flow.
 */
export function deleteTransaction(db: FinanceDb, id: string): TransactionRow {
  const snapshot = getTransaction(db, id);

  const result = db.delete(transactions).where(eq(transactions.id, id)).run();
  if (result.changes === 0) throw new TransactionNotFoundError(id);
  return snapshot;
}

/**
 * Restore a previously-deleted transaction from a server-issued snapshot.
 *
 * Re-inserts preserving the original id, checksum, raw_row, and notion_id
 * so dedup metadata is intact. Throws `TransactionAlreadyExistsError` if a
 * row with the same id is already present (caller should handle that case).
 */
export function restoreTransaction(db: FinanceDb, snapshot: TransactionRow): TransactionRow {
  const existing = db.select().from(transactions).where(eq(transactions.id, snapshot.id)).get();
  if (existing) {
    throw new TransactionAlreadyExistsError(snapshot.id);
  }
  db.insert(transactions).values(snapshot).run();
  return getTransaction(db, snapshot.id);
}

export {
  collectAvailableTags,
  type DescriptionPreviewResult,
  type DescriptionPreviewRow,
  getLastImportInfo,
  type LastImportInfo,
  listDescriptionsForPreview,
} from './transactions-reads.js';
