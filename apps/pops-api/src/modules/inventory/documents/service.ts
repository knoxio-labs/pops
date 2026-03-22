/**
 * Item documents service — link/unlink Paperless-ngx documents using Drizzle ORM.
 */
import { eq, count } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { itemDocuments, homeInventory } from "@pops/db-types";
import { NotFoundError, ConflictError } from "../../../shared/errors.js";
import type { ItemDocumentRow, LinkDocumentInput } from "./types.js";

/** Count + rows for a paginated list. */
export interface DocumentListResult {
  rows: ItemDocumentRow[];
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

/** Get a single document link by ID. Throws NotFoundError if missing. */
function getDocument(id: number): ItemDocumentRow {
  const db = getDrizzle();
  const [row] = db.select().from(itemDocuments).where(eq(itemDocuments.id, id)).all();
  if (!row) throw new NotFoundError("Item document", String(id));
  return row;
}

/** Link a Paperless-ngx document to an inventory item. */
export function linkDocument(input: LinkDocumentInput): ItemDocumentRow {
  const db = getDrizzle();

  assertItemExists(input.itemId);

  try {
    const result = db
      .insert(itemDocuments)
      .values({
        itemId: input.itemId,
        paperlessDocumentId: input.paperlessDocumentId,
        documentType: input.documentType,
        title: input.title ?? null,
      })
      .run();

    const id = Number(result.lastInsertRowid);
    return getDocument(id);
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE constraint")) {
      throw new ConflictError("This document is already linked to this item");
    }
    throw err;
  }
}

/** Unlink a document by link ID. */
export function unlinkDocument(id: number): void {
  getDocument(id);
  const db = getDrizzle();
  db.delete(itemDocuments).where(eq(itemDocuments.id, id)).run();
}

/** List documents linked to an item. */
export function listDocumentsForItem(
  itemId: string,
  limit: number,
  offset: number
): DocumentListResult {
  const db = getDrizzle();

  const rows = db
    .select()
    .from(itemDocuments)
    .where(eq(itemDocuments.itemId, itemId))
    .limit(limit)
    .offset(offset)
    .all();

  const [countResult] = db
    .select({ total: count() })
    .from(itemDocuments)
    .where(eq(itemDocuments.itemId, itemId))
    .all();

  return { rows, total: countResult.total };
}
