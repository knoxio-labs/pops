import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMigratedTestDb, type MigratedTestDb } from '../../db/__tests__/migrated-db.js';
import { mediaRelativePath } from '../../db/backfill-photo-media.js';
import {
  MediaHashMismatchError,
  UnsupportedMediaTypeError,
  getMedia,
  isValidSha256,
  mediaExists,
  storeMedia,
} from './store.js';
import { mediaVariantRelativePath } from './variants.js';

let testDb: MigratedTestDb;
let imagesDir: string;

async function jpeg(colour: string, width = 8, height = 6): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: colour } })
    .jpeg()
    .toBuffer();
}

function sha256Of(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

beforeEach(() => {
  testDb = openMigratedTestDb();
  imagesDir = mkdtempSync(join(tmpdir(), 'inv-media-'));
});

afterEach(() => {
  testDb.raw.close();
  rmSync(imagesDir, { recursive: true, force: true });
});

describe('isValidSha256', () => {
  it('accepts a 64-char lowercase hex digest', () => {
    expect(isValidSha256('a'.repeat(64))).toBe(true);
  });

  it.each([
    ['too short', 'a'.repeat(63)],
    ['uppercase', 'A'.repeat(64)],
    ['non-hex', 'z'.repeat(64)],
    ['empty', ''],
  ])('rejects %s', (_label, value) => {
    expect(isValidSha256(value)).toBe(false);
  });
});

describe('storeMedia', () => {
  it('stores bytes, records the media row, and derives thumb + medium variants', async () => {
    const bytes = await jpeg('red');
    const sha256 = sha256Of(bytes);

    const result = await storeMedia(testDb.db, imagesDir, sha256, bytes);

    expect(result).toEqual({ sha256, alreadyStored: false });

    const record = getMedia(testDb.db, sha256);
    expect(record).toMatchObject({ sha256, mime: 'image/jpeg', byteSize: bytes.length });
    expect(record?.width).toBe(8);
    expect(record?.height).toBe(6);

    expect(existsSync(join(imagesDir, mediaRelativePath(sha256)))).toBe(true);
    expect(readFileSync(join(imagesDir, mediaRelativePath(sha256)))).toEqual(bytes);
    expect(existsSync(join(imagesDir, mediaVariantRelativePath(sha256, 'thumb')))).toBe(true);
    expect(existsSync(join(imagesDir, mediaVariantRelativePath(sha256, 'medium')))).toBe(true);

    const thumbMeta = await sharp(
      readFileSync(join(imagesDir, mediaVariantRelativePath(sha256, 'thumb')))
    ).metadata();
    expect(Math.max(thumbMeta.width ?? 0, thumbMeta.height ?? 0)).toBeLessThanOrEqual(256);
  });

  it('answers alreadyStored on a re-upload of the same bytes and writes nothing again', async () => {
    const bytes = await jpeg('blue');
    const sha256 = sha256Of(bytes);
    await storeMedia(testDb.db, imagesDir, sha256, bytes);

    const originalPath = join(imagesDir, mediaRelativePath(sha256));
    const before = readFileSync(originalPath);

    const second = await storeMedia(testDb.db, imagesDir, sha256, bytes);

    expect(second).toEqual({ sha256, alreadyStored: true });
    expect(readFileSync(originalPath)).toEqual(before);
  });

  it('rejects a claimed hash that does not match the bytes, writing nothing', async () => {
    const bytes = await jpeg('green');
    const wrongSha256 = sha256Of(await jpeg('yellow'));

    await expect(storeMedia(testDb.db, imagesDir, wrongSha256, bytes)).rejects.toBeInstanceOf(
      MediaHashMismatchError
    );

    expect(mediaExists(testDb.db, wrongSha256)).toBe(false);
    expect(existsSync(join(imagesDir, mediaRelativePath(wrongSha256)))).toBe(false);
  });

  it('rejects bytes sharp cannot decode as an image, writing nothing', async () => {
    const bytes = Buffer.from('not an image');
    const sha256 = sha256Of(bytes);

    await expect(storeMedia(testDb.db, imagesDir, sha256, bytes)).rejects.toBeInstanceOf(
      UnsupportedMediaTypeError
    );

    expect(mediaExists(testDb.db, sha256)).toBe(false);
  });
});

describe('mediaExists', () => {
  it('is false for a hash nothing has stored, true once storeMedia commits it', async () => {
    const bytes = await jpeg('purple');
    const sha256 = sha256Of(bytes);

    expect(mediaExists(testDb.db, sha256)).toBe(false);

    await storeMedia(testDb.db, imagesDir, sha256, bytes);

    expect(mediaExists(testDb.db, sha256)).toBe(true);
  });
});

describe('getMedia', () => {
  it('returns null for a hash nothing has stored', () => {
    expect(getMedia(testDb.db, 'a'.repeat(64))).toBeNull();
  });
});
