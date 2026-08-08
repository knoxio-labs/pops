/**
 * Keeping the photograph.
 *
 * The image is not a by-product. When the gate refuses a reading, the only
 * way anyone settles what the receipt actually said is by looking at it —
 * so a drop-zone that extracts and discards has thrown away the evidence
 * for exactly the cases that need it.
 *
 * Storage is **content-addressed**: the file is named for the SHA-256 of
 * its own bytes. That makes the ticket's dedup requirement structural
 * rather than a check someone has to remember to write — the same photo
 * lands on the same path, and the purchase built from it carries the same
 * `checksum`, so a re-upload is a 409 from the existing write path rather
 * than a twin.
 *
 * It also means a corrupted or truncated upload cannot quietly overwrite a
 * good one: different bytes, different name.
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { resolvePurchasesSqlitePath } from '../../api/purchases-sqlite-path.js';

import type { ReceiptImage, ReceiptMediaType } from './vision.js';

const EXTENSIONS: Readonly<Record<ReceiptMediaType, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Images live beside the database, so one volume holds the whole pillar. */
export function resolveReceiptStoreRoot(): string {
  const override = process.env['PURCHASES_RECEIPT_DIR'];
  if (override !== undefined && override !== '') return override;
  return join(dirname(resolvePurchasesSqlitePath()), 'receipts');
}

export interface StoredReceipt {
  readonly sha256: string;
  readonly path: string;
  /** `pops://purchases/receipt/<sha256>`. */
  readonly uri: string;
  readonly bytes: number;
  /** True when these exact bytes were already on disk. */
  readonly alreadyPresent: boolean;
}

export function receiptUri(sha256: string): string {
  return `pops://purchases/receipt/${sha256}`;
}

/**
 * Write, then move into place.
 *
 * `writeFileSync` straight to the final path is not atomic: a crash or a
 * full disk part-way through leaves a short file under a name that claims
 * to be the hash of the whole thing. Writing beside it and renaming makes
 * the file appear complete or not at all.
 */
function writeAtomically(path: string, bytes: Buffer): void {
  const scratch = `${path}.${randomUUID()}.partial`;
  writeFileSync(scratch, bytes);
  renameSync(scratch, path);
}

/**
 * Write the image, or notice it is already there.
 *
 * Sharded one level on the hash prefix. A few thousand receipts in one
 * directory is survivable and a few hundred thousand is not, and the shape
 * of the tree is not something worth migrating later.
 */
export function storeReceiptImage(
  image: ReceiptImage,
  root = resolveReceiptStoreRoot()
): StoredReceipt {
  const bytes = Buffer.from(image.dataBase64, 'base64');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const directory = join(root, sha256.slice(0, 2));
  const path = join(directory, `${sha256}.${EXTENSIONS[image.mediaType]}`);

  // Existing *and* the right length. `existsSync` alone lets a half-written
  // file win permanently: the name is the hash, so every later upload of
  // the same photograph would find the truncated one and skip past it, and
  // the store would never repair itself. We know exactly how long the file
  // should be, so the check is free.
  if (existsSync(path) && statSync(path).size === bytes.length) {
    return {
      sha256,
      path,
      uri: receiptUri(sha256),
      bytes: bytes.length,
      alreadyPresent: true,
    };
  }

  mkdirSync(directory, { recursive: true });
  writeAtomically(path, bytes);
  return { sha256, path, uri: receiptUri(sha256), bytes: bytes.length, alreadyPresent: false };
}

/**
 * Base64 that decodes to what it claims to be.
 *
 * `Buffer.from(s, 'base64')` never throws — it skips characters it does not
 * recognise and returns whatever it managed to decode, so a truncated or
 * corrupted upload silently becomes a short buffer rather than an error.
 * The shape is therefore checked before decoding rather than after.
 */
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/u;

/**
 * Base64 with the line breaks taken out.
 *
 * A pasted or `base64`-piped payload arrives wrapped, which decodes fine
 * here but is not universally accepted — some providers refuse it outright.
 * Canonicalising once, at the edge, keeps validation, storage and the model
 * looking at the same bytes.
 */
export function canonicalBase64(dataBase64: string): string {
  return dataBase64.replaceAll(/\s/gu, '');
}

/**
 * Does this upload look like the image type it claims?
 *
 * Checked at the edge rather than discovered by the vision model, because
 * "that is not a JPEG" is an answer the user can act on immediately and a
 * model's confusion about it is not, and costs a call to obtain. The
 * magic-number check is deliberately shallow — it catches a mislabelled or
 * truncated upload, not a hostile one.
 */
export function looksLikeImage(dataBase64: string, mediaType: ReceiptMediaType): boolean {
  const compact = canonicalBase64(dataBase64);
  if (compact.length % 4 !== 0 || !BASE64_RE.test(compact)) return false;

  const bytes = Buffer.from(compact, 'base64');
  if (bytes.length < 12) return false;

  const magic: Readonly<Record<ReceiptMediaType, (probe: Buffer) => boolean>> = {
    'image/jpeg': (probe) => probe[0] === 0xff && probe[1] === 0xd8,
    'image/png': (probe) =>
      probe.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'image/gif': (probe) => probe.subarray(0, 6).toString('ascii').startsWith('GIF8'),
    'image/webp': (probe) =>
      probe.subarray(0, 4).toString('ascii') === 'RIFF' &&
      probe.subarray(8, 12).toString('ascii') === 'WEBP',
  };
  return magic[mediaType](bytes);
}
