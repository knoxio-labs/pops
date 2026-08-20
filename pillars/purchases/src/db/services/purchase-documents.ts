/**
 * Writes to `purchase_documents`, for both the order that is being created
 * and the order that already exists.
 *
 * The create path can only ever carry the evidence that arrived with the
 * order. Evidence routinely arrives later — a DSAR bundle's tax invoices are
 * read from a different folder than its order history, and the order history
 * is what gets ingested first — so an order that is already in the database
 * needs a way to be given a document without being deleted and rebuilt.
 *
 * Both paths land through {@link insertPurchaseDocument}, so the row an
 * attach writes is the row an ingest writes and `kind` cannot default one way
 * here and another way there.
 */
import { and, eq } from 'drizzle-orm';

import { DocumentAlreadyAttachedError, PurchaseNotFoundError } from '../errors.js';
import { purchaseDocuments, purchases } from '../schema.js';
import { expectRow, nowIso, type PurchasesDb } from './internal.js';

import type { DocumentKind } from '../../contract/constants.js';
import type { PurchaseDocumentRow } from '../schema.js';

/** The values a `purchase_documents` row is built from, with nothing defaulted. */
export interface PurchaseDocumentValues {
  readonly purchaseId: string;
  readonly shipmentId: string | null;
  readonly documentUri: string;
  readonly kind: DocumentKind;
  readonly createdAt: string;
}

/** The one insert into `purchase_documents`. */
export function insertPurchaseDocument(
  tx: PurchasesDb,
  values: PurchaseDocumentValues
): PurchaseDocumentRow {
  const rows = tx.insert(purchaseDocuments).values(values).returning().all();
  return expectRow(rows, 'insertPurchaseDocument');
}

export interface AttachDocumentInput {
  readonly documentUri: string;
  readonly kind?: DocumentKind;
}

/**
 * Attach one document to an order that already exists.
 *
 * @throws {@link PurchaseNotFoundError} when no such order is here — checked
 *   rather than left to the foreign key, which reports the same mistake as a
 *   conflict against stored data and gives the caller no way to tell a
 *   mistyped order id from a URI that is already on the right one.
 * @throws {@link DocumentAlreadyAttachedError} when the order already carries
 *   that URI. A backfill re-run is expected to land here for every document
 *   it attached last time, which is what makes running it twice a no-op.
 *
 * The read and the write are in one transaction, so the pre-check cannot be
 * overtaken between deciding and inserting. `uq_purchase_documents` is still
 * the guarantee — this only decides which error describes the collision.
 */
export function attachDocument(
  db: PurchasesDb,
  purchaseId: string,
  input: AttachDocumentInput
): PurchaseDocumentRow {
  return db.transaction((tx) => {
    const order = tx
      .select({ id: purchases.id })
      .from(purchases)
      .where(eq(purchases.id, purchaseId))
      .limit(1)
      .get();
    if (order === undefined) throw new PurchaseNotFoundError(purchaseId);

    const existing = tx
      .select({ id: purchaseDocuments.id })
      .from(purchaseDocuments)
      .where(
        and(
          eq(purchaseDocuments.purchaseId, purchaseId),
          eq(purchaseDocuments.documentUri, input.documentUri)
        )
      )
      .limit(1)
      .get();
    if (existing !== undefined) {
      throw new DocumentAlreadyAttachedError(purchaseId, input.documentUri);
    }

    return insertPurchaseDocument(tx, {
      purchaseId,
      shipmentId: null,
      documentUri: input.documentUri,
      kind: input.kind ?? 'other',
      createdAt: nowIso(),
    });
  });
}
