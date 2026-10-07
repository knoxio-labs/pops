/**
 * Handlers for keeping a receipt file that no purchase holds.
 *
 * Another pillar stores a file with `store` and pins it with `addReferences`
 * so the retention sweep leaves it alone. Neither reads the receipt, so
 * neither needs a vision model, and neither writes a purchase.
 */
import { addExternalReceiptReferences, removeExternalReceiptReferences } from '../../db/index.js';
import { receiptShaFromUri, resolveStoredReceipt } from '../../ingest/receipt/store.js';
import { purchaseErrorBody } from '../errors.js';
import { receiptUris, validateAndStoreReceiptParts } from './receipt-prepare.js';

import type { z } from 'zod';

import type { StoreReceiptBodySchema } from '../../contract/rest-receipts.js';
import type {
  AddReceiptReferencesBodySchema,
  RemoveReceiptReferencesBodySchema,
} from '../../contract/schemas/receipt-references.js';
import type { PurchasesDb } from '../../db/index.js';

type StoreBody = z.infer<typeof StoreReceiptBodySchema>;
type AddReferencesBody = z.infer<typeof AddReceiptReferencesBodySchema>;
type RemoveReferencesBody = z.infer<typeof RemoveReceiptReferencesBodySchema>;

const OK = { status: 200 as const, body: { ok: true as const } };

/** The first URI naming nothing in the store, or undefined when all are held. */
function firstNotStored(uris: readonly string[]): string | undefined {
  return uris.find((uri) => {
    const sha256 = receiptShaFromUri(uri);
    return sha256 === null || resolveStoredReceipt(sha256) === null;
  });
}

export function makeReceiptReferenceHandlers(db: PurchasesDb) {
  return {
    store: async ({ body }: { body: StoreBody }) => {
      const outcome = validateAndStoreReceiptParts(body);
      if (outcome.kind === 'refused') return outcome.response;
      return { status: 200 as const, body: { receiptUris: receiptUris(outcome.stored) } };
    },

    addReferences: async ({ body }: { body: AddReferencesBody }) => {
      const missing = firstNotStored(body.receiptUris);
      if (missing !== undefined) {
        return {
          status: 404 as const,
          body: purchaseErrorBody('not_stored', {
            message: `No receipt is stored under ${missing}`,
          }),
        };
      }
      addExternalReceiptReferences(db, body.ownerUri, body.receiptUris);
      return OK;
    },

    removeReferences: async ({ body }: { body: RemoveReferencesBody }) => {
      removeExternalReceiptReferences(db, body.ownerUri, body.receiptUris);
      return OK;
    },
  };
}
