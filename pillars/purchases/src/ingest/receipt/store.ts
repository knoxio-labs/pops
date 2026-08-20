/**
 * Keeping the evidence.
 *
 * The uploaded file is not a by-product. When the gate refuses a reading,
 * the only way anyone settles what the receipt actually said is by looking
 * at it — so a drop-zone that extracts and discards has thrown away the
 * evidence for exactly the cases that need it. That holds whatever arrived:
 * a photograph, the merchant's PDF, or the email body someone pasted.
 *
 * Storage is **content-addressed**: the file is named for the SHA-256 of
 * its own bytes. That makes the ticket's dedup requirement structural
 * rather than a check someone has to remember to write — the same file
 * lands on the same path, and the purchase built from it carries the same
 * `checksum`, so a re-upload is a 409 from the existing write path rather
 * than a twin.
 *
 * It also means a corrupted or truncated upload cannot quietly overwrite a
 * good one: different bytes, different name.
 */
import { isUtf8 } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { resolvePurchasesSqlitePath } from '../../api/purchases-sqlite-path.js';
import { MEDIA_TYPES } from './vision.js';

import type { ReceiptMediaType, ReceiptPart } from './vision.js';

const EXTENSIONS: Readonly<Record<ReceiptMediaType, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
};

/** Evidence lives beside the database, so one volume holds the whole pillar. */
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
 * The name these bytes would be stored under, without touching the disk.
 *
 * A caller that has to name a file before it knows whether to keep it — a
 * backfill that mints a `pops://` URI for a request that may be refused —
 * needs the address and the write to come from one recipe, or the URI it
 * published and the path it later writes can drift apart.
 */
export function receiptSha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * What a stored file's name says it is.
 *
 * Derived from {@link EXTENSIONS} rather than written out again, so the two
 * directions cannot disagree: an extension the writer can produce is one the
 * reader can name, and adding a media type extends both at once. The map is
 * injective — no two media types share an extension — which is what makes an
 * extension a sound answer to "what is this file".
 */
const MEDIA_TYPE_BY_EXTENSION: ReadonlyMap<string, ReceiptMediaType> = new Map(
  MEDIA_TYPES.map((mediaType) => [EXTENSIONS[mediaType], mediaType])
);

/**
 * The only shape a stored receipt's name can have: 64 lowercase hex digits.
 *
 * This is what makes the read path traversal-proof. The sha reaches the store
 * from a URL, and a value matching this cannot contain a slash, a dot or a
 * `..`, so the joined path is inside the shard directory by construction
 * rather than by a check somebody has to remember afterwards.
 */
const SHA256_RE = /^[0-9a-f]{64}$/u;

/** Whether a string could name something this store wrote. */
export function isReceiptSha256(value: string): boolean {
  return SHA256_RE.test(value);
}

/** A receipt found on disk, with the type its own name states. */
export interface ResolvedReceipt {
  readonly sha256: string;
  readonly path: string;
  readonly mediaType: ReceiptMediaType;
  readonly byteLength: number;
}

/**
 * Find the bytes a `pops://purchases/receipt/<sha256>` URI names.
 *
 * The stored name carries an extension the hash does not, so a hash alone does
 * not determine a path. Resolving that by listing the shard directory would
 * make every read cost a `readdir` of a directory that grows without bound;
 * instead the six names the writer could possibly have chosen are tried
 * directly, which is a fixed handful of `stat` calls and no directory scan.
 *
 * Deliberately answered from the STORE rather than from `purchase_documents`.
 * A receipt the gate refused, or one the model could not read at all, is
 * stored and handed to the caller as a URI while no purchase — and therefore
 * no document row — exists for it. Requiring a row would 404 exactly the
 * receipts a human has to look at to settle what the paper said.
 *
 * @returns The file, or `null` when the hash is malformed or names nothing.
 */
