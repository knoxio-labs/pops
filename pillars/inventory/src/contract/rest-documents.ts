/**
 * `documents.*` sub-router — link, edit and unlink Paperless-ngx documents on
 * items, list them with the item's uploads still being consumed, list the
 * links to one Paperless document, and dismiss an upload.
 *
 * The upload itself (`POST /items/:itemId/documents/upload`) and the file
 * download (`GET /api/inventory/documents/:id/file`) carry raw bytes, so they
 * are raw routes in `api/files/` rather than contract routes; the upload
 * answers `202 { data: DocumentIngestion }`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  DOCUMENT_TYPE_ENUM,
  ERR_RESPONSES,
  ErrorBodySchema,
  MessageSchema,
  PaginationMetaSchema,
  PathPositiveInt,
} from './rest-schemas.js';

const c = initContract();

export const ItemDocumentSchema = z.object({
  id: z.number(),
  itemId: z.string(),
  paperlessDocumentId: z.number(),
  documentType: z.string(),
  title: z.string().nullable(),
  createdAt: z.string(),
});

/**
 * An upload handed to Paperless that has not become a link: `pending` while
 * Paperless consumes it, `failed` (with `reason`) until dismissed.
 */
export const DocumentIngestionSchema = z.object({
  id: z.number(),
  itemId: z.string(),
  taskId: z.string(),
  documentType: z.string(),
  title: z.string().nullable(),
  fileName: z.string(),
  state: z.enum(['pending', 'failed']),
  reason: z.string().nullable(),
  createdAt: z.string(),
});

/** Paperless's own title limit, which a title change is synced to. */
const PAPERLESS_TITLE_MAX = 128;

const DOCUMENTS_FAILURES = {
  412: ErrorBodySchema,
  502: ErrorBodySchema,
  503: ErrorBodySchema,
} as const;

export const inventoryDocumentsContract = c.router({
  link: {
    method: 'POST',
    path: '/items/:itemId/documents',
    pathParams: z.object({ itemId: z.string() }),
    body: z.object({
      paperlessDocumentId: z.number().int().positive('Document ID must be a positive integer'),
      documentType: DOCUMENT_TYPE_ENUM,
      title: z.string().optional(),
    }),
    responses: {
      201: z.object({ data: ItemDocumentSchema, message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary: 'Link a Paperless document to an item',
  },
  unlink: {
    method: 'DELETE',
    path: '/documents/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({}).optional(),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Unlink a document by link id (the Paperless document is kept)',
  },
  update: {
    method: 'PATCH',
    path: '/documents/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z
      .object({
        documentType: DOCUMENT_TYPE_ENUM.optional(),
        title: z.string().trim().min(1).max(PAPERLESS_TITLE_MAX).optional(),
      })
      .strict(),
    responses: {
      200: z.object({ data: ItemDocumentSchema, message: z.string() }),
      ...ERR_RESPONSES,
      ...DOCUMENTS_FAILURES,
    },
    summary:
      'Change the given fields of a link; a title change is also made in Paperless, and nothing changes if that fails',
  },
  dismissIngestion: {
    method: 'DELETE',
    path: '/document-ingestions/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({}).optional(),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Dismiss a pending or failed upload',
  },
  listForItem: {
    method: 'GET',
    path: '/items/:itemId/documents',
    pathParams: z.object({ itemId: z.string() }),
    query: z.object({
      limit: z.coerce.number().positive().max(500).optional(),
      offset: z.coerce.number().nonnegative().optional(),
    }),
    responses: {
      200: z.object({
        data: z.array(ItemDocumentSchema.extend({ missing: z.boolean().nullable() })),
        pending: z.array(DocumentIngestionSchema),
        failed: z.array(DocumentIngestionSchema),
        pagination: PaginationMetaSchema,
      }),
    },
    summary:
      "List an item's linked documents (paginated) and its uploads still pending or failed, after resolving the pending ones",
  },
  listForPaperlessDocument: {
    method: 'GET',
    path: '/documents',
    query: z.object({ paperlessDocumentId: PathPositiveInt }),
    responses: {
      200: z.object({ data: z.array(ItemDocumentSchema) }),
      400: ErrorBodySchema,
    },
    summary: 'List every item link to one Paperless document (empty when none)',
  },
});
