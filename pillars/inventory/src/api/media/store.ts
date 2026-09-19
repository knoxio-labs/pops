/**
 * Content-addressed media storage (Inventory ADR-002 D9).
 *
 * A blob's identity is the SHA-256 of its bytes. Storing the same bytes twice
 * is a no-op (`alreadyStored`); the server never accepts a claimed hash it
 * has not verified against the uploaded bytes.
 *
 * `mediaExists` is the seam A3/A4's `item.attachPhoto` command must call: the
 * command layer owns `item_photos`, this module owns `media` and the bytes on
 * disk, and the two are wired only through this read. A command that attaches
 * a hash `mediaExists` reports `false` for must reject the mutation with
 * `media_missing` (ADR-002 D9) rather than writing the reference.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { eq } from 'drizzle-orm';

import { mediaRelativePath, readImageFacts } from '../../db/backfill-photo-media.js';
import { media as mediaTable } from '../../db/schema.js';
import { mediaVariantRelativePath, renderVariant, DERIVED_VARIANT_SIZES } from './variants.js';

import type { InventoryDb } from '../../db/index.js';

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** The claimed `sha256` path parameter does not match the uploaded bytes. */
export class MediaHashMismatchError extends Error {
  constructor(
    public readonly claimed: string,
    public readonly actual: string
  ) {
    super(`sha256 mismatch: claimed ${claimed}, computed ${actual}`);
    this.name = 'MediaHashMismatchError';
  }
}

/** The uploaded bytes are not an image format `sharp` (and thus this store) can read. */
export class UnsupportedMediaTypeError extends Error {
  constructor() {
    super('Uploaded bytes are not a supported image format');
    this.name = 'UnsupportedMediaTypeError';
  }
}

export interface StoredMedia {
  readonly sha256: string;
  readonly mime: string;
  readonly byteSize: number;
  readonly width: number | null;
  readonly height: number | null;
}

export interface StoreMediaResult {
  readonly sha256: string;
  /** `true` when a `media` row for this hash already existed — nothing was rewritten. */
  readonly alreadyStored: boolean;
}

/** Is `sha256` a well-formed lowercase hex SHA-256 digest? */
export function isValidSha256(sha256: string): boolean {
  return SHA256_HEX.test(sha256);
}

/** The seam A3/A4 read before allowing `item.attachPhoto` to reference a hash. */
export function mediaExists(db: InventoryDb, sha256: string): boolean {
  const row = db
    .select({ sha256: mediaTable.sha256 })
    .from(mediaTable)
    .where(eq(mediaTable.sha256, sha256))
    .get();
  return row !== undefined;
}

/** The stored record for `sha256`, or `null` if nothing is stored. */
export function getMedia(db: InventoryDb, sha256: string): StoredMedia | null {
  const row = db.select().from(mediaTable).where(eq(mediaTable.sha256, sha256)).get();
  if (row === undefined) return null;
  return {
    sha256: row.sha256,
    mime: row.mime,
    byteSize: row.byteSize,
    width: row.width,
    height: row.height,
  };
}

/**
 * Verify `bytes` hashes to `claimedSha256`, store them content-addressed
 * under `imagesDir`, derive the `thumb`/`medium` variants, and record a
 * `media` row.
 *
 * Contract:
 * - Throws {@link MediaHashMismatchError} if the computed hash disagrees —
 *   nothing is written.
 * - Throws {@link UnsupportedMediaTypeError} if `sharp` cannot decode `bytes`
 *   as one of the formats `media` records a mime for.
 * - Idempotent: a hash already in `media` returns `alreadyStored: true`
 *   without touching disk or the database again, whatever bytes were sent
 *   (they were already proven to hash to this value).
 */
export async function storeMedia(
  db: InventoryDb,
  imagesDir: string,
  claimedSha256: string,
  bytes: Buffer
): Promise<StoreMediaResult> {
  const actualSha256 = createHash('sha256').update(bytes).digest('hex');
  if (actualSha256 !== claimedSha256) {
    throw new MediaHashMismatchError(claimedSha256, actualSha256);
  }

  if (mediaExists(db, claimedSha256)) {
    return { sha256: claimedSha256, alreadyStored: true };
  }

  const facts = await readImageFacts(bytes);
  if (facts === null) {
    throw new UnsupportedMediaTypeError();
  }

  const originalPath = join(imagesDir, mediaRelativePath(claimedSha256));
  mkdirSync(dirname(originalPath), { recursive: true });
  if (!existsSync(originalPath)) {
    writeFileSync(originalPath, bytes);
  }

  for (const variant of Object.keys(
    DERIVED_VARIANT_SIZES
  ) as (keyof typeof DERIVED_VARIANT_SIZES)[]) {
    const variantPath = join(imagesDir, mediaVariantRelativePath(claimedSha256, variant));
    const rendered = await renderVariant(bytes, DERIVED_VARIANT_SIZES[variant]);
    writeFileSync(variantPath, rendered);
  }

  db.insert(mediaTable)
    .values({
      sha256: claimedSha256,
      mime: facts.mime,
      byteSize: bytes.length,
      width: facts.width,
      height: facts.height,
      storedAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .run();

  return { sha256: claimedSha256, alreadyStored: false };
}
