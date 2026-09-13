/**
 * Handlers for the `receipt.*` sub-router.
 *
 * The order of operations is deliberate: **store the upload first**, then
 * read it. If the model is down, or reads it wrongly, or the figures
 * disagree, the file is still on disk and addressable — so a failed upload
 * leaves evidence rather than nothing. Reading first and storing only on
 * success would discard exactly the receipts a human needs to look at.
 *
 * Nothing here branches on how the receipt arrived beyond the wording of
 * its refusals. A photograph, a PDF invoice and a pasted order confirmation
 * are stored, keyed, gated and written by the same code.
 *
 * `extract` and `saveDraft` — separating a reading from what becomes a
 * purchase (POPS-2454) — are spread in from `receipt-draft-handlers.ts`,
 * and the sub-router's two read routes from `receipt-bytes-handlers.ts`.
 * All three share the decode/store pipeline in `receipt-prepare.ts` and
 * nothing else with this file.
 */
import { firstPhotoCapture, resolveCapture } from '../../ingest/receipt/capture.js';
import { receiptToPurchase } from '../../ingest/receipt/purchase.js';
import { readReceipt } from '../../ingest/receipt/read-receipt.js';
import {
  createMerchantResolver,
  nameMerchant,
  type MerchantResolver,
} from '../contacts/merchant.js';
import { makeReceiptBytesHandlers } from './receipt-bytes-handlers.js';
import { makeReceiptDraftHandlers } from './receipt-draft-handlers.js';
import { persistReceiptPurchase, sameShopAlreadyRecorded } from './receipt-persist.js';
import {
  fireIngest,
  prepareReceiptParts,
  receiptUris,
  visionUnavailable,
  type UploadBody,
} from './receipt-prepare.js';
import { toPurchaseDetailBody } from './serializers.js';

import type { z } from 'zod';

import type { ReceiptOutcomeSchema } from '../../contract/rest-receipts.js';
import type { PurchasesDb } from '../../db/index.js';
import type { ReceiptVision } from '../../ingest/receipt/vision.js';

/**
 * The contract's own union. Annotating each branch against it is what makes
 * a body that drifts from the declared shape a compile error rather than a
 * response nobody validates.
 */
type ReceiptOutcome = z.infer<typeof ReceiptOutcomeSchema>;

const ok = (body: ReceiptOutcome) => ({ status: 200 as const, body });

export function makeReceiptHandlers(
  db: PurchasesDb,
  /** Null when no API key is configured — every upload is then declined. */
  vision: ReceiptVision | null,
  onIngest: () => void = () => undefined,
  merchant: MerchantResolver = createMerchantResolver()
) {
  return {
    upload: async ({ body }: { body: UploadBody }) => {
      // Stamped before the model, not after. An undated receipt is dated
      // from its upload, and a vision call takes seconds — enough to carry
      // a shop uploaded at 23:59 into the following day.
      const uploadedAt = new Date().toISOString();
      if (vision === null) return visionUnavailable();

      const prepared = prepareReceiptParts(db, body);
      if (prepared.kind === 'refused') return prepared.response;
      if (prepared.kind === 'duplicate') {
        return {
          status: 409 as const,
          body: {
            message: `This upload has already been read as purchase ${prepared.purchaseId}`,
            code: 'ALREADY_IMPORTED',
          },
        };
      }
      const { parts, goodParts, stored } = prepared;

      const outcome = await readReceipt(vision, parts);

      if (outcome.kind === 'unreadable') {
        return ok({ kind: 'unreadable', receiptUris: receiptUris(stored), reason: outcome.reason });
      }

      if (outcome.kind === 'needs-review') {
        return ok({
          kind: 'needs-review',
          receiptUris: receiptUris(stored),
          failures: [...outcome.gate.failures],
          extracted: outcome.extracted,
        });
      }

      // Ranked against the zone the model read off the printed address, so
      // it is resolved after the reading (`ingest/receipt/capture.ts`).
      const capture = resolveCapture(
        body.capture,
        firstPhotoCapture(goodParts),
        outcome.extracted.timeZone
      );

      // Always maps: a receipt with no readable date is dated from the
      // capture instant or, failing that, its upload, and tagged rather
      // than refused. Losing a shop that happened would be worse than
      // carrying an inferred date the tag stops anyone mistaking for a
      // stated one.
      const shaped = receiptToPurchase(outcome.extracted, outcome.gate, stored, {
        uploadedAt,
        capture,
      });

      const alreadyHave = sameShopAlreadyRecorded(db, shaped.purchase);
      if (alreadyHave !== undefined) {
        return {
          status: 409 as const,
          body: {
            message:
              `This looks like purchase ${alreadyHave.id}, already recorded from ` +
              'another upload of the same receipt',
            code: 'ALREADY_IMPORTED',
          },
        };
      }

      // Best-effort, and deliberately after the reading rather than part of
      // it: the entity link is something this fleet knows, not something
      // the receipt said, so it is not in the checksum and a contacts
      // outage costs a link rather than the purchase.
      const merchantEntityId = await nameMerchant(merchant, shaped.purchase.merchantEntityName);

      const written = persistReceiptPurchase(db, { ...shaped.purchase, merchantEntityId });
      if (written.kind === 'refused') return { status: written.status, body: written.body };

      fireIngest(onIngest);
      return ok({
        kind: 'created',
        purchase: toPurchaseDetailBody(written.detail),
        // True only when every part was already on disk: a partly familiar
        // set is a new submission, not a stored one.
        alreadyStored: stored.every((one) => one.alreadyPresent),
      });
    },

    ...makeReceiptDraftHandlers(db, vision, onIngest, merchant),
    ...makeReceiptBytesHandlers(),
  };
}
