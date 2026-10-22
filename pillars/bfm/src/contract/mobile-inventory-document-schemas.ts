/**
 * Wire shapes for an item's Paperless documents on the phone: the linked
 * documents, the uploads Paperless is still consuming or has refused, and the
 * edit, unlink and dismiss requests.
 *
 * The upload and the file download carry raw bytes, which the ts-rest
 * contract cannot describe, so they are Express routes beside it
 * (`api/rest/mobile-inventory-document-bytes.ts`). Their JSON halves — the
 * ingestion an upload answers, the query it takes — are declared here so both
 * kinds of route read from one place.
 *
 * Mirrors inventory's `rest-documents.ts` rather than importing it: bfm has
 * no build-time dependency on the inventory pillar. Outbound `documentType`
 * stays an open string so a kind inventory adds still decodes on an installed
 * app; inbound it is the closed set inventory accepts.
 */
import { z } from 'zod';

/** Inventory's `DOCUMENT_TYPES`, the kinds a phone may file a document under. */
export const MOBILE_DOCUMENT_TYPES = ['receipt', 'warranty', 'manual', 'invoice', 'other'] as const;

export const MobileDocumentTypeSchema = z.enum(MOBILE_DOCUMENT_TYPES);

/** Paperless's own title limit, which a title change is synced to. */
const PAPERLESS_TITLE_MAX = 128;

/** A document linked to an item, as an edit answers it. */
export const MobileItemDocumentSchema = z.object({
  id: z.int().positive(),
  paperlessDocumentId: z.int().positive(),
  documentType: z.string(),
  title: z.string().nullable(),
  createdAt: z.string(),
});

export type MobileItemDocument = z.infer<typeof MobileItemDocumentSchema>;

/**
 * A linked document in the list. `missing` is `true` when Paperless no longer
 * has it, and `null` when Paperless could not be asked.
 */
export const MobileLinkedItemDocumentSchema = MobileItemDocumentSchema.extend({
  missing: z.boolean().nullable(),
});

/** An upload that has not become a link: `pending` while consumed, `failed` until dismissed. */
export const MobileDocumentIngestionSchema = z.object({
  id: z.int().positive(),
  documentType: z.string(),
  title: z.string().nullable(),
  fileName: z.string(),
  state: z.enum(['pending', 'failed']),
  reason: z.string().nullable(),
  createdAt: z.string(),
});

export type MobileDocumentIngestion = z.infer<typeof MobileDocumentIngestionSchema>;

/** `GET /mobile/inventory/items/:id/documents`: every link, and every unfinished upload. */
export const MobileItemDocumentsSchema = z.object({
  linked: z.array(MobileLinkedItemDocumentSchema),
  pending: z.array(MobileDocumentIngestionSchema),
  failed: z.array(MobileDocumentIngestionSchema),
});

export type MobileItemDocuments = z.infer<typeof MobileItemDocumentsSchema>;

/** `PATCH /mobile/inventory/documents/:id`: the fields to change. */
export const MobileUpdateItemDocumentBodySchema = z
  .object({
    documentType: MobileDocumentTypeSchema.optional(),
    title: z.string().trim().min(1).max(PAPERLESS_TITLE_MAX).optional(),
  })
  .strict();

export type MobileUpdateItemDocumentBody = z.infer<typeof MobileUpdateItemDocumentBodySchema>;

/** The query of the raw upload: what the file is called and what kind of document it is. */
export const MobileDocumentUploadQuerySchema = z.object({
  documentType: MobileDocumentTypeSchema,
  fileName: z.string().min(1),
  title: z.string().min(1).optional(),
});

export type MobileDocumentUploadQuery = z.infer<typeof MobileDocumentUploadQuerySchema>;

/** A link or ingestion id: inventory's positive integer row id. */
export const MobileDocumentIdSchema = z.coerce.number().int().positive();
