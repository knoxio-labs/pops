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
 *
 * The four writers take an optional `actor`. Given one, they append one row to
 * the audit log (`transaction-events.ts`) inside the same database transaction
 * as the change, so neither commits without the other. Without one they write
 * no event, which is every caller that is not a person editing an entry.
 */
import { eq } from 'drizzle-orm';

import { isPositiveAmountPurchase } from '../../contract/corrections-constants.js';
import {
  PositiveAmountPurchaseError,
  TransactionAlreadyExistsError,
  TransactionNotFoundError,
} from '../errors.js';
import { assertTagsWithinFacetCardinality } from '../facet-cardinality-guard.js';
import { assertNoFeeTagsOnNonFeeType } from '../fee-tag-guard.js';
import { transactions } from '../schema.js';
import { parseStoredTags } from '../tag-facets.js';
import { getAccount } from './accounts.js';
import { applyVocabularyUsageDelta } from './tag-vocabulary.js';
import {
  recordTransactionEvent,
  type TransactionActor,
  type TransactionEventInput,
} from './transaction-events.js';
import {
  assertPatchStaysCoherent,
  buildTransactionUpdates,
  type UpdateTransactionInput,
} from './transaction-patch.js';

import type { TransactionType } from '../../contract/corrections-constants.js';
import type { TransactionEventAction } from '../schema/transaction-events.js';
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

export type { UpdateTransactionInput } from './transaction-patch.js';

/**
 * The list read lives in `transactions-list.js` — its ordering and its keyset
 * anchor are one idea and must be read together. Re-exported so
 * `transactionsService.listTransactions` stays one import for callers.
 */
export { listTransactions } from './transactions-list.js';
export type { TransactionFilters, TransactionListResult } from './transactions-list.js';

function audit(
  tx: FinanceDb,
  action: TransactionEventAction,
  actor: TransactionActor | undefined,
  rows: Pick<TransactionEventInput, 'before' | 'after'>
): void {
  if (actor !== undefined) recordTransactionEvent(tx, { action, actor, ...rows });
}

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
export function createTransaction(
  db: FinanceDb,
  input: CreateTransactionInput,
  actor?: TransactionActor
): TransactionRow {
  const type = input.type ?? 'purchase';
  if (isPositiveAmountPurchase(input.amountCents, type)) {
    throw new PositiveAmountPurchaseError(input.amountCents);
  }

  const tags = input.tags ?? [];
  assertTagsWithinFacetCardinality(tags);
  assertNoFeeTagsOnNonFeeType(type, tags);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const accountId = getAccount(db, input.accountId).id;

  db.transaction((tx) => {
    tx.insert(transactions)
      .values({
        id,
        description: input.description,
        accountId,
        amountCents: input.amountCents,
        date: input.date,
        type,
        tags: JSON.stringify(tags),
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
    applyVocabularyUsageDelta(tx, [], tags);
    audit(tx, 'create', actor, { before: null, after: getTransaction(tx, id) });
  });

  return getTransaction(db, id);
}

/**
 * Patch a transaction. Throws `TransactionNotFoundError` if missing.
 * No-op writes (empty `input`) still re-read the row but skip the UPDATE, and
 * so record no event either.
 */
export function updateTransaction(
  db: FinanceDb,
  id: string,
  input: UpdateTransactionInput,
  actor?: TransactionActor
): TransactionRow {
  const stored = getTransaction(db, id);
  assertPatchStaysCoherent(stored, input);

  const updates = buildTransactionUpdates(db, input);
  if (Object.keys(updates).length > 0) {
    updates.lastEditedTime = new Date().toISOString();
    db.transaction((tx) => {
      tx.update(transactions).set(updates).where(eq(transactions.id, id)).run();
      if (input.tags !== undefined) {
        applyVocabularyUsageDelta(tx, parseStoredTags(stored.tags), input.tags);
      }
      audit(tx, 'update', actor, { before: stored, after: getTransaction(tx, id) });
    });
  }

  return getTransaction(db, id);
}

/**
 * Delete a transaction by id. Throws `TransactionNotFoundError` if missing.
 *
 * Returns the deleted row snapshot so a caller can hand it to
 * `restoreTransaction` for an Undo flow.
 */
export function deleteTransaction(
  db: FinanceDb,
  id: string,
  actor?: TransactionActor
): TransactionRow {
  const snapshot = getTransaction(db, id);

  db.transaction((tx) => {
    const result = tx.delete(transactions).where(eq(transactions.id, id)).run();
    if (result.changes === 0) throw new TransactionNotFoundError(id);
    applyVocabularyUsageDelta(tx, parseStoredTags(snapshot.tags), []);
    audit(tx, 'delete', actor, { before: snapshot, after: null });
  });

  return snapshot;
}

/**
 * Restore a previously-deleted transaction from a server-issued snapshot.
 *
 * Re-inserts preserving the original id, checksum, raw_row, and notion_id
 * so dedup metadata is intact. Throws `TransactionAlreadyExistsError` if a
 * row with the same id is already present (caller should handle that case).
 */
export function restoreTransaction(
  db: FinanceDb,
  snapshot: TransactionRow,
  actor?: TransactionActor
): TransactionRow {
  const existing = db.select().from(transactions).where(eq(transactions.id, snapshot.id)).get();
  if (existing) {
    throw new TransactionAlreadyExistsError(snapshot.id);
  }
  db.transaction((tx) => {
    tx.insert(transactions).values(snapshot).run();
    applyVocabularyUsageDelta(tx, [], parseStoredTags(snapshot.tags));
    audit(tx, 'restore', actor, { before: null, after: getTransaction(tx, snapshot.id) });
  });
  return getTransaction(db, snapshot.id);
}

export {
  type ChangeSetPreviewScanRow,
  type DescriptionPreviewResult,
  type DescriptionPreviewRow,
  getLastImportInfo,
  type LastImportInfo,
  listAllTransactionsForChangeSetPreview,
  listDescriptionsForPreview,
} from './transactions-reads.js';
