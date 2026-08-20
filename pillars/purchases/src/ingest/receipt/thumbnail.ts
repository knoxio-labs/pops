import { randomUUID } from 'node:crypto';
/**
 * A receipt small enough for a list row.
 *
 * A stored receipt is a photograph of a piece of paper taken by a handset,
 * bounded before it was sent to a longest edge of 2400px so a model can still
 * read the smallest print on it. That is several hundred kilobytes, and a list
 * that draws twenty of them has moved ten megabytes to fill one screen. The
 * thumbnail exists so the list does not have to.
 *
 * ## Why the resize happens here, on the first read
 *
 * Three places could do it, and the trade is between when the work is paid for
 * and which receipts it reaches.
 *
 * - **On the handset** is the one option that cannot work: sizing the picture
 *   down on the phone means the phone has already been sent the full-size
 *   picture, which is the cost the thumbnail exists to avoid.
 * - **On write**, in the upload path, is free at read time — but it reaches
 *   only receipts uploaded after it ships. The receipts already on the volume
 *   would need a backfill that walks the store, and a SQL migration cannot
 *   walk a filesystem.
 * - **On the first read, persisted** is what this module does. The derived
 *   file is written beside its original under the original's own hash, so
 *   every read after the first is a file read and nothing more — on-write's
 *   steady state — while the corpus already on disk is covered without a
 *   backfill, because a receipt gets its thumbnail the first time anything
 *   asks for it.
 *
 * The derived file is as immutable as its source: the bytes are named for the
 * hash of the original, and the same original can only ever produce it again.
 * That is what lets the route promise a year of caching without a revalidation
 * story.
 *
 * ## What has no thumbnail
 *
 * A PDF invoice and a pasted order confirmation are receipts and are not
 * pictures. Rasterising a PDF needs a renderer this pillar does not have, and
 * text has nothing to draw, so both are answered as "there is no image of
 * this" rather than as a failure — the caller draws its own placeholder, and a
 * caller that cannot tell the two apart would retry forever.
 */
import { renameSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import sharp from 'sharp';

import { resolveReceiptStoreRoot, resolveStoredReceipt } from './store.js';
import { kindOf } from './vision.js';

/**
 * The longest edge a thumbnail may have, in pixels.
 *
 * A list row is around 100pt tall, which is 300px on a 3x handset. 480 leaves
 * that with room to spare — enough for a larger row or a two-column grid to
 * reuse the same artifact rather than mint a second size — while keeping a
 * till slip under about thirty kilobytes.
 */
export const THUMBNAIL_LONGEST_EDGE = 480;

/**
 * JPEG quality for the derived image.
 *
 * Lower than the 0.8 the capture uses, because nothing reads print off a
 * thumbnail: it exists to make a row recognisable as *that* shop's receipt,
 * and the artefacts that would cost legibility at full size are invisible at
 * this one.
 */
const THUMBNAIL_QUALITY = 72;

/** Derived images are always JPEG, whatever the original was. */
export const THUMBNAIL_MEDIA_TYPE = 'image/jpeg';

/** Why a receipt that exists still has no thumbnail. */
export type ThumbnailRefusal =
  /** A PDF or a pasted body. There is no picture to shrink, and there never will be. */
  | 'not-an-image'
  /** An image whose bytes the encoder could not decode — truncated, or damaged in storage. */
  | 'undecodable';

export type ThumbnailOutcome =
  | { readonly kind: 'ok'; readonly bytes: Buffer }
  /** No receipt is stored under that hash. */
  | { readonly kind: 'absent' }
  | { readonly kind: 'refused'; readonly reason: ThumbnailRefusal };

/** Where the derived image for `sha256` lives, beside the original it came from. */
export function thumbnailPath(sha256: string, root: string): string {
  return join(root, sha256.slice(0, 2), `${sha256}.thumb.jpg`);
}

/**
 * Write, then move into place — the same bargain the original's writer makes.
 *
 * Two requests for the same uncached thumbnail can race, and both will derive
 * identical bytes from the same immutable source. Renaming into place means
 * the loser overwrites the winner with the same content instead of a reader
 * seeing a half-written file.
 */
function writeAtomically(path: string, bytes: Buffer): void {
  const scratch = `${path}.${randomUUID()}.partial`;
  writeFileSync(scratch, bytes);
  renameSync(scratch, path);
}

/**
 * The thumbnail for a stored receipt, deriving and persisting it if this is
 * the first time anyone has asked.
 *
 * @param sha256 The hash from the receipt's `pops://` URI.
 * @param root Store root; defaults to the live one, injectable for tests.
 */
export async function readOrDeriveThumbnail(
  sha256: string,
  root = resolveReceiptStoreRoot()
): Promise<ThumbnailOutcome> {
  const original = resolveStoredReceipt(sha256, root);
  if (original === null) return { kind: 'absent' };
  if (kindOf(original.mediaType) !== 'image') return { kind: 'refused', reason: 'not-an-image' };

  // Checked against the resolved original rather than on its own, so a
  // thumbnail can never outlive the receipt it was derived from — and a
  // malformed hash has already been refused by the resolver above, which is
  // what keeps this `join` inside the store.
  const path = thumbnailPath(sha256, root);
  const cached = await readFileIfPresent(path);
  if (cached !== null) return { kind: 'ok', bytes: cached };

  let derived: Buffer;
  try {
    derived = await sharp(original.path)
      // `inside` never crops and never pads: a till slip is far taller than it
      // is wide, and either would throw away the shape that makes it
      // recognisable at a glance.
      .resize({
        width: THUMBNAIL_LONGEST_EDGE,
        height: THUMBNAIL_LONGEST_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: THUMBNAIL_QUALITY })
      .toBuffer();
  } catch (error) {
    // The upload edge checks a magic number, not decodability, so a truncated
    // photograph reaches storage looking like a JPEG. That is a fact about
    // this receipt rather than a fault in the pillar, so it is reported as one
    // and not raised.
    console.warn('[purchases-api] could not derive a thumbnail for a stored receipt', {
      sha256,
      error: error instanceof Error ? error.message : String(error),
    });
    return { kind: 'refused', reason: 'undecodable' };
  }

  // Persisted after the bytes exist, and a failure to persist is not a failure
  // to answer: a read-only or full volume costs this request's caching, not
  // its result.
  try {
    writeAtomically(path, derived);
  } catch (error) {
    console.warn('[purchases-api] derived a thumbnail but could not persist it', {
      sha256,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return { kind: 'ok', bytes: derived };
}

async function readFileIfPresent(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}
