import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { normaliseForVision, visionTargetSize } from '../normalise-for-vision.js';

import type { ReceiptPart } from '../vision.js';

async function blank(
  width: number,
  height: number,
  format: 'jpeg' | 'png' | 'webp' | 'gif',
  orientation?: number
): Promise<Buffer> {
  let pipeline = sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 60, b: 200 } },
  });
  if (orientation !== undefined) pipeline = pipeline.withMetadata({ orientation });
  return pipeline[format]().toBuffer();
}

const part = (mediaType: ReceiptPart['mediaType'], bytes: Buffer): ReceiptPart => ({
  mediaType,
  dataBase64: bytes.toString('base64'),
});

async function dimensions(p: ReceiptPart): Promise<{ width: number; height: number }> {
  const meta = await sharp(Buffer.from(p.dataBase64, 'base64')).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

describe('visionTargetSize', () => {
  it('leaves a small image alone', () => {
    expect(visionTargetSize({ width: 800, height: 600 })).toEqual({ width: 800, height: 600 });
  });

  it('caps the long edge', () => {
    const size = visionTargetSize({ width: 9000, height: 100 });
    expect(size.width).toBeLessThanOrEqual(2576);
  });

  it('keeps the patch count inside the budget for a large image', () => {
    const size = visionTargetSize({ width: 6000, height: 4500 });
    expect(Math.ceil(size.width / 28) * Math.ceil(size.height / 28)).toBeLessThanOrEqual(4784);
  });

  it('applies the tighter side cap', () => {
    const size = visionTargetSize({ width: 2400, height: 1000 }, 2000);
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(2000);
  });
});

describe('normaliseForVision', () => {
  it('returns an already-small image byte for byte', async () => {
    const original = part('image/jpeg', await blank(600, 400, 'jpeg'));
    const [out] = await normaliseForVision([original]);
    expect(out).toBe(original);
  });

  it('shrinks an oversize photo inside the limits and keeps JPEG', async () => {
    const [out] = await normaliseForVision([part('image/jpeg', await blank(8200, 1200, 'jpeg'))]);
    expect(out!.mediaType).toBe('image/jpeg');
    const { width, height } = await dimensions(out!);
    expect(Math.max(width, height)).toBeLessThanOrEqual(2576);
    expect(Math.ceil(width / 28) * Math.ceil(height / 28)).toBeLessThanOrEqual(4784);
  });

  it('applies EXIF orientation so a portrait photo is not read sideways', async () => {
    const original = part('image/jpeg', await blank(500, 300, 'jpeg', 6));
    const [out] = await normaliseForVision([original]);
    expect(await dimensions(out!)).toEqual({ width: 300, height: 500 });
    expect(out).not.toBe(original);
  });

  it('keeps a PNG screenshot a lossless PNG', async () => {
    const [out] = await normaliseForVision([part('image/png', await blank(4000, 3000, 'png'))]);
    expect(out!.mediaType).toBe('image/png');
    const { width, height } = await dimensions(out!);
    expect(width).toBeLessThan(4000);
    expect(height).toBeLessThan(3000);
  });

  it('keeps WebP as WebP and turns GIF into a PNG that says so', async () => {
    const [webp] = await normaliseForVision([part('image/webp', await blank(5000, 800, 'webp'))]);
    expect(webp!.mediaType).toBe('image/webp');
    const [gif] = await normaliseForVision([part('image/gif', await blank(5000, 800, 'gif'))]);
    expect(gif!.mediaType).toBe('image/png');
    expect((await sharp(Buffer.from(gif!.dataBase64, 'base64')).metadata()).format).toBe('png');
  });

  it('caps each side at 2000 when the request carries more than 20 images', async () => {
    const wide = part('image/jpeg', await blank(2400, 600, 'jpeg'));
    const twenty = await normaliseForVision(Array.from({ length: 20 }, () => wide));
    expect((await dimensions(twenty[0]!)).width).toBe(2400);

    const twentyOne = await normaliseForVision(Array.from({ length: 21 }, () => wide));
    for (const out of twentyOne) {
      expect((await dimensions(out)).width).toBeLessThanOrEqual(2000);
    }
  });

  it('passes a PDF and a pasted body through untouched', async () => {
    const pdf: ReceiptPart = { mediaType: 'application/pdf', dataBase64: 'ZmFrZQ==' };
    const text: ReceiptPart = { mediaType: 'text/plain', dataBase64: 'aGk=' };
    const out = await normaliseForVision([pdf, text]);
    expect(out[0]).toBe(pdf);
    expect(out[1]).toBe(text);
  });

  it('passes an undecodable image through rather than failing the read', async () => {
    const broken: ReceiptPart = { mediaType: 'image/png', dataBase64: 'ZmFrZQ==' };
    const [out] = await normaliseForVision([broken]);
    expect(out).toBe(broken);
  });

  it('preserves part order', async () => {
    const a = part('image/jpeg', await blank(5000, 500, 'jpeg'));
    const pdf: ReceiptPart = { mediaType: 'application/pdf', dataBase64: 'ZmFrZQ==' };
    const out = await normaliseForVision([pdf, a]);
    expect(out.map((p) => p.mediaType)).toEqual(['application/pdf', 'image/jpeg']);
  });
});
