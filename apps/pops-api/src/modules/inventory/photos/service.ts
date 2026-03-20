/**
 * Item photos service — attach/remove/reorder photos using Drizzle ORM.
 */
import { eq, count, asc } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { itemPhotos, homeInventory } from "@pops/db-types";
import { NotFoundError } from "../../../shared/errors.js";
import type { ItemPhotoRow, AttachPhotoInput, UpdatePhotoInput } from "./types.js";

/** Count + rows for a paginated list. */
export interface PhotoListResult {
  rows: ItemPhotoRow[];
  total: number;
}

/** Validate that an inventory item exists. */
function assertItemExists(itemId: string): void {
  const db = getDrizzle();
  const [item] = db.select({ id: homeInventory.id }).from(homeInventory).where(eq(homeInventory.id, itemId)).all();
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

  db.insert(itemPhotos)
    .values({
      itemId: input.itemId,
      filePath: input.filePath,
      caption: input.caption ?? null,
      sortOrder: input.sortOrder,
    })
    .run();

  // Fetch the created row (last inserted)
  const [created] = db
    .select()
    .from(itemPhotos)
    .where(eq(itemPhotos.itemId, input.itemId))
    .orderBy(asc(itemPhotos.id))
    .all()
    .slice(-1);

  return created;
}

/** Remove a photo by ID. */
export function removePhoto(id: number): void {
  getPhoto(id); // Validates existence
  const db = getDrizzle();
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
export function listPhotosForItem(
  itemId: string,
  limit: number,
  offset: number
): PhotoListResult {
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

  return { rows, total: countResult.total };
}

/**
 * Reorder photos for an item. Sets sortOrder based on position
 * in the orderedIds array (0-indexed).
 */
export function reorderPhotos(itemId: string, orderedIds: number[]): ItemPhotoRow[] {
  const db = getDrizzle();

  assertItemExists(itemId);

  for (let i = 0; i < orderedIds.length; i++) {
    const photo = getPhoto(orderedIds[i]);
    if (photo.itemId !== itemId) {
      throw new NotFoundError("Item photo", String(orderedIds[i]));
    }
    db.update(itemPhotos)
      .set({ sortOrder: i })
      .where(eq(itemPhotos.id, orderedIds[i]))
      .run();
  }

  // Return all photos in new order
  return db
    .select()
    .from(itemPhotos)
    .where(eq(itemPhotos.itemId, itemId))
    .orderBy(asc(itemPhotos.sortOrder))
    .all();
}
