/**
 * Raw (non-ts-rest) byte-serving routes for the inventory pillar:
 * - `GET /api/inventory/photos/items/:itemId/:filename` — uploaded item photos
 * - `GET /api/inventory/documents/items/:itemId/:filename` — direct-upload docs
 * - `GET /inventory/documents/:id/thumbnail` — Paperless-ngx thumbnail proxy
 *
 * GET-only and validated by filename pattern, so they need no DB handle. They
 * are deliberately NOT ts-rest contract routes (mirrors media's `/media/images`)
 * so they add no OpenAPI surface.
 *
 * The thumbnail proxy no longer embeds a `PaperlessClient` (ADR-039
 * workstream 13 moved that to the `documents` bridge pillar). It resolves
 * `documents`'s `baseUrl` via the pillar SDK's discovery client and streams
 * the bytes from `documents`'s own `GET /documents/:id/thumbnail` raw route
 * — a double proxy (browser → inventory → documents → paperless-ngx), so
 * inventory's frontend keeps hitting its own backend unchanged.
 */
import { resolve } from 'node:path';

import {
  type Request,
  type Response as ExpressResponse,
  type Router as ExpressRouter,
  Router,
} from 'express';

import { lookupPillar as defaultLookupPillar } from '@pops/pillar-sdk/discovery';

import { inventoryError, sendInventoryError } from '../errors.js';
import { getInventoryDocumentsDir } from '../modules/document-files/paths.js';
import { getInventoryImagesDir } from '../modules/photos/paths.js';
import { tryServeFile } from './serve-file.js';
import { createThumbnailProxyHandler } from './thumbnail-proxy.js';

/** Uploaded item bytes can change on re-upload, so cache privately + short. */
const UPLOAD_CACHE_CONTROL = 'private, max-age=3600';

/** Item IDs are hex blobs in prod; e2e seeds use simple `inv-NNN` ids. */
const ITEM_ID_RE = /^[a-z0-9-]+$/i;
/** Photo filenames: `photo_NNN.jpg` (written by the photos service). */
const PHOTO_FILENAME_RE = /^photo_\d+\.jpg$/;
/** Direct-upload doc filenames: `file_NNN.{ext}` (PDFs, images, text). */
const DOC_FILENAME_RE = /^file_\d+\.[a-z0-9]+$/i;

/** Uploaded item photo bytes. Exported so the service-account gate scopes this exact path. */
export const ITEM_PHOTO_FILE_ROUTE_PATH = '/api/inventory/photos/items/:itemId/:filename';
/** Direct-upload item document bytes. Exported so the service-account gate scopes this exact path. */
export const ITEM_DOCUMENT_FILE_ROUTE_PATH = '/api/inventory/documents/items/:itemId/:filename';
/** The Paperless thumbnail proxy. Exported so the service-account gate scopes this exact path. */
export const DOCUMENT_THUMBNAIL_ROUTE_PATH = '/inventory/documents/:id/thumbnail';

interface ServeSpec {
  /** Resolved at request time so tests can flip the env per case. */
  baseDir: string;
  filenameRe: RegExp;
  notFound: string;
}

async function serveItemFile(req: Request, res: ExpressResponse, spec: ServeSpec): Promise<void> {
  const itemId = String(req.params['itemId'] ?? '');
  const filename = String(req.params['filename'] ?? '');

  if (!itemId || itemId.includes('..') || itemId.includes('/') || !ITEM_ID_RE.test(itemId)) {
    sendInventoryError(
      req,
      res,
      inventoryError({
        area: 'files',
        reason: 'invalid_item_id',
        status: 400,
        message: `Invalid item id: ${itemId}`,
      })
    );
    return;
  }
  if (!spec.filenameRe.test(filename)) {
    sendInventoryError(
      req,
      res,
      inventoryError({
        area: 'files',
        reason: 'invalid_filename',
        status: 400,
        message: `Invalid filename: ${filename}`,
      })
    );
    return;
  }

  const filePath = resolve(spec.baseDir, 'items', itemId, filename);
  // Sandbox: the resolved path must live inside the base dir — defends against
  // any traversal the regexes don't catch.
  if (!filePath.startsWith(spec.baseDir + '/') && filePath !== spec.baseDir) {
    sendInventoryError(
      req,
      res,
      inventoryError({
        area: 'files',
        reason: 'invalid_path',
        status: 400,
        message: 'Invalid path',
      })
    );
    return;
  }

  const served = await tryServeFile(filePath, res, UPLOAD_CACHE_CONTROL);
  if (!served)
    sendInventoryError(
      req,
      res,
      inventoryError({ area: 'files', reason: 'not_found', status: 404, message: spec.notFound })
    );
}

export interface CreateInventoryFilesRouterOptions {
  /**
   * Pillar-discovery lookup used to resolve the `documents` pillar's
   * `baseUrl` for the thumbnail proxy. Production omits this so it
   * defaults to the live `@pops/pillar-sdk/discovery` client; tests inject
   * a stub so the route is exercised without a registry round-trip.
   */
  lookupDocumentsPillar?: typeof defaultLookupPillar;
  /** Fetch implementation for the proxied byte request. Test-only override. */
  fetchImpl?: typeof fetch;
}

/** Build the inventory pillar's raw file-serving router. */
export function createInventoryFilesRouter(
  options: CreateInventoryFilesRouterOptions = {}
): ExpressRouter {
  const lookupDocumentsPillar = options.lookupDocumentsPillar ?? defaultLookupPillar;
  const fetchImpl = options.fetchImpl ?? fetch;
  const router = Router();

  router.get(ITEM_PHOTO_FILE_ROUTE_PATH, async (req, res): Promise<void> => {
    await serveItemFile(req, res, {
      baseDir: getInventoryImagesDir(),
      filenameRe: PHOTO_FILENAME_RE,
      notFound: 'Photo not found',
    });
  });

  router.get(ITEM_DOCUMENT_FILE_ROUTE_PATH, async (req, res): Promise<void> => {
    await serveItemFile(req, res, {
      baseDir: getInventoryDocumentsDir(),
      filenameRe: DOC_FILENAME_RE,
      notFound: 'Document not found',
    });
  });

  router.get(
    DOCUMENT_THUMBNAIL_ROUTE_PATH,
    createThumbnailProxyHandler(lookupDocumentsPillar, fetchImpl)
  );

  return router;
}
