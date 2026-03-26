/**
 * Item photos service — attach/remove/reorder/upload photos using Drizzle ORM.
 */
import { eq, count, asc, desc } from "drizzle-orm";
import { mkdirSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { getDrizzle, getDb } from "../../../db.js";
import { itemPhotos, homeInventory } from "@pops/db-types";
import { NotFoundError, ValidationError } from "../../../shared/errors.js";
import type { ItemPhotoRow, AttachPhotoInput, UpdatePhotoInput } from "./types.js";

/** Reject path traversal attempts in file paths. */
function assertSafeFilePath(filePath: string): void {
  if (filePath.includes("..") || filePath.startsWith("/")) {
    throw new ValidationError("File path must be relative and cannot contain '..'");
  }
}

/** Count + rows for a paginated list. */
export interface PhotoListResult {
  rows: ItemPhotoRow[];
  total: number;
}

/** Validate that an inventory item exists. */
function assertItemExists(itemId: string): void {
  const db = getDrizzle();
  const [item] = db
    .select({ id: homeInventory.id })
    .from(homeInventory)
    .where(eq(homeInventory.id, itemId))
    .all();
  if (!item) throw new NotFoundError("Inventory item", itemId);
}

/** Get a single photo by ID. Throws NotFoundError if missing. */
function getPhoto(id: number): ItemPhotoRow {
  const db = getDrizzle();
  const [row] = db.select().from(itemPhotos).where(eq(itemPhotos.id, id)).all();
  if (!row) throw new NotFoundError("Item photo", String(id));
  return row;
}

/** Attach a photo to an inventory item. */
export function attachPhoto(input: AttachPhotoInput): ItemPhotoRow {
  const db = getDrizzle();

  assertItemExists(input.itemId);
  assertSafeFilePath(input.filePath);

  const result = db
    .insert(itemPhotos)
    .values({
      itemId: input.itemId,
      filePath: input.filePath,
      caption: input.caption ?? null,
      sortOrder: input.sortOrder,
    })
    .run();

  const id = Number(result.lastInsertRowid);
  return getPhoto(id);
}

/** Remove a photo by ID. Deletes the DB record and the file from disk. */
export function removePhoto(id: number): void {
  const photo = getPhoto(id); // Validates existence
  const db = getDrizzle();

  // Delete file from disk if it exists
  const imagesDir = getImagesDir();
  const absolutePath = join(imagesDir, photo.filePath);
  if (existsSync(absolutePath)) {
    unlinkSync(absolutePath);
  }

  db.delete(itemPhotos).where(eq(itemPhotos.id, id)).run();
}

/** Update a photo's caption or sort order. */
export function updatePhoto(id: number, input: UpdatePhotoInput): ItemPhotoRow {
  const db = getDrizzle();

  getPhoto(id); // Validates existence

  const updates: Partial<typeof itemPhotos.$inferInsert> = {};
  let hasUpdates = false;

  if (input.caption !== undefined) {
    updates.caption = input.caption ?? null;
    hasUpdates = true;
  }
  if (input.sortOrder !== undefined) {
    updates.sortOrder = input.sortOrder;
    hasUpdates = true;
  }

  if (hasUpdates) {
    db.update(itemPhotos).set(updates).where(eq(itemPhotos.id, id)).run();
  }

  return getPhoto(id);
}

/** List photos for an item, ordered by sortOrder. */
export function listPhotosForItem(itemId: string, limit: number, offset: number): PhotoListResult {
  const db = getDrizzle();

  const rows = db
    .select()
    .from(itemPhotos)
    .where(eq(itemPhotos.itemId, itemId))
    .orderBy(asc(itemPhotos.sortOrder))
    .limit(limit)
    .offset(offset)
    .all();

  const [countResult] = db
    .select({ total: count() })
    .from(itemPhotos)
    .where(eq(itemPhotos.itemId, itemId))
    .all();

  return { rows, total: countResult?.total ?? 0 };
}

/**
 * Reorder photos for an item. Sets sortOrder based on position
 * in the orderedIds array (0-indexed).
 */
export function reorderPhotos(itemId: string, orderedIds: number[]): ItemPhotoRow[] {
  const db = getDrizzle();
  const rawDb = getDb();

  assertItemExists(itemId);

  // Validate all photos exist and belong to this item before mutating
  for (const photoId of orderedIds) {
    const photo = getPhoto(photoId);
    if (photo.itemId !== itemId) {
      throw new NotFoundError("Item photo", String(photoId));
    }
  }

  // Apply all sort order updates in a single transaction
  rawDb.transaction(() => {
    for (let i = 0; i < orderedIds.length; i++) {
      const photoId = orderedIds[i];
      if (photoId === undefined) continue;
      db.update(itemPhotos).set({ sortOrder: i }).where(eq(itemPhotos.id, photoId)).run();
    }
  })();

  // Return all photos in new order
  return db
    .select()
    .from(itemPhotos)
    .where(eq(itemPhotos.itemId, itemId))
    .orderBy(asc(itemPhotos.sortOrder))
    .all();
}

// ---------------------------------------------------------------------------
// Photo upload with compression
// ---------------------------------------------------------------------------

const MAX_DIMENSION = 1920;

/** Get the base directory for inventory images. */
export function getImagesDir(): string {
  return process.env.INVENTORY_IMAGES_DIR ?? "./data/inventory/images";
}

/**
 * Determine the next sequential filename for a given item directory.
 * Scans existing photo_NNN.jpg files and returns the next number.
 */
export function nextPhotoFilename(itemDir: string): string {
  let maxNum = 0;
  try {
    const files = readdirSync(itemDir);
    for (const file of files) {
      const match = file.match(/^photo_(\d+)\.jpg$/);
      if (match) {
        const num = parseInt(match[1]!, 10);
        if (num > maxNum) maxNum = num;
      }
    }
  } catch {
    // Directory doesn't exist yet — start at 001
  }
  return `photo_${String(maxNum + 1).padStart(3, "0")}.jpg`;
}

/**
 * Compress an image buffer: resize to fit within 1920x1920 bounding box,
 * convert HEIC/HEIF to JPEG, strip EXIF metadata.
 */
export async function compressImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate() // Auto-rotate based on EXIF orientation before stripping
    .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .jpeg({ quality: 85 })
    .toBuffer();
}

