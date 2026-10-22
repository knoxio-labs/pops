/**
 * `POST /items/:itemId/documents/upload` — upload a file to Paperless for an
 * item. The body is the file and `Content-Type` its MIME type; the query
 * names it (`fileName`), classifies it (`documentType`) and optionally
 * titles it (`title`). The body streams straight through to documents'
 * `POST /paperless/documents`; nothing is buffered here.
 *
 * Answers `202 { data: DocumentIngestion }` with the pending row recorded
 * once documents accepted the file. Documents' refusals (400, 412, 413,
 * 415, 422, 502, 503) pass through as documents worded them, and nothing is
 * written. The limits are documents'; inventory keeps no copy of them.
 */
import { z } from 'zod';

import { PopsError } from '@pops/pillar-express';

import { DOCUMENT_TYPES } from '../../db/index.js';
import { DocumentsUnreachableError } from '../documents/uploads-client.js';
import { inventoryError, sendInventoryError } from '../errors.js';
import * as service from '../modules/documents/service.js';
import { toDocumentIngestion } from '../modules/documents/types.js';
import { documentsUnavailable, relayDocumentsFailure } from './documents-relay.js';

import type { Request, RequestHandler, Response } from 'express';

import type { InventoryDb } from '../../db/index.js';
import type { DocumentUploadsClient } from '../documents/uploads-client.js';

/** The path this route registers. Exported so the service-account gate scopes exactly it. */
export const ITEM_DOCUMENT_UPLOAD_ROUTE_PATH = '/items/:itemId/documents/upload';

const RELAYED_STATUSES: ReadonlySet<number> = new Set([400, 412, 413, 415, 422, 502, 503]);

const AcceptedSchema = z.object({ data: z.object({ taskId: z.string().min(1) }) });

const UploadQuerySchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  fileName: z.string().min(1),
  title: z.string().optional(),
});

/** Passes the request body through while counting it, for the chunked over-cap case below. */
function countedBody(req: Request): { body: ReadableStream<Uint8Array>; forwarded: () => number } {
  let forwarded = 0;
  async function* chunks(): AsyncGenerator<Uint8Array> {
    for await (const chunk of req) {
      if (!(chunk instanceof Uint8Array)) throw new TypeError('Request body chunk is not bytes');
      forwarded += chunk.length;
      yield chunk;
    }
  }
  const iterator = chunks();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done === true) controller.close();
      else controller.enqueue(next.value);
    },
    async cancel() {
      await iterator.return(undefined);
    },
  });
  return { body, forwarded: () => forwarded };
}

/**
 * Documents cuts the connection the moment a chunked body passes its cap, so
 * no 413 arrives; the bytes forwarded against the cap documents states is
 * the only way to tell that apart from an outage.
 */
async function unreachableError(
  uploads: DocumentUploadsClient,
  forwardedBytes: number
): Promise<PopsError> {
  const maxUploadBytes = await uploads.maxUploadBytes();
  if (maxUploadBytes === null || forwardedBytes <= maxUploadBytes) return documentsUnavailable();
  return inventoryError({
    area: 'documents',
    reason: 'too_large',
    status: 413,
    message: 'The file is larger than the upload limit.',
    details: { maxUploadBytes },
  });
}

function refuse(req: Request, res: Response, error: PopsError): void {
  // An unread body is never consumed; closing stops the client streaming it
  // at a socket nobody reads.
  if (!req.complete) res.setHeader('Connection', 'close');
  sendInventoryError(req, res, error);
}

function parseQuery(req: Request): z.infer<typeof UploadQuerySchema> | PopsError {
  const query = UploadQuerySchema.safeParse(req.query);
  if (query.success) return query.data;
  return inventoryError({
    area: 'documents',
    reason: 'invalid_upload',
    status: 400,
    message: `The upload request is invalid: ${query.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    details: { issues: query.error.issues },
  });
}

async function forward(
  req: Request,
  uploads: DocumentUploadsClient,
  query: z.infer<typeof UploadQuerySchema>
): Promise<{ taskId: string } | PopsError> {
  const { body, forwarded } = countedBody(req);
  let response: globalThis.Response;
  try {
    response = await uploads.upload({
      body,
      contentType: req.get('content-type') ?? 'application/octet-stream',
      contentLength: req.get('content-length'),
      fileName: query.fileName,
      title: query.title,
    });
  } catch (err) {
    if (!(err instanceof DocumentsUnreachableError)) throw err;
    console.warn(`[inventory/documents] ${err.message}`, err.cause);
    return unreachableError(uploads, forwarded());
  }
  if (response.status !== 202) return relayDocumentsFailure(response, RELAYED_STATUSES);
  const accepted = AcceptedSchema.safeParse(await response.json().catch(() => null));
  if (!accepted.success) return relayDocumentsFailure(response, new Set());
  return accepted.data.data;
}

/** Build the upload handler over the inventory database and the documents client. */
export function createDocumentUploadHandler(
  db: InventoryDb,
  uploads: DocumentUploadsClient
): RequestHandler<{ itemId: string }> {
  return async (req, res): Promise<void> => {
    const query = parseQuery(req);
    if (query instanceof PopsError) return refuse(req, res, query);
    const { itemId } = req.params;
    if (!service.itemExists(db, itemId)) {
      return refuse(
        req,
        res,
        inventoryError({
          area: 'documents',
          reason: 'item_not_found',
          status: 404,
          message: `Inventory item '${itemId}' not found`,
        })
      );
    }
    const accepted = await forward(req, uploads, query);
    if (accepted instanceof PopsError) return refuse(req, res, accepted);
    const row = service.createIngestion(db, {
      itemId,
      taskId: accepted.taskId,
      documentType: query.documentType,
      title: query.title ?? null,
      fileName: query.fileName,
    });
    res.status(202).json({ data: toDocumentIngestion(row) });
  };
}
