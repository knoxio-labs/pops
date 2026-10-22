/**
 * Item document ingestions — uploads handed to Paperless whose consumption
 * task has not produced a linked document yet.
 *
 * A row is `pending` until its task resolves. A task that produced a
 * document (new or a duplicate of an existing one) turns the row into an
 * `item_documents` link in one transaction; a task that failed keeps the row
 * as `failed`, with its reason, until someone dismisses it.
 */
import { and, asc, eq, isNull } from 'drizzle-orm';

import { itemDocumentIngestions, itemDocuments, items } from '../schema.js';
import { DocumentItemNotFoundError } from './documents-errors.js';

import type { ItemDocumentIngestionRow } from '../row-types.js';
import type { DocumentType } from './documents-types.js';
import type { InventoryDb } from './internal.js';

export type { ItemDocumentIngestionRow };

/** Raised when no ingestion row has the given id. */
export class DocumentIngestionNotFoundError extends Error {
  override readonly name = 'DocumentIngestionNotFoundError' as const;
  readonly id: number;

  constructor(id: number) {
    super(`Item document ingestion '${id}' not found`);
    this.id = id;
  }
}

/** What an accepted upload records while Paperless consumes it. */
export interface CreateIngestionInput {
  itemId: string;
  taskId: string;
  documentType: DocumentType;
  title: string | null;
  fileName: string;
}

/**
 * How {@link complete} settled a pending row: `linked` inserted the link,
 * `already-linked` found the pair linked and only removed the row, `gone`
 * found no pending row (another resolver got there first, or it was dismissed).
 */
export type IngestionCompletion = 'linked' | 'already-linked' | 'gone';

/**
 * Whether the item exists and is not tombstoned; the upload route asks
 * before forwarding any bytes.
 */
export function itemExists(db: InventoryDb, itemId: string): boolean {
  const [row] = db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.id, itemId), isNull(items.deletedAt)))
    .all();
  return row !== undefined;
}

/**
 * Record a pending ingestion. Throws `DocumentItemNotFoundError` when the
 * item is gone or tombstoned.
 */
export function create(db: InventoryDb, input: CreateIngestionInput): ItemDocumentIngestionRow {
  if (!itemExists(db, input.itemId)) throw new DocumentItemNotFoundError(input.itemId);
  const [row] = db
    .insert(itemDocumentIngestions)
    .values({ ...input, state: 'pending' })
    .returning()
    .all();
  if (!row) throw new DocumentItemNotFoundError(input.itemId);
  return row;
}

/** Every pending row, or only the given item's, oldest first. */
export function listPending(db: InventoryDb, itemId?: string): ItemDocumentIngestionRow[] {
  const pending = eq(itemDocumentIngestions.state, 'pending');
  return db
    .select()
    .from(itemDocumentIngestions)
    .where(itemId === undefined ? pending : and(pending, eq(itemDocumentIngestions.itemId, itemId)))
    .orderBy(asc(itemDocumentIngestions.id))
    .all();
}

/** Every row (pending and failed) for one item, oldest first. */
export function listForItem(db: InventoryDb, itemId: string): ItemDocumentIngestionRow[] {
  return db
    .select()
    .from(itemDocumentIngestions)
    .where(eq(itemDocumentIngestions.itemId, itemId))
    .orderBy(asc(itemDocumentIngestions.id))
    .all();
}

/**
 * Turn a pending row into a link to `paperlessDocumentId`, in one
 * transaction. The link's title is the ingestion's, falling back to the file
 * name. Safe to call twice for the same row: the second call finds it gone.
 */
export function complete(
  db: InventoryDb,
  id: number,
  paperlessDocumentId: number
): IngestionCompletion {
  return db.transaction((tx) => {
    const [row] = tx
      .delete(itemDocumentIngestions)
      .where(and(eq(itemDocumentIngestions.id, id), eq(itemDocumentIngestions.state, 'pending')))
      .returning()
      .all();
    if (!row) return 'gone';
    const [linked] = tx
      .select({ id: itemDocuments.id })
      .from(itemDocuments)
      .where(
        and(
          eq(itemDocuments.itemId, row.itemId),
          eq(itemDocuments.paperlessDocumentId, paperlessDocumentId)
        )
      )
      .all();
    if (linked) return 'already-linked';
    tx.insert(itemDocuments)
      .values({
        itemId: row.itemId,
        paperlessDocumentId,
        documentType: row.documentType,
        title: row.title ?? row.fileName,
      })
      .run();
    return 'linked';
  });
}

/** Mark a pending row failed with Paperless's reason. A row no longer pending is left alone. */
export function markFailed(db: InventoryDb, id: number, reason: string): void {
  db.update(itemDocumentIngestions)
    .set({ state: 'failed', reason })
    .where(and(eq(itemDocumentIngestions.id, id), eq(itemDocumentIngestions.state, 'pending')))
    .run();
}

/** Delete a row, pending or failed. Throws `DocumentIngestionNotFoundError` when absent. */
export function dismiss(db: InventoryDb, id: number): void {
  const [row] = db
    .delete(itemDocumentIngestions)
    .where(eq(itemDocumentIngestions.id, id))
    .returning({ id: itemDocumentIngestions.id })
    .all();
  if (!row) throw new DocumentIngestionNotFoundError(id);
}
