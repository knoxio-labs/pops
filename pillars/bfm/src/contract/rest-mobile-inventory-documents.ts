import { z } from 'zod';

import { requires } from './capabilities.js';
import {
  MobileDocumentIdSchema,
  MobileItemDocumentSchema,
  MobileItemDocumentsSchema,
  MobileUpdateItemDocumentBodySchema,
} from './mobile-inventory-document-schemas.js';
import {
  MOBILE_PERIMETER_RESPONSES,
  MOBILE_REQUEST_RESPONSES,
  MOBILE_UPSTREAM_RESPONSES,
} from './rest-mobile-responses.js';
import { MobileUpstreamErrorSchema } from './rest-schemas.js';

const DocumentParams = z.object({ id: MobileDocumentIdSchema });

/** What unlinking a document or dismissing an upload answers: the id it removed. */
const MobileRemovedSchema = z.object({ id: z.int().positive() });

/**
 * `412` is Paperless not being connected: documents answers it and inventory
 * relays it with documents' own code (`documents.paperless.not_configured`).
 */
const PAPERLESS_RESPONSES = {
  404: MobileUpstreamErrorSchema,
  412: MobileUpstreamErrorSchema,
} as const;

const DOCUMENT_RESPONSES = {
  ...MOBILE_REQUEST_RESPONSES,
  ...MOBILE_PERIMETER_RESPONSES,
  ...MOBILE_UPSTREAM_RESPONSES,
} as const;

/**
 * An item's Paperless documents (POPS-6016), relayed from inventory's
 * `documents.*` contract. The upload and the file download carry raw bytes
 * and sit outside this contract; see `api/rest/mobile-inventory-document-bytes.ts`.
 */
export const mobileInventoryDocumentRoutes = {
  listItemDocuments: {
    method: 'GET',
    path: '/mobile/inventory/items/:id/documents',
    pathParams: z.object({ id: z.string().min(1) }),
    responses: { 200: MobileItemDocumentsSchema, ...DOCUMENT_RESPONSES },
    summary: "An item's linked documents, and its uploads still pending or failed",
    metadata: requires('inventory.read'),
  },
  updateItemDocument: {
    method: 'PATCH',
    path: '/mobile/inventory/documents/:id',
    pathParams: DocumentParams,
    body: MobileUpdateItemDocumentBodySchema,
    responses: { 200: MobileItemDocumentSchema, ...PAPERLESS_RESPONSES, ...DOCUMENT_RESPONSES },
    summary: "Change a linked document's kind or title; a title change is made in Paperless first",
    metadata: requires('inventory.write'),
  },
  unlinkItemDocument: {
    method: 'DELETE',
    path: '/mobile/inventory/documents/:id',
    pathParams: DocumentParams,
    responses: { 200: MobileRemovedSchema, 404: MobileUpstreamErrorSchema, ...DOCUMENT_RESPONSES },
    summary: 'Unlink a document from its item; the Paperless document is kept',
    metadata: requires('inventory.write'),
  },
  dismissDocumentIngestion: {
    method: 'DELETE',
    path: '/mobile/inventory/document-ingestions/:id',
    pathParams: DocumentParams,
    responses: { 200: MobileRemovedSchema, 404: MobileUpstreamErrorSchema, ...DOCUMENT_RESPONSES },
    summary: 'Dismiss an upload that is pending or failed',
    metadata: requires('inventory.write'),
  },
} as const;
