/**
 * Item photos service — attach/remove/reorder photos using Drizzle ORM.
 */
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { and, asc, count, eq, isNotNull, type SQL } from 'drizzle-orm';
import sharp from 'sharp';

import { items, type InventoryDb, itemPhotos } from '../../../db/index.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';
import { getInventoryImagesDir } from './paths.js';
import { hasFilePath } from './types.js';

import type {
  AttachPhotoInput,
  FilePhotoRow,
  UpdatePhotoInput,
  UploadPhotoInput,
} from './types.js';

/** Reject path traversal attempts in file paths. */
function assertSafeFilePath(filePath: string): void {
  if (filePath.includes('..') || filePath.startsWith('/')) {
    throw new ValidationError("File path must be relative and cannot contain '..'");
  }
}

/** Count + rows for a paginated list. */
export interface PhotoListResult {
  rows: FilePhotoRow[];
  total: number;
}

/** Validate that an inventory item exists. */
function assertItemExists(db: InventoryDb, itemId: string): void {
  const [item] = db.select({ id: items.id }).from(items).where(eq(items.id, itemId)).all();
  if (!item) throw new NotFoundError('Inventory item', itemId);
}

/**
 * Get a single file-backed photo by ID. Throws NotFoundError if missing, or if
 * it is a hash-only photo this legacy API cannot serve.
 */
function getPhoto(db: InventoryDb, id: number): FilePhotoRow {
  const [row] = db.select().from(itemPhotos).where(eq(itemPhotos.id, id)).all();
  if (!row || !hasFilePath(row)) throw new NotFoundError('Item photo', String(id));
  return row;
}

/** An item's file-backed photos, in position order. */
function filePhotosOf(itemId: string): SQL | undefined {
  return and(eq(itemPhotos.itemId, itemId), isNotNull(itemPhotos.filePath));
}

/**
 * Compress an image buffer: resize to max 1920px on longest side,
 * convert HEIC/HEIF to JPEG, and strip all EXIF metadata.
 */
async function compressImage(inputBuffer: Buffer): Promise<Buffer> {
  return sharp(inputBuffer)
    .rotate()
    .resize(1920, 1920, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/**
 * Determine the next sequential photo filename within an item's directory.
 * Returns a path like `items/{itemId}/photo_001.jpg`.
 */
function nextPhotoFilename(baseDir: string, itemId: string): string {
  const itemDir = join(baseDir, 'items', itemId);
  mkdirSync(itemDir, { recursive: true });

  const existing = existsSync(itemDir)
    ? readdirSync(itemDir).filter((f) => /^photo_\d+\.jpg$/.test(f))
    : [];

  const nextNum = existing.length + 1;
  const seq = String(nextNum).padStart(3, '0');
  return join('items', itemId, `photo_${seq}.jpg`);
}

/** Upload, compress, and attach a photo to an inventory item. */
export async function uploadPhoto(db: InventoryDb, input: UploadPhotoInput): Promise<FilePhotoRow> {
  assertItemExists(db, input.itemId);

  const baseDir = getInventoryImagesDir();

  const compressed = await compressImage(input.buffer);

  const relPath = nextPhotoFilename(baseDir, input.itemId);
  const fullPath = resolve(baseDir, relPath);
  writeFileSync(fullPath, compressed);

  const result = db
    .insert(itemPhotos)
    .values({
      itemId: input.itemId,
      filePath: relPath,
      caption: input.caption ?? null,
      position: input.sortOrder,
    })
    .run();

  const id = Number(result.lastInsertRowid);
  return getPhoto(db, id);
}

/** Attach a photo to an inventory item. */
export function attachPhoto(db: InventoryDb, input: AttachPhotoInput): FilePhotoRow {
  assertItemExists(db, input.itemId);
  assertSafeFilePath(input.filePath);

  const result = db
    .insert(itemPhotos)
    .values({
      itemId: input.itemId,
      filePath: input.filePath,
      caption: input.caption ?? null,
      position: input.sortOrder,
    })
    .run();

  const id = Number(result.lastInsertRowid);
  return getPhoto(db, id);
}

/** Remove a photo by ID. Deletes both the database record and the file from disk. */
export function removePhoto(db: InventoryDb, id: number): void {
  const photo = getPhoto(db, id);

  const baseDir = getInventoryImagesDir();
  const fullPath = resolve(baseDir, photo.filePath);
  if (existsSync(fullPath)) {
    unlinkSync(fullPath);
  }

  db.delete(itemPhotos).where(eq(itemPhotos.id, id)).run();
}

/** Update a photo's caption or sort order. */
export function updatePhoto(db: InventoryDb, id: number, input: UpdatePhotoInput): FilePhotoRow {
  getPhoto(db, id);

  const updates: Partial<typeof itemPhotos.$inferInsert> = {};
  let hasUpdates = false;

  if (input.caption !== undefined) {
    updates.caption = input.caption ?? null;
    hasUpdates = true;
  }
  if (input.sortOrder !== undefined) {
    updates.position = input.sortOrder;
    hasUpdates = true;
  }

  if (hasUpdates) {
    db.update(itemPhotos).set(updates).where(eq(itemPhotos.id, id)).run();
  }

  return getPhoto(db, id);
}

/** List photos for an item, ordered by sortOrder. */
export function listPhotosForItem(
  db: InventoryDb,
  itemId: string,
  limit: number,
  offset: number
): PhotoListResult {
  const rows = db
    .select()
    .from(itemPhotos)
    .where(filePhotosOf(itemId))
    .orderBy(asc(itemPhotos.position))
    .limit(limit)
    .offset(offset)
    .all()
    .filter(hasFilePath);

  const [countResult] = db
    .select({ total: count() })
    .from(itemPhotos)
    .where(filePhotosOf(itemId))
    .all();

  return { rows, total: countResult?.total ?? 0 };
}

/**
 * Reorder photos for an item. Sets sortOrder based on position
 * in the orderedIds array (0-indexed).
 */
export function reorderPhotos(
  db: InventoryDb,
  itemId: string,
  orderedIds: number[]
): FilePhotoRow[] {
  assertItemExists(db, itemId);

  for (const photoId of orderedIds) {
    const photo = getPhoto(db, photoId);
    if (photo.itemId !== itemId) {
      throw new NotFoundError('Item photo', String(photoId));
    }
  }

  db.transaction((tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      const photoId = orderedIds[i];
      if (photoId === undefined) continue;
      tx.update(itemPhotos).set({ position: i }).where(eq(itemPhotos.id, photoId)).run();
    }
  });

  return db
    .select()
    .from(itemPhotos)
    .where(filePhotosOf(itemId))
    .orderBy(asc(itemPhotos.position))
    .all()
    .filter(hasFilePath);
}
