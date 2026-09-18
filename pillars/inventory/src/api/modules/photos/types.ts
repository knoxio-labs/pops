import { z } from 'zod';

import type { ItemPhotoRow } from '../../../db/index.js';

export type { ItemPhotoRow };

/**
 * A photo row the legacy photo API can serve: one that still has a file on
 * the images volume. Photos attached by content hash only (Inventory ADR-002
 * D9) have no `file_path` and are invisible to this API.
 */
export type FilePhotoRow = ItemPhotoRow & { filePath: string };

/** Narrow a photo row to {@link FilePhotoRow}. */
export function hasFilePath(row: ItemPhotoRow): row is FilePhotoRow {
  return row.filePath !== null;
}

/** API response shape for an item photo. */
export interface ItemPhoto {
  id: number;
  itemId: string;
  filePath: string;
  caption: string | null;
  sortOrder: number;
  createdAt: string;
}

/** Map a photo row to the legacy API shape, whose `sortOrder` is the row's `position`. */
export function toPhoto(row: FilePhotoRow): ItemPhoto {
  return {
    id: row.id,
    itemId: row.itemId,
    filePath: row.filePath,
    caption: row.caption,
    sortOrder: row.position,
    createdAt: row.createdAt,
  };
}

/** Zod schema for attaching a photo to an item. */
export const AttachPhotoSchema = z.object({
  itemId: z.string().min(1, 'Item ID is required'),
  filePath: z.string().min(1, 'File path is required'),
  caption: z.string().nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional().default(0),
});
export type AttachPhotoInput = z.infer<typeof AttachPhotoSchema>;

/**
 * Input for uploading and compressing a photo (multipart upload).
 * The buffer contains the raw file bytes (JPEG, PNG, HEIC, etc.).
 */
export interface UploadPhotoInput {
  itemId: string;
  buffer: Buffer;
  caption?: string | null;
  sortOrder: number;
}

/** Zod schema for the base64 JSON upload request body. */
export const UploadPhotoSchema = z.object({
  itemId: z.string().min(1, 'Item ID is required'),
  /** Base64-encoded file bytes. The REST handler decodes this to a Buffer. */
  fileBase64: z.string().min(1, 'File content is required'),
  caption: z.string().nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional().default(0),
});
export type UploadPhotoSchemaInput = z.infer<typeof UploadPhotoSchema>;

/** Zod schema for updating a photo. */
export const UpdatePhotoSchema = z.object({
  caption: z.string().nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});
export type UpdatePhotoInput = z.infer<typeof UpdatePhotoSchema>;

/** Zod schema for listing photos for an item. */
export const PhotoQuerySchema = z.object({
  itemId: z.string().min(1, 'Item ID is required'),
  limit: z.coerce.number().positive().max(500).optional(),
  offset: z.coerce.number().nonnegative().optional(),
});
export type PhotoQuery = z.infer<typeof PhotoQuerySchema>;

/** Zod schema for reordering photos. */
export const ReorderPhotosSchema = z.object({
  itemId: z.string().min(1, 'Item ID is required'),
  orderedIds: z.array(z.number().int().positive()).min(1, 'At least one photo ID is required'),
});
export type ReorderPhotosInput = z.infer<typeof ReorderPhotosSchema>;
