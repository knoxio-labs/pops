import { getPillar } from '../pillar-client.js';
import { DOCUMENT_TYPES } from '../uploads/upload-tokens.js';

import type { PillarHandle } from '@pops/pillar-sdk/client';

import type { DocumentType } from '../uploads/upload-tokens.js';

type IdInput = { id: number };

/** The slice of inventory's contract the document tools call (`documents.*`, `paperless.*`). */
export type InventoryDocumentsShape = {
  documents: {
    listForItem: (input: { itemId: string; limit?: number; offset?: number }) => unknown;
    link: (input: {
      itemId: string;
      paperlessDocumentId: number;
      documentType: DocumentType;
      title?: string;
    }) => unknown;
    update: (input: IdInput & { documentType?: DocumentType; title?: string }) => unknown;
    unlink: (input: IdInput) => unknown;
    dismissIngestion: (input: IdInput) => unknown;
  };
  paperless: {
    search: (input: { query: string }) => unknown;
  };
};

/** The upload limits documents states on `GET /paperless/status`. */
export type DocumentsStatus = {
  data: { maxUploadBytes: number; allowedMimeTypes: string[] };
};

/** The slice of documents' contract the gateway calls directly: its limits and Paperless deletion. */
export type DocumentsShape = {
  paperless: { status: () => DocumentsStatus };
  write: { delete: (input: IdInput) => unknown };
};

/** Inventory's handle, typed to the document routes. */
export function inventoryDocuments(): PillarHandle<InventoryDocumentsShape> {
  return getPillar<InventoryDocumentsShape>('inventory');
}

/** The documents pillar's handle, for its limits and Paperless deletion. */
export function documentsPillar(): PillarHandle<DocumentsShape> {
  return getPillar<DocumentsShape>('documents');
}

function isDocumentType(value: unknown): value is DocumentType {
  return DOCUMENT_TYPES.some((type) => type === value);
}

/** Coerce to a known kind: anything unrecognised is `other`, per the tools README. */
export function coerceDocumentType(value: unknown): DocumentType {
  return isDocumentType(value) ? value : 'other';
}

/** A positive integer id argument, or `null` when missing or malformed. */
export function reqPositiveInt(args: Record<string, unknown>, key: string): number | null {
  const value = args[key];
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

/** JSON schema of a `documentType` argument. */
export const documentTypeProperty = {
  type: 'string',
  enum: [...DOCUMENT_TYPES],
  description: 'What the document is; an unrecognised value is stored as "other"',
} as const;

/** JSON schema of a document `title` argument. */
export const titleProperty = {
  type: 'string',
  minLength: 1,
  maxLength: 128,
  description: "Document title, also set in Paperless (Paperless's own 128-character limit)",
} as const;
