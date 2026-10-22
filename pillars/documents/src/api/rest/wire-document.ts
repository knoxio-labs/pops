import type { PaperlessClient } from '../modules/paperless/client.js';
import type { PaperlessDocument } from '../modules/paperless/types.js';

/** One document as the contract's `PaperlessDocumentSchema` carries it. */
export interface WireDocument {
  id: number;
  title: string;
  created: string;
  originalFileName: string;
  thumbnailUrl: string;
}

/** Project a Paperless document onto the wire shape every document route returns. */
export function toWireDocument(client: PaperlessClient, doc: PaperlessDocument): WireDocument {
  return {
    id: doc.id,
    title: doc.title,
    created: doc.created,
    originalFileName: doc.originalFileName,
    thumbnailUrl: client.getDocumentThumbnailUrl(doc.id),
  };
}