export interface UploadPhotoInput {
  itemId: string;
  /** Base64-encoded image data. */
  data: string;
  caption?: string | null;
}

export interface UploadPhotoResult {
  photo: ItemPhotoRow;
  filePath: string;
}

/**
 * Upload a photo for an inventory item.
 * Compresses the image (1920px max, JPEG, strip EXIF), stores to disk,
 * creates the DB record with a sequential filename.
 */
export async function uploadPhoto(input: UploadPhotoInput): Promise<UploadPhotoResult> {
  const db = getDrizzle();

  assertItemExists(input.itemId);

  const imagesDir = getImagesDir();
  const itemDir = join(imagesDir, "items", input.itemId);

  // Create directory if it doesn't exist
  mkdirSync(itemDir, { recursive: true });

  // Compress image
  const rawBuffer = Buffer.from(input.data, "base64");
  const compressed = await compressImage(rawBuffer);

  // Determine sequential filename
  const filename = nextPhotoFilename(itemDir);
  const absolutePath = join(itemDir, filename);

  // Write compressed image to disk
  await sharp(compressed).toFile(absolutePath);

  // Store relative path in DB (relative to imagesDir)
  const relativePath = `items/${input.itemId}/${filename}`;

  // Get the next sort order
  const [maxSort] = db
    .select({ max: itemPhotos.sortOrder })
    .from(itemPhotos)
    .where(eq(itemPhotos.itemId, input.itemId))
    .orderBy(desc(itemPhotos.sortOrder))
    .limit(1)
    .all();
  const nextSortOrder = (maxSort?.max ?? -1) + 1;

  const result = db
    .insert(itemPhotos)
    .values({
      itemId: input.itemId,
      filePath: relativePath,
      caption: input.caption ?? null,
      sortOrder: nextSortOrder,
    })
    .run();

  const id = Number(result.lastInsertRowid);
  const photo = getPhoto(id);

  return { photo, filePath: relativePath };
}
