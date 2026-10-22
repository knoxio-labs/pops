/**
 * Raw byte routes for item documents held in Paperless: the upload that
 * starts an ingestion and the file download proxy. Raw because their bodies
 * are bytes, so like the rest of `api/files/` they add no OpenAPI surface;
 * unlike the static file routes in `router.ts` they need the database.
 */
import { Router, type Router as ExpressRouter } from 'express';

import {
  createDocumentDownloadHandler,
  DOCUMENT_FILE_ROUTE_PATH,
} from './document-download-route.js';
import {
  createDocumentUploadHandler,
  ITEM_DOCUMENT_UPLOAD_ROUTE_PATH,
} from './document-upload-route.js';

import type { InventoryDb } from '../../db/index.js';
import type { DocumentUploadsClient } from '../documents/uploads-client.js';

/** Build the Paperless item-document byte router. */
export function createItemDocumentsBytesRouter(deps: {
  db: InventoryDb;
  uploads: DocumentUploadsClient;
}): ExpressRouter {
  const router = Router();
  router.post(ITEM_DOCUMENT_UPLOAD_ROUTE_PATH, createDocumentUploadHandler(deps.db, deps.uploads));
  router.get(DOCUMENT_FILE_ROUTE_PATH, createDocumentDownloadHandler(deps.db, deps.uploads));
  return router;
}
