import sharp from 'sharp';

import { isImageMediaType } from './vision.js';

import type { Sharp } from 'sharp';

import type { ReceiptImageMediaType, ReceiptPart } from './vision.js';

const MAX_LONG_EDGE = 2576;
const MAX_PATCHES = 4784;
const PATCH_SIZE = 28;
const MANY_IMAGES_THRESHOLD = 20;
const MANY_IMAGES_MAX_SIDE = 2000;
const NEAR_REQUEST_LIMIT_BASE64 = 9_500_000;
const JPEG_QUALITY = 88;
const OVERSIZE_SHRINK_STEP = 0.8;
const OVERSIZE_MAX_PASSES = 6;

interface Size {
  readonly width: number;
  readonly height: number;
}

function patches({ width, height }: Size): number {
  return Math.ceil(width / PATCH_SIZE) * Math.ceil(height / PATCH_SIZE);
}

/**
 * The largest size inside `size` that the model reads without resampling it
 * itself: long edge and patch budget capped, and never larger than the
 * original. `maxSide` is the tighter per-side cap that applies when a
 * request carries many images.
 */
export function visionTargetSize(size: Size, maxSide: number = MAX_LONG_EDGE): Size {
  const longEdge = Math.min(MAX_LONG_EDGE, maxSide);
  let scale = Math.min(1, longEdge / Math.max(size.width, size.height));
  let candidate = scaled(size, scale);
  while (patches(candidate) > MAX_PATCHES) {
    scale *= 0.98;
    candidate = scaled(size, scale);
  }
  return candidate;
}

function scaled(size: Size, scale: number): Size {
  return {
    width: Math.max(1, Math.floor(size.width * scale)),
    height: Math.max(1, Math.floor(size.height * scale)),
  };
}

function encode(
  pipeline: Sharp,
  mediaType: ReceiptImageMediaType
): { pipeline: Sharp; mediaType: ReceiptImageMediaType } {
  if (mediaType === 'image/jpeg') {
    return { pipeline: pipeline.jpeg({ quality: JPEG_QUALITY }), mediaType };
  }
  if (mediaType === 'image/webp') {
    return { pipeline: pipeline.webp({ lossless: true }), mediaType };
  }
  return { pipeline: pipeline.png(), mediaType: 'image/png' };
}

async function normaliseImage(
  part: ReceiptPart,
  sourceType: ReceiptImageMediaType,
  maxSide: number
): Promise<ReceiptPart> {
  const original = Buffer.from(part.dataBase64, 'base64');
  const metadata = await sharp(original).metadata();
  const rawWidth = metadata.width;
  const rawHeight = metadata.height;
  if (rawWidth === undefined || rawHeight === undefined) return part;

  const orientation = metadata.orientation ?? 1;
  const rotates = orientation > 1;
  const upright: Size =
    orientation >= 5
      ? { width: rawHeight, height: rawWidth }
      : { width: rawWidth, height: rawHeight };

  let target = visionTargetSize(upright, maxSide);
  const resizes = target.width !== upright.width || target.height !== upright.height;
  const oversize = part.dataBase64.length >= NEAR_REQUEST_LIMIT_BASE64;
  if (!rotates && !resizes && !oversize) return part;

  for (let pass = 0; ; pass++) {
    const { pipeline, mediaType } = encode(
      sharp(original).rotate().resize(target.width, target.height, {
        fit: 'inside',
        withoutEnlargement: true,
      }),
      sourceType
    );
    const output = await pipeline.toBuffer();
    const dataBase64 = output.toString('base64');
    if (dataBase64.length < NEAR_REQUEST_LIMIT_BASE64 || pass === OVERSIZE_MAX_PASSES) {
      return { mediaType, dataBase64 };
    }
    target = scaled(target, OVERSIZE_SHRINK_STEP);
  }
}

/**
 * The copy of `parts` that is sent to the model. Each image is rotated
 * upright from its EXIF orientation and fitted inside the size the model
 * reads without resampling; it is re-encoded only when that changed it or
 * its base64 is near the request limit. JPEG stays JPEG, PNG and WebP stay
 * lossless, and a GIF becomes a PNG. Everything else passes through, and so
 * does an image sharp cannot decode, which the API then refuses with a 400
 * that is reported as such rather than hidden here.
 *
 * Only the model's copy changes: callers keep the original parts for
 * storage, dedup and capture-time reading.
 */
export async function normaliseForVision(
  parts: readonly ReceiptPart[]
): Promise<readonly ReceiptPart[]> {
  const imageCount = parts.filter((part) => isImageMediaType(part.mediaType)).length;
  const maxSide = imageCount > MANY_IMAGES_THRESHOLD ? MANY_IMAGES_MAX_SIDE : MAX_LONG_EDGE;

  return Promise.all(
    parts.map(async (part) => {
      if (!isImageMediaType(part.mediaType)) return part;
      try {
        return await normaliseImage(part, part.mediaType, maxSide);
      } catch {
        return part;
      }
    })
  );
}
