import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { backfillPhotoMedia, mediaRelativePath } from '../backfill-photo-media.js';
import { itemPhotos, media } from '../schema.js';
import { seedInventoryItem } from './item-fixture.js';
import { openMigratedTestDb } from './migrated-db.js';

import type { InventoryDb } from '../services/internal.js';

let root: string;
let imagesDir: string;
let db: InventoryDb;
let itemId: string;

async function jpeg(colour: string): Promise<Buffer> {
  return sharp({ create: { width: 3, height: 2, channels: 3, background: colour } })
    .jpeg()
    .toBuffer();
}

function writeImage(relPath: string, bytes: Buffer): void {
  const full = join(imagesDir, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, bytes);
}

function addPhoto(filePath: string): number {
  const result = db.insert(itemPhotos).values({ itemId, filePath }).run();
  return Number(result.lastInsertRowid);
}

function hashOf(photoId: number): string | null {
  const row = db.select().from(itemPhotos).where(eq(itemPhotos.id, photoId)).get();
  return row?.mediaSha256 ?? null;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'inventory-photo-backfill-'));
  imagesDir = join(root, 'images');
  mkdirSync(imagesDir);
  db = openMigratedTestDb().db;
  itemId = seedInventoryItem(db, { name: 'Lamp' }).id;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('backfillPhotoMedia', () => {
  it('hashes a legacy photo into media and copies its bytes to the content-addressed path', async () => {
    const bytes = await jpeg('#ff0000');
    writeImage('items/lamp/photo_001.jpg', bytes);
    const photoId = addPhoto('items/lamp/photo_001.jpg');

    const result = await backfillPhotoMedia(db, imagesDir);

    const hash = sha256(bytes);
    expect(result).toEqual({ hashed: 1, missing: [], unreadable: [] });
    expect(hashOf(photoId)).toBe(hash);
    expect(db.select().from(media).all()).toEqual([
      expect.objectContaining({
        sha256: hash,
        mime: 'image/jpeg',
        byteSize: bytes.length,
        width: 3,
        height: 2,
      }),
    ]);
    expect(readFileSync(join(imagesDir, hash.slice(0, 2), hash))).toEqual(bytes);
    const row = db.select().from(itemPhotos).where(eq(itemPhotos.id, photoId)).get();
    expect(row?.filePath).toBe('items/lamp/photo_001.jpg');
  });

  it('reports missing, escaping and unreadable files and leaves their rows untouched', async () => {
    writeFileSync(join(root, 'outside.jpg'), await jpeg('#00ff00'));
    writeImage('items/lamp/notes.txt', Buffer.from('not an image'));
    const absent = addPhoto('items/lamp/absent.jpg');
    const escaping = addPhoto('../outside.jpg');
    const text = addPhoto('items/lamp/notes.txt');

    const result = await backfillPhotoMedia(db, imagesDir);

    expect(result).toEqual({ hashed: 0, missing: [absent, escaping], unreadable: [text] });
    expect([hashOf(absent), hashOf(escaping), hashOf(text)]).toEqual([null, null, null]);
    expect(db.select().from(media).all()).toEqual([]);
  });

  it('is idempotent, and stores identical bytes once for every photo that shares them', async () => {
    const bytes = await jpeg('#0000ff');
    writeImage('items/lamp/a.jpg', bytes);
    writeImage('items/lamp/b.jpg', bytes);
    const first = addPhoto('items/lamp/a.jpg');
    const second = addPhoto('items/lamp/b.jpg');

    expect(await backfillPhotoMedia(db, imagesDir)).toMatchObject({ hashed: 2 });
    expect(await backfillPhotoMedia(db, imagesDir)).toEqual({
      hashed: 0,
      missing: [],
      unreadable: [],
    });

    expect(hashOf(first)).toBe(sha256(bytes));
    expect(hashOf(second)).toBe(sha256(bytes));
    expect(db.select().from(media).all()).toHaveLength(1);
  });
});

describe('mediaRelativePath', () => {
  it('shards by the first two hex characters', () => {
    const hash = `ab${'0'.repeat(62)}`;
    expect(mediaRelativePath(hash)).toBe(join('ab', hash));
  });
});