export function resolveStoredReceipt(
  sha256: string,
  root = resolveReceiptStoreRoot()
): ResolvedReceipt | null {
  if (!isReceiptSha256(sha256)) return null;

  const directory = join(root, sha256.slice(0, 2));
  for (const [extension, mediaType] of MEDIA_TYPE_BY_EXTENSION) {
    const path = join(directory, `${sha256}.${extension}`);
    if (!existsSync(path)) continue;
    return { sha256, path, mediaType, byteLength: statSync(path).size };
  }
  return null;
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
 * Write the file, or notice it is already there.
 *
 * Sharded one level on the hash prefix. A few thousand receipts in one
 * directory is survivable and a few hundred thousand is not, and the shape
 * of the tree is not something worth migrating later.
 */
export function storeReceiptBytes(
  bytes: Buffer,
  mediaType: ReceiptMediaType,
  root = resolveReceiptStoreRoot()
): StoredReceipt {
  const sha256 = receiptSha256(bytes);
  const directory = join(root, sha256.slice(0, 2));
  const path = join(directory, `${sha256}.${EXTENSIONS[mediaType]}`);

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

/** {@link storeReceiptBytes} for an upload, which arrives base64-encoded. */
export function storeReceiptPart(
  part: ReceiptPart,
  root = resolveReceiptStoreRoot()
): StoredReceipt {
  return storeReceiptBytes(Buffer.from(part.dataBase64, 'base64'), part.mediaType, root);
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
 * How each accepted media type identifies itself in its own first bytes.
 *
 * Deliberately shallow — this catches a mislabelled or truncated upload,
 * not a hostile one. `text/plain` has no magic number, so what stands in for
 * one is that the bytes decode as UTF-8: a JPEG relabelled as text fails
 * here, which is the mistake worth catching.
 */
const MAGIC: Readonly<Record<ReceiptMediaType, (probe: Buffer) => boolean>> = {
  'image/jpeg': (probe) => probe[0] === 0xff && probe[1] === 0xd8,
  'image/png': (probe) =>
    probe.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/gif': (probe) => probe.subarray(0, 6).toString('ascii').startsWith('GIF8'),
  'image/webp': (probe) =>
    probe.subarray(0, 4).toString('ascii') === 'RIFF' &&
    probe.subarray(8, 12).toString('ascii') === 'WEBP',
  // Every PDF starts `%PDF-`, including the ones a merchant generates from
  // a template. The version digits that follow are not checked: a reader
  // that refuses a PDF for claiming 2.0 would be refusing a real invoice.
  'application/pdf': (probe) => probe.subarray(0, 5).toString('ascii') === '%PDF-',
  'text/plain': (probe) => isUtf8(probe) && probe.toString('utf8').trim() !== '',
};

/**
 * How many bytes each type needs before the question is even meaningful.
 *
 * Twelve for the binary formats, because that is what identifies them — the
 * WebP check reads bytes 8 through 12, and a two-byte "JPEG" would satisfy
 * its magic number while being nothing at all.
 *
 * Text has no such threshold, and inheriting the binary one would have made
 * a short paste impossible to upload while the contract advertised
 * `min(1)`. What stops an empty paste is that it must decode as UTF-8 and
 * hold something other than whitespace, which is a statement about the
 * content rather than an arbitrary length.
 */
const MINIMUM_BYTES: Readonly<Record<ReceiptMediaType, number>> = {
  'image/jpeg': 12,
  'image/png': 12,
  'image/webp': 12,
  'image/gif': 12,
  'application/pdf': 12,
  'text/plain': 1,
};

/**
 * Does this upload look like the type it claims?
 *
 * Checked at the edge rather than discovered by the vision model, because
 * "that is not a JPEG" is an answer the user can act on immediately and a
 * model's confusion about it is not, and costs a call to obtain.
 */
export function looksLikeMediaType(dataBase64: string, mediaType: ReceiptMediaType): boolean {
  const compact = canonicalBase64(dataBase64);
  if (compact.length % 4 !== 0 || !BASE64_RE.test(compact)) return false;

  const bytes = Buffer.from(compact, 'base64');
  if (bytes.length < MINIMUM_BYTES[mediaType]) return false;

  return MAGIC[mediaType](bytes);
}

/**
 * The key for a receipt made of several parts.
 *
 * One part keeps its own hash, so the natural key and the stored `pops://`
 * URI stay the same string and a single photograph or PDF remains traceable
 * at a glance. Several fold into a digest over their hashes in order, which
 * gives the property that matters either way: the same files, sent again,
 * produce the same key.
 *
 * Order is part of it. Two images of a long receipt swapped are not the
 * same submission, and treating them as such would hide a caller sending
 * the halves the wrong way round.
 *
 * A photograph of a receipt and the merchant's PDF of the same purchase are
 * different bytes and therefore different keys. That is correct here — they
 * are not the same file — and the write path's same-instant-same-amount
 * check is what recognises them as one shop.
 */
export function receiptKey(stored: readonly StoredReceipt[]): string {
  const [only] = stored;
  if (only === undefined) throw new Error('receiptKey needs at least one stored part');
  if (stored.length === 1) return only.sha256;

  const digest = createHash('sha256');
  for (const one of stored) digest.update(`${one.sha256}:`);
  return digest.digest('hex');
}
