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
 */
import { readFile } from 'node:fs/promises';

import { findPurchaseBySourceOrderId } from '../../db/index.js';
import { firstPhotoCapture, resolveCapture } from '../../ingest/receipt/capture.js';
import { RECEIPT_SOURCE_ID, receiptToPurchase } from '../../ingest/receipt/purchase.js';
import { readReceipt } from '../../ingest/receipt/read-receipt.js';
import {
  canonicalBase64,
  looksLikeMediaType,
  receiptKey,
  resolveStoredReceipt,
  storeReceiptPart,
  type StoredReceipt,
} from '../../ingest/receipt/store.js';
import {
  readOrDeriveThumbnail,
  THUMBNAIL_MEDIA_TYPE,
  type ThumbnailRefusal,
} from '../../ingest/receipt/thumbnail.js';
import { kindOf } from '../../ingest/receipt/vision.js';
import { createMerchantResolver, type MerchantResolver } from '../contacts/merchant.js';
import { persistReceiptPurchase, sameShopAlreadyRecorded } from './receipt-persist.js';
import { toPurchaseDetailBody } from './serializers.js';

import type { Response } from 'express';
import type { z } from 'zod';

import type {
  ReceiptOutcomeSchema,
  UploadReceiptBodySchema,
} from '../../contract/rest-receipts.js';
import type { PurchasesDb } from '../../db/index.js';
import type { ReceiptKind, ReceiptMediaType, ReceiptVision } from '../../ingest/receipt/vision.js';
import type { ErrorBody } from './error-mapping.js';

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

    read: async ({ params, res }: BytesRequest) => {
      // Resolved per request rather than captured when the handlers were
      // built, exactly as the upload path resolves it: the store root comes
      // from the environment, and a test that points it somewhere else
      // between construction and the call must be pointing both directions at
      // the same tree.
      const found = resolveStoredReceipt(params.sha256);
      if (found === null) return receiptNotStored(params.sha256);

      const bytes = await readFile(found.path);
      return servedBytes(res, {
        sha256: params.sha256,
        mediaType: found.mediaType,
        bytes,
        etag: `"${params.sha256}"`,
      });
    },

    thumbnail: async ({ params, res }: BytesRequest) => {
      const outcome = await readOrDeriveThumbnail(params.sha256);

      if (outcome.kind === 'absent') return receiptNotStored(params.sha256);
      if (outcome.kind === 'refused') return noThumbnail(outcome.reason);

      return servedBytes(res, {
        sha256: params.sha256,
        mediaType: THUMBNAIL_MEDIA_TYPE,
        bytes: outcome.bytes,
        // Distinct from the original's, because the same hash addresses two
        // different representations and one entity tag for both would let a
        // cache answer a thumbnail request with a full-size receipt.
        etag: `"${params.sha256}-thumb"`,
      });
    },
  };
}

interface BytesRequest {
  readonly params: { readonly sha256: string };
  readonly res: Response;
}

/**
 * A well-formed hash naming nothing.
 *
 * Separate from the 400 the contract's own path schema produces for a hash
 * that is not one: this says the store does not have it, which is the answer
 * for a receipt whose file was lost, and the malformed case says the caller
 * built the URL wrong. The hash is echoed because it is not a secret and it is
 * the only thing that makes the message actionable.
 */
const receiptNotStored = (sha256: string) => ({
  status: 404 as const,
  body: {
    message: `No receipt is stored under ${sha256}`,
    code: 'RECEIPT_NOT_STORED',
  },
});

/** Why a receipt that exists cannot be drawn, in terms the caller can act on. */
const NO_THUMBNAIL_REASONS: Readonly<Record<ThumbnailRefusal, ErrorBody>> = {
  'not-an-image': {
    message: 'This receipt is a document rather than a photograph, so it has no thumbnail',
    code: 'RECEIPT_NOT_AN_IMAGE',
  },
  undecodable: {
    message: 'This receipt is stored but its bytes could not be decoded as an image',
    code: 'RECEIPT_UNDECODABLE',
  },
};

const noThumbnail = (reason: ThumbnailRefusal) => ({
  status: 415 as const,
  body: NO_THUMBNAIL_REASONS[reason],
});

/**
 * Answer with stored bytes, cached for a year.
 *
 * Safe to the point of being free: every one of these files is named for the
 * hash of the receipt it came from, so the bytes under a given URL cannot
 * change and `immutable` tells a client not to spend a round trip asking. That
 * is what makes a scroll back through a list cost nothing the second time.
 *
 * `private` because these are photographs of what somebody bought. A shared
 * cache holding them would be a copy of the household's receipts outside the
 * pillar that owns them, and the URL is not a credential — the scope gate in
 * front of this route is (ADR-044).
 *
 * No `304` handling to go with the `ETag`: under `immutable` a conforming
 * client does not revalidate at all, so a conditional branch here would be
 * code no caller exercises. The `ETag` is there for the ones that ignore it.
 */
function servedBytes(
  res: Response,
  receipt: { sha256: string; mediaType: ReceiptMediaType; bytes: Buffer; etag: string }
) {
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.setHeader('ETag', receipt.etag);

  return {
    status: 200 as const,
    body: {
      sha256: receipt.sha256,
      mediaType: receipt.mediaType,
      byteLength: receipt.bytes.length,
      dataBase64: receipt.bytes.toString('base64'),
    },
  };
}
