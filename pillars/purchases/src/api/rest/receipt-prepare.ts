/**
 * Decoding and storing a receipt upload's parts — the half of the pipeline
 * `upload`, `extract` and nothing else share.
 *
 * Split out purely to keep `receipt-handlers.ts` and
 * `receipt-draft-handlers.ts` under the file-size cap; there is no
 * behavioural reason for the boundary to sit here rather than anywhere else
 * in that pipeline.
 */
import { findPurchaseBySourceOrderId } from '../../db/index.js';
import { RECEIPT_SOURCE_ID } from '../../ingest/receipt/purchase.js';
import {
  canonicalBase64,
  decodeReceiptBase64,
  looksLikeMediaType,
  receiptKey,
  storeReceiptPart,
  type StoredReceipt,
} from '../../ingest/receipt/store.js';
import { kindOf } from '../../ingest/receipt/vision.js';

import type { z } from 'zod';

import type { UploadReceiptBodySchema } from '../../contract/rest-receipts.js';
import type { PurchasesDb } from '../../db/index.js';
import type {
  DecodedReceiptPart,
  ReceiptKind,
  ReceiptMediaType,
} from '../../ingest/receipt/vision.js';

export type UploadBody = z.infer<typeof UploadReceiptBodySchema>;

/**
 * Two refusals worth making before spending a model call.
 *
 * Both are answers the user can act on immediately — "configure a key",
 * "that is not a JPEG" — where the same facts discovered inside the model
 * come back as confusion that costs money to obtain.
 */
export function visionUnavailable(): {
  status: 503;
  body: { message: string; code: string };
} {
  return {
    status: 503,
    body: {
      message:
        'No vision model is configured; set ANTHROPIC_API_KEY, or ' +
        'ANTHROPIC_API_KEY_FILE pointing at a mounted secret, to accept receipts',
      code: 'VISION_UNAVAILABLE',
    },
  };
}

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
function notWhatItClaims(
  mediaType: ReceiptMediaType,
  index: number,
  count: number
): { status: 400; body: { message: string; code: string } } {
  return {
    status: 400,
    body: {
      message:
        count === 1
          ? `The upload is not a valid ${mediaType} file`
          : `${NOUNS[kindOf(mediaType)]} ${String(index + 1)} of ${String(count)} is not a valid ${mediaType} file`,
      code: 'NOT_THE_STATED_TYPE',
    },
  };
}

/** Every stored part's address, in the order it was sent. */
export const receiptUris = (stored: readonly StoredReceipt[]): string[] =>
  stored.map((one) => one.uri);

/**
 * Decode every part, refuse the first that is not what it claims, store what
 * survives, and refuse a repeat of a file this pillar already read.
 *
 * Shared by `upload` and `extract`: both store first and ask the model
 * second (`receipt-handlers.ts`'s header explains why), and both must refuse
 * the same repeat before paying for a vision call whose only possible
 * outcome is a 409.
 */
export function prepareReceiptParts(
  db: PurchasesDb,
  body: { parts: UploadBody['parts'] }
):
  | { readonly kind: 'refused'; readonly response: ReturnType<typeof notWhatItClaims> }
  | { readonly kind: 'duplicate'; readonly purchaseId: string }
  | {
      readonly kind: 'ready';
      readonly parts: { mediaType: UploadBody['parts'][number]['mediaType']; dataBase64: string }[];
      readonly goodParts: DecodedReceiptPart[];
      readonly stored: StoredReceipt[];
    } {
  const parts = body.parts.map((one) => ({
    mediaType: one.mediaType,
    dataBase64: canonicalBase64(one.dataBase64),
  }));
  const decodedParts = parts.map((one) => ({
    mediaType: one.mediaType,
    bytes: decodeReceiptBase64(one.dataBase64),
  }));

  const badPartAt = decodedParts.findIndex(
    (one) => one.bytes === null || !looksLikeMediaType(one.bytes, one.mediaType)
  );
  if (badPartAt !== -1) {
    const bad = parts[badPartAt];
    if (bad !== undefined) {
      return { kind: 'refused', response: notWhatItClaims(bad.mediaType, badPartAt, parts.length) };
    }
  }

  const goodParts = decodedParts.filter((one): one is DecodedReceiptPart => one.bytes !== null);
  const stored = goodParts.map((one) => storeReceiptPart(one));

  const existing = findPurchaseBySourceOrderId(db, RECEIPT_SOURCE_ID, receiptKey(stored));
  if (existing !== undefined) return { kind: 'duplicate', purchaseId: existing.id };

  return { kind: 'ready', parts, goodParts, stored };
}

/**
 * Trigger 1 of the reconciliation sweep, fired only after the write
 * committed and swallowed if it fails. Letting a scheduling failure turn a
 * successful ingest into a 500 would make the caller re-upload or re-save a
 * receipt that is already stored.
 */
export function fireIngest(onIngest: () => void): void {
  try {
    onIngest();
  } catch (error) {
    console.error('[purchases-api] ingest sweep trigger failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
