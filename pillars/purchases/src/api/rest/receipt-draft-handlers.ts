/**
 * `extract` and `saveDraft` — separating a receipt's extraction from its
 * persistence (POPS-2454).
 *
 * `extract` runs the same read-and-store pipeline `upload` does
 * (`receipt-prepare.ts`) but never calls `createPurchase`: its answer is a
 * draft a reviewer edits, admissible reading or not. `saveDraft` persists
 * one, with `source` and `ingestMethod` fixed here rather than read off the
 * body — the phone chooses what it typed, never what kind of write it made.
 */
import { findPurchaseBySourceOrderId } from '../../db/index.js';
import { firstPhotoCapture, resolveCapture } from '../../ingest/receipt/capture.js';
import { shapeReceiptDraft } from '../../ingest/receipt/draft.js';
import { RECEIPT_SOURCE_ID } from '../../ingest/receipt/purchase.js';
import { readReceipt } from '../../ingest/receipt/read-receipt.js';
import { receiptKeyFromUris } from '../../ingest/receipt/store.js';
import {
  createMerchantResolver,
  nameMerchant,
  type MerchantResolver,
} from '../contacts/merchant.js';
import { findDraftInconsistency, toCreatePurchaseInput } from './draft-mapping.js';
import { ensureDraftSource, persistDraftPurchase } from './purchase-draft-persist.js';
import {
  fireIngest,
  prepareReceiptParts,
  receiptUris,
  visionUnavailable,
} from './receipt-prepare.js';
import { toPurchaseDetailBody } from './serializers.js';

import type { z } from 'zod';

import type { ExtractReceiptOutcomeSchema } from '../../contract/rest-receipts.js';
import type { SaveReceiptDraftBodySchema } from '../../contract/rest-schemas.js';
import type { PurchasesDb } from '../../db/index.js';
import type { ReceiptVision } from '../../ingest/receipt/vision.js';
import type { UploadBody } from './receipt-prepare.js';

type SaveDraftBody = z.infer<typeof SaveReceiptDraftBodySchema>;
type ExtractOutcome = z.infer<typeof ExtractReceiptOutcomeSchema>;

const okExtract = (body: ExtractOutcome) => ({ status: 200 as const, body });

/**
 * The source row a saved receipt-derived draft is written under. The same
 * label and adapter `receipt-persist.ts`'s `ensureReceiptSource` registers,
 * so `GET /sources` reports one row whichever route registered it first.
 */
const RECEIPT_DRAFT_SOURCE = {
  id: RECEIPT_SOURCE_ID,
  label: 'Uploaded receipts',
  descriptorPattern: null,
  autoLinkPolicy: 'review' as const,
  ingestAdapter: 'receipt-vision',
};

export function makeReceiptDraftHandlers(
  db: PurchasesDb,
  vision: ReceiptVision | null,
  onIngest: () => void,
  merchant: MerchantResolver = createMerchantResolver()
) {
  return {
    extract: async ({ body }: { body: UploadBody }) => {
      const uploadedAt = new Date().toISOString();
      if (vision === null) return visionUnavailable();

      const prepared = prepareReceiptParts(db, body);
      if (prepared.kind === 'refused') return prepared.response;
      if (prepared.kind === 'duplicate') {
        return {
          status: 409 as const,
          body: {
            message:
              `This upload has already been read as purchase ${prepared.purchaseId}. ` +
              'Extracting it again would let it be saved as a second one.',
            code: 'ALREADY_IMPORTED',
          },
        };
      }
      const { parts, goodParts, stored } = prepared;

      const outcome = await readReceipt(vision, parts);

      if (outcome.kind === 'unreadable') {
        return okExtract({
          kind: 'unreadable',
          receiptUris: receiptUris(stored),
          reason: outcome.reason,
        });
      }

      const capture = resolveCapture(
        body.capture,
        firstPhotoCapture(goodParts),
        outcome.extracted.timeZone
      );
      const draft = shapeReceiptDraft(outcome.extracted, outcome.gate, stored, {
        uploadedAt,
        capture,
      });

      return okExtract({
        kind: 'draft',
        receiptUris: receiptUris(stored),
        reconciled: outcome.gate.admissible,
        failures: outcome.gate.admissible ? [] : [...outcome.gate.failures],
        draft,
      });
    },

    /**
     * Persist a reviewer-approved (and possibly corrected) receipt-derived
     * draft. The phone chooses nothing about provenance: `source` and
     * `ingestMethod` are fixed here, never read off the body, which is what
     * keeps a save indistinguishable in kind from the upload path it
     * replaces (POPS-2454, ADR-046).
     */
    saveDraft: async ({ body }: { body: SaveDraftBody }) => {
      const inconsistency = findDraftInconsistency(body);
      if (inconsistency !== null) {
        return {
          status: 400 as const,
          body: { message: inconsistency.message, code: 'INCONSISTENT_TOTAL' },
        };
      }

      // The receipt's own identity, independent of which save request or
      // which idempotency key wrote it — see `receiptKeyFromUris`.
      const contentKey = receiptKeyFromUris(body.documents.map((one) => one.documentUri));
      if (contentKey === null) {
        return {
          status: 400 as const,
          body: {
            message: 'One of these documents is not a receipt this pillar stored',
            code: 'NOT_A_STORED_RECEIPT',
          },
        };
      }
      const alreadySaved = findPurchaseBySourceOrderId(db, RECEIPT_SOURCE_ID, contentKey);
      if (alreadySaved !== undefined) {
        return {
          status: 409 as const,
          body: {
            message: `This receipt has already been saved as purchase ${alreadySaved.id}`,
            code: 'ALREADY_IMPORTED',
          },
        };
      }

      ensureDraftSource(db, RECEIPT_DRAFT_SOURCE);
      const merchantEntityId = await nameMerchant(merchant, body.merchantEntityName);
      const input = toCreatePurchaseInput(
        { ...body, merchantEntityId },
        RECEIPT_SOURCE_ID,
        'upload',
        contentKey
      );

      const written = persistDraftPurchase(db, input);
      if (written.kind === 'refused') return { status: written.status, body: written.body };

      fireIngest(onIngest);
      return { status: 200 as const, body: toPurchaseDetailBody(written.detail) };
    },
  };
}
