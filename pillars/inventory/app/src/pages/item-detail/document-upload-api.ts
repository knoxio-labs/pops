import { unwrap } from '../../inventory-api-helpers.js';
import { client } from '../../inventory-api/client.gen.js';

import type { DocumentKind } from '../../components/document-kinds';
import type { DocumentsListForItemResponse, ErrorBody } from '../../inventory-api/types.gen.js';

/** A pending upload row, as the upload route answers it. */
export type DocumentIngestion = DocumentsListForItemResponse['pending'][number];

/** What an upload sends: the file itself plus how to file it. */
export interface DocumentUploadInput {
  itemId: string;
  file: File;
  documentType: DocumentKind;
  /** Omitted when blank; Paperless then titles the document from the file. */
  title?: string;
}

/**
 * Sends a file to `POST /items/:itemId/documents/upload` as the raw request
 * body, with its MIME type as `Content-Type`. The route is a raw-body route,
 * so it has no generated SDK function; the generated client still carries
 * the base URL, interceptors and error envelope. Resolves to the pending
 * ingestion; Paperless finishes it later.
 */
export async function uploadItemDocument(input: DocumentUploadInput): Promise<DocumentIngestion> {
  const title = input.title?.trim();
  const result = await client.post<
    { 202: { data: DocumentIngestion } },
    { 400: ErrorBody; 404: ErrorBody; 413: ErrorBody; 415: ErrorBody; 503: ErrorBody }
  >({
    url: '/items/{itemId}/documents/upload',
    path: { itemId: input.itemId },
    query: {
      documentType: input.documentType,
      fileName: input.file.name,
      ...(title !== undefined && title.length > 0 ? { title } : {}),
    },
    body: input.file,
    bodySerializer: null,
    headers: {
      'Content-Type': input.file.type.length > 0 ? input.file.type : 'application/octet-stream',
    },
  });
  return unwrap(result).data;
}
