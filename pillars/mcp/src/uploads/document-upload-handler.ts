import { PopsError } from '@pops/pillar-express';

import { uploadInventoryDocument } from './inventory-documents.js';
import { uploadErrors } from './upload-errors.js';

import type { Request, Response } from 'express';

import type { DocumentUploadDeps } from './inventory-documents.js';
import type { DocumentUploadTarget } from './upload-tokens.js';

/** Whether `mime` matches one of documents' allow-list entries (`image/*` style wildcards included). */
export function mimeAllowed(mime: string, allowed: readonly string[]): boolean {
  return allowed.some((entry) => {
    const pattern = entry.toLowerCase();
    if (pattern.endsWith('/*')) return mime.startsWith(pattern.slice(0, -1));
    return mime === pattern;
  });
}

function declaredLength(req: Request): number | undefined {
  const header = req.get('content-length');
  if (header === undefined || !/^\d+$/u.test(header)) return undefined;
  return Number(header);
}

/** Checks that need no body bytes, so a refused upload is never streamed anywhere. */
function precheck(req: Request, target: DocumentUploadTarget): string {
  const header = req.get('content-type');
  if (header === undefined || header.trim() === '') {
    return uploadErrors.missing_content_type({ allowedMimeTypes: target.allowedMimeTypes });
  }
  const mime = (header.split(';')[0] ?? '').trim().toLowerCase();
  if (!mimeAllowed(mime, target.allowedMimeTypes)) {
    return uploadErrors.unsupported_document_type({
      contentType: mime,
      allowedMimeTypes: target.allowedMimeTypes,
    });
  }
  const length = declaredLength(req);
  if (length === 0) return uploadErrors.empty_body();
  if (length !== undefined && length > target.maxBytes) {
    return uploadErrors.too_large({ maxUploadBytes: target.maxBytes });
  }
  return header;
}

/**
 * Stream one document upload to inventory and answer `202` with the pending
 * ingestion. Refusals that need no bytes (no or disallowed `Content-Type`, a
 * declared length over documents' cap) are answered before anything is
 * forwarded, and close the connection so the client stops sending.
 */
export async function storeDocumentUpload(
  req: Request,
  res: Response,
  target: DocumentUploadTarget,
  deps?: DocumentUploadDeps
): Promise<void> {
  res.setHeader('Connection', 'close');
  const contentType = precheck(req, target);
  const contentLength = req.get('content-length');
  const result = await uploadInventoryDocument(
    { body: req, contentType, ...(contentLength === undefined ? {} : { contentLength }) },
    target,
    deps
  );
  if (result.kind === 'too-large')
    return uploadErrors.too_large({ maxUploadBytes: target.maxBytes });
  if (result.kind === 'unavailable') {
    return uploadErrors.upstream_unavailable({ reason: result.message });
  }
  if (result.kind === 'refused') {
    throw new PopsError({
      code: result.code,
      status: result.status,
      message: result.message,
      retryable: result.retryable,
      details: result.details,
    });
  }
  res.removeHeader('Connection');
  res.status(202).json({
    ingestion: result.ingestion,
    next: `Paperless is consuming the file. Call inventory.documents.list with itemId '${target.itemId}' to see it pending, linked or failed.`,
  });
}
