import { z } from 'zod';

import type { ItemDocumentIngestionRow, ItemDocumentRow } from '../../../db/index.js';

export type { ItemDocumentIngestionRow, ItemDocumentRow };

export const DOCUMENT_TYPES = ['receipt', 'warranty', 'manual', 'invoice', 'other'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** API response shape for an item document link. */
export interface ItemDocument {
  id: number;
  itemId: string;
  paperlessDocumentId: number;
  documentType: string;
  title: string | null;
  createdAt: string;
}

/** Map a DB row to the API response shape. */
export function toItemDocument(row: ItemDocumentRow): ItemDocument {
  return {
    id: row.id,
    itemId: row.itemId,
    paperlessDocumentId: row.paperlessDocumentId,
    documentType: row.documentType,
    title: row.title,
    createdAt: row.createdAt,
  };
}

/** API response shape for an upload still being consumed, or one that failed. */
export interface DocumentIngestion {
  id: number;
  itemId: string;
  taskId: string;
  documentType: string;
  title: string | null;
  fileName: string;
  state: 'pending' | 'failed';
  reason: string | null;
  createdAt: string;
}

/** Map an ingestion row to the API response shape. */
export function toDocumentIngestion(row: ItemDocumentIngestionRow): DocumentIngestion {
  return {
    id: row.id,
    itemId: row.itemId,
    taskId: row.taskId,
    documentType: row.documentType,
    title: row.title,
    fileName: row.fileName,
    state: row.state,
    reason: row.reason,
    createdAt: row.createdAt,
  };
}

/** Zod schema for linking a document to an item. */
export const LinkDocumentSchema = z.object({
  itemId: z.string().min(1, 'Item ID is required'),
  paperlessDocumentId: z.number().int().positive('Document ID must be a positive integer'),
  documentType: z.enum(DOCUMENT_TYPES),
  title: z.string().optional(),
});
export type LinkDocumentInput = z.infer<typeof LinkDocumentSchema>;

/** Zod schema for listing documents for an item. */
export const DocumentQuerySchema = z.object({
  itemId: z.string().min(1, 'Item ID is required'),
  limit: z.coerce.number().positive().max(500).optional(),
  offset: z.coerce.number().nonnegative().optional(),
});
export type DocumentQuery = z.infer<typeof DocumentQuerySchema>;
