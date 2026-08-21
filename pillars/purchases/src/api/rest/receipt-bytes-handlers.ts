/**
 * Handlers for the two `receipt.*` routes that hand back stored bytes.
 *
 * Separate from `receipt-handlers.ts` because they share nothing with the
 * upload beyond the sub-router they hang off: no database, no vision model, no
 * merchant resolver, no contacts call. What they do share is the store, and
 * they read it through the same module that wrote it — `resolveStoredReceipt`
 * inverts the writer's own naming rather than re-deriving it, so a new media
 * type is one edit rather than two.
 *
 * Deliberately on the contract's router rather than mounted as raw Express
 * routes. The service-account scope gate derives what it enforces from the
 * contract (ADR-044), so a hand-mounted path serving these bytes would be a
 * path serving photographs of somebody's shopping with no scope check at all.
 */
import { readFile } from 'node:fs/promises';

import { resolveStoredReceipt } from '../../ingest/receipt/store.js';
import {
  readOrDeriveThumbnail,
  THUMBNAIL_MEDIA_TYPE,
  type ThumbnailRefusal,
} from '../../ingest/receipt/thumbnail.js';

import type { Response } from 'express';

import type { ReceiptMediaType } from '../../ingest/receipt/vision.js';
import type { ErrorBody } from './error-mapping.js';

/**
 * What ts-rest hands a handler on these two routes.
 *
 * Exported because the handler map is spread into `makeReceiptHandlers`'
 * return value, and a declaration file cannot name a type it cannot import.
 */
export interface BytesRequest {
  readonly params: { readonly sha256: string };
  readonly res: Response;
}

export function makeReceiptBytesHandlers() {
  return {
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
