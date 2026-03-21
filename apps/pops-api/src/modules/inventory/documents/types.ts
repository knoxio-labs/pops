import { z } from "zod";
import type { ItemDocumentRow } from "@pops/db-types";

export type { ItemDocumentRow };

export const DOCUMENT_TYPES = ["receipt", "warranty", "manual", "other"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** API response shape for a linked document. */
export interface ItemDocument {
  id: number;
  itemId: string;
  paperlessDocumentId: number;
  documentType: string;
  title: string | null;
  linkedAt: string;
}

/** Map a SQLite row to the API response shape. */
export function toDocument(row: ItemDocumentRow): ItemDocument {
  return {
    id: row.id,
    itemId: row.itemId,
    paperlessDocumentId: row.paperlessDocumentId,
    documentType: row.documentType,
    title: row.title,
    linkedAt: row.linkedAt,
  };
}

/** Zod schema for linking a document to an item. */
export const LinkDocumentSchema = z.object({
  itemId: z.string().min(1, "Item ID is required"),
  paperlessDocumentId: z.number().int().positive("Document ID is required"),
  documentType: z.enum(DOCUMENT_TYPES),
  title: z.string().nullable().optional(),
});
export type LinkDocumentInput = z.infer<typeof LinkDocumentSchema>;

/** Zod schema for listing documents for an item. */
export const DocumentQuerySchema = z.object({
  itemId: z.string().min(1, "Item ID is required"),
  limit: z.coerce.number().positive().max(500).optional(),
  offset: z.coerce.number().nonnegative().optional(),
});
export type DocumentQuery = z.infer<typeof DocumentQuerySchema>;
