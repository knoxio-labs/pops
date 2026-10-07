/**
 * Whether a stored receipt is still someone's evidence.
 *
 * The retention sweep needs this to tell a receipt nobody kept apart from
 * one a purchase saved or another pillar pinned.
 */
import { and, eq, inArray } from 'drizzle-orm';

import { receiptUri } from '../../ingest/receipt/store.js';
import { purchaseDocuments, receiptExternalReferences } from '../schema.js';

import type { PurchasesDb } from './internal.js';

/**
 * Whether any purchase or external owner holds this receipt's bytes.
 *
 * Matches the exact `pops://purchases/receipt/<sha256>` URI a saveDraft or
 * createManual write puts into `purchase_documents.document_uri` for each
 * page — the same URI `receiptKeyFromUris` derives from a draft's
 * documents, so this checks one page's identity, not the multi-page digest
 * key. A multi-page receipt is referenced when ANY of its own pages' URIs
 * appears — it never has one row for the combined key.
 *
 * The two kinds of holder are independent: a file a purchase and an
 * external owner both hold stays referenced until both are gone.
 */
export function isReceiptReferenced(db: PurchasesDb, sha256: string): boolean {
  const uri = receiptUri(sha256);
  const heldByPurchase =
    db
      .select({ id: purchaseDocuments.id })
      .from(purchaseDocuments)
      .where(eq(purchaseDocuments.documentUri, uri))
      .limit(1)
      .all().length > 0;
  if (heldByPurchase) return true;

  return (
    db
      .select({ id: receiptExternalReferences.id })
      .from(receiptExternalReferences)
      .where(eq(receiptExternalReferences.documentUri, uri))
      .limit(1)
      .all().length > 0
  );
}

/**
 * Pin receipt files for an owner on another pillar.
 *
 * Idempotent: a pair already recorded is left as it is, so repeating a call
 * adds no row. All-or-nothing across `receiptUris`.
 *
 * Does not check that the files exist; the caller answers for that before
 * calling, because the store is on disk and not in this database.
 *
 * @param ownerUri `pops://<pillar>/<type>/<id>` of whatever holds the files.
 * @param receiptUris `pops://purchases/receipt/<sha256>` URIs to pin.
 */
export function addExternalReceiptReferences(
  db: PurchasesDb,
  ownerUri: string,
  receiptUris: readonly string[]
): void {
  const rows = [...new Set(receiptUris)].map((documentUri) => ({ documentUri, ownerUri }));
  if (rows.length === 0) return;
  db.insert(receiptExternalReferences).values(rows).onConflictDoNothing().run();
}

/**
 * Release an owner's pins.
 *
 * Omitting `receiptUris` releases every file the owner holds; an empty list
 * releases none. A pair that was never recorded is skipped silently. Other
 * owners' pins on the same file, and any purchase holding it, are untouched.
 *
 * @returns How many pins were removed.
 */
export function removeExternalReceiptReferences(
  db: PurchasesDb,
  ownerUri: string,
  receiptUris?: readonly string[]
): number {
  const ofOwner = eq(receiptExternalReferences.ownerUri, ownerUri);
  if (receiptUris === undefined) {
    return db.delete(receiptExternalReferences).where(ofOwner).run().changes;
  }
  if (receiptUris.length === 0) return 0;
  return db
    .delete(receiptExternalReferences)
    .where(and(ofOwner, inArray(receiptExternalReferences.documentUri, [...new Set(receiptUris)])))
    .run().changes;
}
