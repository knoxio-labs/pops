/**
 * Whether a stored receipt is still someone's evidence.
 *
 * The retention sweep needs this to tell a receipt no purchase ever saved
 * apart from one that already made it into an order.
 */
import { eq } from 'drizzle-orm';

import { receiptUri } from '../../ingest/receipt/store.js';
import { purchaseDocuments } from '../schema.js';

import type { PurchasesDb } from './internal.js';

/**
 * Whether any purchase holds a document pointing at this receipt's bytes.
 *
 * Matches the exact `pops://purchases/receipt/<sha256>` URI a saveDraft or
 * createManual write puts into `purchase_documents.document_uri` for each
 * page — the same URI `receiptKeyFromUris` derives from a draft's
 * documents, so this checks one page's identity, not the multi-page digest
 * key. A multi-page receipt is referenced when ANY of its own pages' URIs
 * appears — it never has one row for the combined key.
 */
export function isReceiptReferenced(db: PurchasesDb, sha256: string): boolean {
  return (
    db
      .select({ id: purchaseDocuments.id })
      .from(purchaseDocuments)
      .where(eq(purchaseDocuments.documentUri, receiptUri(sha256)))
      .all().length > 0
  );
}
