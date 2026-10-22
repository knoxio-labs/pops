/**
 * `GET /api/inventory/documents/:id/file` — the file of a linked Paperless
 * document, by link id, streamed from documents'
 * `GET /paperless/documents/:id/download`. A `Range` header is forwarded and
 * documents' 206/416 passes back with its headers, so web and bfm read
 * Paperless files without ever holding Paperless credentials.
 */
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { DocumentsUnreachableError } from '../documents/uploads-client.js';
import { inventoryError, sendInventoryError } from '../errors.js';
import * as service from '../modules/documents/service.js';
import { documentsUnavailable, relayDocumentsFailure } from './documents-relay.js';

import type { RequestHandler } from 'express';

import type { InventoryDb } from '../../db/index.js';
import type { DocumentUploadsClient } from '../documents/uploads-client.js';

/** The path this route registers. Exported so the service-account gate scopes exactly it. */
export const DOCUMENT_FILE_ROUTE_PATH = '/api/inventory/documents/:id/file';

const PASSED_HEADERS = [
  'content-type',
  'content-length',
  'content-disposition',
  'content-range',
  'accept-ranges',
] as const;

const STREAMED_STATUSES: ReadonlySet<number> = new Set([200, 206, 416]);
const RELAYED_STATUSES: ReadonlySet<number> = new Set([404, 412, 502, 503]);

const LINK_ID_RE = /^[1-9]\d{0,15}$/;

/** Build the download proxy over the inventory database and the documents client. */
export function createDocumentDownloadHandler(
  db: InventoryDb,
  uploads: DocumentUploadsClient
): RequestHandler<{ id: string }> {
  return async (req, res): Promise<void> => {
    const { id } = req.params;
    if (!LINK_ID_RE.test(id)) {
      sendInventoryError(
        req,
        res,
        inventoryError({
          area: 'documents',
          reason: 'invalid_id',
          status: 400,
          message: `Invalid document link id: ${id}`,
        })
      );
      return;
    }
    const link = service.getDocument(db, Number(id));
    let response: Response;
    try {
      response = await uploads.download(link.paperlessDocumentId, req.get('range'));
    } catch (err) {
      if (!(err instanceof DocumentsUnreachableError)) throw err;
      console.warn(`[inventory/documents] ${err.message}`, err.cause);
      sendInventoryError(req, res, documentsUnavailable());
      return;
    }
    if (!STREAMED_STATUSES.has(response.status)) {
      sendInventoryError(req, res, await relayDocumentsFailure(response, RELAYED_STATUSES));
      return;
    }
    res.status(response.status);
    for (const name of PASSED_HEADERS) {
      const value = response.headers.get(name);
      if (value !== null) res.setHeader(name, value);
    }
    res.setHeader('Cache-Control', 'private, no-store');
    if (response.body === null) {
      res.end();
      return;
    }
    await pipeline(Readable.from(response.body), res);
  };
}
