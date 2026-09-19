/**
 * Boot-time backfill of content hashes for legacy photos (Inventory ADR-002,
 * "Migration"): every `item_photos` row that still has only a `file_path` is
 * hashed into `media`, and its bytes are copied to the content-addressed
 * store. It lives outside the SQL migration because it reads files.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import sharp from 'sharp';

import { itemPhotos, media } from './schema.js';

import type { InventoryDb } from './services/internal.js';

/**
 * Where the bytes of `sha256` live, relative to the images volume:
 * `sha256[0:2]/sha256` (ADR-002 D9).
 */
export function mediaRelativePath(sha256: string): string {
  return join(sha256.slice(0, 2), sha256);
}

/** What one {@link backfillPhotoMedia} run did. */
export interface PhotoMediaBackfillResult {
  /** Photo rows that now reference a `media` row. */
  readonly hashed: number;
  /** Photo ids whose file is absent, or resolves outside the images volume. */
  readonly missing: readonly number[];
  /** Photo ids whose file exists but is not an image `sharp` can read. */
  readonly unreadable: readonly number[];
}

/**
 * sharp's detected format name to the MIME stored on a `media` row. Shared
 * with `api/media/store.ts` (Inventory ADR-002 D9), which detects the same
 * facts for a freshly-uploaded content-addressed blob — one lookup table
 * rather than two that could drift on which formats are accepted.
 */
export const MIME_BY_FORMAT: Readonly<Record<string, string>> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heif: 'image/heic',
  gif: 'image/gif',
  tiff: 'image/tiff',
  avif: 'image/avif',
};

function insideVolume(imagesDir: string, path: string): boolean {
  const rel = relative(imagesDir, path);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/** The facts about an image `sharp` can read, projected to what `media` stores. */
export interface ImageFacts {
  readonly mime: string;
  readonly width: number | null;
  readonly height: number | null;
}

/** Read {@link ImageFacts} from raw bytes, or `null` if `sharp` can't decode them or the format isn't in {@link MIME_BY_FORMAT}. */
export async function readImageFacts(bytes: Buffer): Promise<ImageFacts | null> {
  try {
    const meta = await sharp(bytes).metadata();
    const mime = MIME_BY_FORMAT[meta.format];
    if (mime === undefined) return null;
    return { mime, width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}

/**
 * Hash every legacy photo that has a `file_path` and no `media_sha256`.
 *
 * Contract:
 * - Idempotent: a row that already has a hash is never read again, and
 *   storing bytes that are already in `media` adds nothing.
 * - A missing, escaping (`..`) or unreadable file leaves its row untouched and
 *   is reported, never thrown, so one bad file cannot block boot or the rest.
 * - The legacy file is copied, not moved: `file_path` stays valid for the
 *   legacy photo routes.
 * - Each row's `media` insert and `media_sha256` update commit together.
 *
 * @param imagesDir Absolute path of the images volume both layouts live on.
 */
export async function backfillPhotoMedia(
  db: InventoryDb,
  imagesDir: string
): Promise<PhotoMediaBackfillResult> {
  const pending = db
    .select({ id: itemPhotos.id, filePath: itemPhotos.filePath })
    .from(itemPhotos)
    .where(and(isNull(itemPhotos.mediaSha256), isNotNull(itemPhotos.filePath)))
    .all();

  let hashed = 0;
  const missing: number[] = [];
  const unreadable: number[] = [];

  for (const photo of pending) {
    if (photo.filePath === null) continue;
    const source = resolve(imagesDir, photo.filePath);
    if (!insideVolume(imagesDir, source) || !existsSync(source)) {
      missing.push(photo.id);
      continue;
    }

    const bytes = readFileSync(source);
    const facts = await readImageFacts(bytes);
    if (facts === null) {
      unreadable.push(photo.id);
      continue;
    }

    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const target = join(imagesDir, mediaRelativePath(sha256));
    if (!existsSync(target)) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
    }

    db.transaction((tx) => {
      tx.insert(media)
        .values({
          sha256,
          mime: facts.mime,
          byteSize: bytes.length,
          width: facts.width,
          height: facts.height,
          storedAt: new Date().toISOString(),
        })
        .onConflictDoNothing()
        .run();
      tx.update(itemPhotos).set({ mediaSha256: sha256 }).where(eq(itemPhotos.id, photo.id)).run();
    });
    hashed += 1;
  }

  return { hashed, missing, unreadable };
}
