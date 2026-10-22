/**
 * Inventory documents read/write surface over `documentsService` (src/db).
 *
 * Typed errors from the db layer (`DocumentItemNotFoundError`,
 * `DocumentConflictError`, `DocumentNotFoundError`,
 * `DocumentCreateFailedError`, `DocumentIngestionNotFoundError`) are translated to the in-tree
 * `NotFoundError` / `ConflictError` so the REST error-mapping layer
 * turns them into 404/409.
 */
import {
  DocumentConflictError,
  DocumentCreateFailedError,
  documentIngestionsService,
  DocumentIngestionNotFoundError,
  DocumentItemNotFoundError,
  DocumentNotFoundError,
  documentsService,
  type CreateIngestionInput,
  type InventoryDb,
  type ItemDocumentIngestionRow,
  type UpdateDocumentInput,
} from '../../../db/index.js';
import { ConflictError, NotFoundError } from '../../shared/errors.js';

import type { DocumentType, ItemDocumentRow } from './types.js';

export interface DocumentListResult {
  rows: ItemDocumentRow[];
  total: number;
}

function translate<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof DocumentItemNotFoundError) {
      throw new NotFoundError('Inventory item', err.id);
    }
    if (err instanceof DocumentIngestionNotFoundError) {
      throw new NotFoundError('Item document ingestion', String(err.id));
    }
    if (err instanceof DocumentNotFoundError) {
      throw new NotFoundError('Item document link', String(err.id));
    }
    if (err instanceof DocumentConflictError) {
      throw new ConflictError(err.message);
    }
    if (err instanceof DocumentCreateFailedError) {
      throw new NotFoundError('Item document link', `${err.itemId}-${err.paperlessDocumentId}`);
    }
    throw err;
  }
}

export interface LinkDocumentInput {
  itemId: string;
  paperlessDocumentId: number;
  documentType: DocumentType;
  title?: string;
}

/**
 * Validates the item exists and the (item, document) pair is not already linked.
 */
export function linkDocument(db: InventoryDb, input: LinkDocumentInput): ItemDocumentRow {
  return translate(() =>
    documentsService.link(db, {
      itemId: input.itemId,
      paperlessDocumentId: input.paperlessDocumentId,
      documentType: input.documentType,
      title: input.title ?? null,
    })
  );
}

export function unlinkDocument(db: InventoryDb, id: number): void {
  translate(() => documentsService.unlink(db, id));
}

export function listDocumentsForItem(
  db: InventoryDb,
  itemId: string,
  limit: number,
  offset: number
): DocumentListResult {
  return documentsService.listForItem(db, itemId, limit, offset);
}

/** One link by id; 404 when absent. */
export function getDocument(db: InventoryDb, id: number): ItemDocumentRow {
  return translate(() => documentsService.get(db, id));
}

/** Change the given fields of a link; 404 when absent. */
export function updateDocument(
  db: InventoryDb,
  id: number,
  input: UpdateDocumentInput
): ItemDocumentRow {
  return translate(() => documentsService.update(db, id, input));
}

/** Whether the item exists. */
export function itemExists(db: InventoryDb, itemId: string): boolean {
  return documentIngestionsService.itemExists(db, itemId);
}

/** Record an accepted upload as pending; 404 when the item is gone. */
export function createIngestion(
  db: InventoryDb,
  input: CreateIngestionInput
): ItemDocumentIngestionRow {
  return translate(() => documentIngestionsService.create(db, input));
}

/** Every pending and failed upload of one item. */
export function listIngestionsForItem(db: InventoryDb, itemId: string): ItemDocumentIngestionRow[] {
  return documentIngestionsService.listForItem(db, itemId);
}

/** Dismiss a pending or failed upload; 404 when absent. */
export function dismissIngestion(db: InventoryDb, id: number): void {
  translate(() => documentIngestionsService.dismiss(db, id));
}
