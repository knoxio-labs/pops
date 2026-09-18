/**
 * Derived-size rendering for content-addressed media (Inventory ADR-002 D9).
 *
 * A stored blob has exactly two derived variants, `thumb` (256px) and
 * `medium` (1024px), re-encoded as JPEG; `full` is the original bytes,
 * served as-is with their original mime type.
 */
import { join } from 'node:path';

import sharp from 'sharp';

import { mediaRelativePath } from '../../db/backfill-photo-media.js';

export type MediaVariant = 'thumb' | 'medium' | 'full';

/** Longest-edge pixel size for each derived variant (ADR-002 D9: "256 and 1024 px"). */
export const DERIVED_VARIANT_SIZES: Readonly<Record<'thumb' | 'medium', number>> = {
  thumb: 256,
  medium: 1024,
};

/**
 * Resize `bytes` so its longest edge is `size` px, never upscaling, and
 * re-encode as JPEG. Mirrors the item-photos upload pipeline's compression
 * settings (`api/modules/photos/service.ts`) so a derived variant looks
 * consistent with the rest of the item's photos.
 */
export async function renderVariant(bytes: Buffer, size: number): Promise<Buffer> {
  return sharp(bytes)
    .rotate()
    .resize(size, size, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/**
 * Where a derived variant's bytes live on disk, relative to the images
 * volume: the original's content-addressed path plus a variant suffix, so
 * `thumb`/`medium` sit beside `full` under the same `sha256[0:2]/` shard.
 */
export function mediaVariantRelativePath(sha256: string, variant: 'thumb' | 'medium'): string {
  return `${mediaRelativePath(sha256)}.${variant}.jpg`;
}

/** Absolute path to a variant's bytes: `full` is the original file, `thumb`/`medium` its derived siblings. */
export function mediaVariantPath(imagesDir: string, sha256: string, variant: MediaVariant): string {
  return variant === 'full'
    ? join(imagesDir, mediaRelativePath(sha256))
    : join(imagesDir, mediaVariantRelativePath(sha256, variant));
}

/** The `ETag` value for one stored blob's variant (mirrors purchases' receipt-bytes convention). */
export function mediaVariantETag(sha256: string, variant: MediaVariant): string {
  return variant === 'full' ? `"${sha256}"` : `"${sha256}-${variant}"`;
}

/** Type guard for a request-supplied `variant` query value. */
export function isMediaVariant(value: unknown): value is MediaVariant {
  return value === 'thumb' || value === 'medium' || value === 'full';
}
