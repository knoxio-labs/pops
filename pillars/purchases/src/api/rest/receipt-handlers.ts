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
 * The sub-router's two read routes are spread in from
 * `receipt-bytes-handlers.ts`. They belong to the same router and share
 * nothing else with the upload — no database, no model, no merchant resolver.
 */
import { findPurchaseBySourceOrderId } from '../../db/index.js';
import { firstPhotoCapture, resolveCapture } from '../../ingest/receipt/capture.js';
import { RECEIPT_SOURCE_ID, receiptToPurchase } from '../../ingest/receipt/purchase.js';
import { readReceipt } from '../../ingest/receipt/read-receipt.js';
import {
  canonicalBase64,
  looksLikeMediaType,
  receiptKey,
  storeReceiptPart,
  type StoredReceipt,
} from '../../ingest/receipt/store.js';
import { kindOf } from '../../ingest/receipt/vision.js';
import { createMerchantResolver, type MerchantResolver } from '../contacts/merchant.js';
import { makeReceiptBytesHandlers } from './receipt-bytes-handlers.js';
import { persistReceiptPurchase, sameShopAlreadyRecorded } from './receipt-persist.js';
import { toPurchaseDetailBody } from './serializers.js';

import type { z } from 'zod';

import type {
  ReceiptOutcomeSchema,
  UploadReceiptBodySchema,
} from '../../contract/rest-receipts.js';
import type { PurchasesDb } from '../../db/index.js';
import type { ReceiptKind, ReceiptMediaType, ReceiptVision } from '../../ingest/receipt/vision.js';

type UploadBody = z.infer<typeof UploadReceiptBodySchema>;
/**
 * The contract's own union. Annotating each branch against it is what makes
 * a body that drifts from the declared shape a compile error rather than a
 * response nobody validates.
 */
type ReceiptOutcome = z.infer<typeof ReceiptOutcomeSchema>;

const ok = (body: ReceiptOutcome) => ({ status: 200 as const, body });

/**
 * Two refusals worth making before spending a model call.
 *
 * Both are answers the user can act on immediately — "configure a key",
 * "that is not a JPEG" — where the same facts discovered inside the model
 * come back as confusion that costs money to obtain.
 */
const visionUnavailable = () => ({
  status: 503 as const,
  body: {
    message:
      'No vision model is configured; set ANTHROPIC_API_KEY, or ' +
      'ANTHROPIC_API_KEY_FILE pointing at a mounted secret, to accept receipts',
    code: 'VISION_UNAVAILABLE',
  },
});

/** What to call the thing that was wrong, in the sender's own terms. */
const NOUNS: Readonly<Record<ReceiptKind, string>> = {
  image: 'Photograph',
  pdf: 'Document',
  text: 'Text',
};

/**
 * Which part was not what it claimed, when there is more than one.
 *
 * Naming the position matters for a long receipt: "the upload is not a
 * valid image/jpeg file" leaves the sender re-taking all six pictures
 * rather than the third.
 */
const notWhatItClaims = (mediaType: ReceiptMediaType, index: number, count: number) => ({
  status: 400 as const,
  body: {
    message:
      count === 1
        ? `The upload is not a valid ${mediaType} file`
        : `${NOUNS[kindOf(mediaType)]} ${String(index + 1)} of ${String(count)} is not a valid ${mediaType} file`,
    code: 'NOT_THE_STATED_TYPE',
  },
});

/** Every stored part's address, in the order it was sent. */
const uris = (stored: readonly StoredReceipt[]): string[] => stored.map((one) => one.uri);

/**
 * Trigger 1 of the reconciliation sweep, fired only after the write
 * committed and swallowed if it fails. Letting a scheduling failure turn a
 * successful ingest into a 500 would make the caller re-upload a receipt
 * that is already stored.
 */
function fireIngest(onIngest: () => void): void {
  try {
    onIngest();
  } catch (error) {
    console.error('[purchases-api] ingest sweep trigger failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Best-effort merchant link.
 *
 * The guarantee that a contacts outage costs a link rather than the
 * purchase belongs HERE, not inside whichever resolver happens to be
 * wired in. The live one catches its own failures; a future one, or a
 * stub, might not, and a receipt must not be lost to a peer being down.
 */
async function nameMerchant(
  merchant: MerchantResolver,
  merchantName: string | null | undefined
): Promise<string | null> {
  if (merchantName === null || merchantName === undefined) return null;
  try {
    return await merchant.resolve(merchantName);
  } catch (error) {
    console.warn('[purchases-api] merchant lookup failed; leaving the purchase unlinked', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

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
      const parts = body.parts.map((one) => ({
        mediaType: one.mediaType,
        dataBase64: canonicalBase64(one.dataBase64),
      }));
      const badPartAt = parts.findIndex(
        (one) => !looksLikeMediaType(one.dataBase64, one.mediaType)
      );
      if (badPartAt !== -1) {
        const bad = parts[badPartAt];
        if (bad !== undefined) return notWhatItClaims(bad.mediaType, badPartAt, parts.length);
      }

      const stored = parts.map((one) => storeReceiptPart(one));

      // Before the model, not after. The parts' digest IS the key, so a
      // re-upload is already knowable here — and letting it reach the
      // vision call means paying for an answer whose only possible outcome
      // is 409. Re-sending a receipt you already sent is an ordinary
      // mistake, and it should be free.
      const existing = findPurchaseBySourceOrderId(db, RECEIPT_SOURCE_ID, receiptKey(stored));
      if (existing !== undefined) {
        return {
          status: 409 as const,
          body: {
            message: `This upload has already been read as purchase ${existing.id}`,
            code: 'ALREADY_IMPORTED',
          },
        };
      }

      const outcome = await readReceipt(vision, parts);

      if (outcome.kind === 'unreadable') {
        return ok({ kind: 'unreadable', receiptUris: uris(stored), reason: outcome.reason });
      }

      if (outcome.kind === 'needs-review') {
        return ok({
          kind: 'needs-review',
          receiptUris: uris(stored),
          failures: [...outcome.gate.failures],
          extracted: outcome.extracted,
        });
      }

      // Ranked against the zone the model read off the printed address, so
      // it is resolved after the reading (`ingest/receipt/capture.ts`).
      const capture = resolveCapture(
        body.capture,
        firstPhotoCapture(parts),
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

    ...makeReceiptBytesHandlers(),
  };
}
