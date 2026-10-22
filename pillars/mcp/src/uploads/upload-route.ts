import express, { type Request, type RequestHandler, type Response, type Router } from 'express';

import { createPillarErrorHandlers } from '@pops/pillar-express';

import { storeDocumentUpload } from './document-upload-handler.js';
import { sniffImageType } from './image-format.js';
import { INVENTORY_MEDIA_MAX_BYTES, storeInventoryMedia } from './inventory-media.js';
import { uploadErrors } from './upload-errors.js';
import { uploadTokens } from './upload-tokens.js';

import type { DocumentUploadDeps } from './inventory-documents.js';
import type { MediaStoreDeps } from './inventory-media.js';
import type { UploadTokenStore } from './upload-tokens.js';

/** Path of the upload route; the `createUpload` tools build URLs from it. */
export const UPLOAD_ROUTE_PREFIX = '/uploads';

/** Seams for tests; production uses the shared token store and the real inventory clients. */
export interface UploadRouterDeps {
  readonly tokens?: UploadTokenStore;
  readonly media?: MediaStoreDeps;
  readonly documents?: DocumentUploadDeps;
}

const photoBodyParser = express.raw({ type: () => true, limit: INVENTORY_MEDIA_MAX_BYTES });

function readPhotoBody(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    photoBodyParser(req, res, (err?: unknown) => {
      if (err === undefined) resolve();
      else reject(err);
    });
  });
}

async function storePhoto(req: Request, res: Response, media?: MediaStoreDeps): Promise<void> {
  await readPhotoBody(req, res);
  const body: unknown = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) return uploadErrors.empty_body();
  const contentType = sniffImageType(body);
  if (contentType === undefined) return uploadErrors.unsupported_media_type();
  const result = await storeInventoryMedia(body, contentType, media);
  if (result.kind === 'rejected') {
    return uploadErrors.rejected({ status: result.status, reason: result.message });
  }
  if (result.kind === 'unavailable') {
    return uploadErrors.upstream_unavailable({ reason: result.message });
  }
  res.status(201).json({
    sha256: result.sha256,
    alreadyStored: result.alreadyStored,
    byteSize: body.length,
    contentType,
    next: 'Call inventory.items.attachPhoto with this sha256 to add the photo to an item.',
  });
}

/**
 * `PUT /uploads/:token` receives a file for a URL minted by a `createUpload`
 * tool and routes it by the kind the token was minted for. A photo
 * (`inventory.photos.createUpload`) is buffered up to 8 MB, stored in
 * inventory's media store, and answered with its SHA-256 for
 * `inventory.items.attachPhoto`. A document
 * (`inventory.documents.createUpload`) is streamed to inventory's item
 * document upload under documents' size cap and answered with the pending
 * ingestion. The token is the credential, so the route sits outside the
 * `/mcp` bearer check: a client that can call tools hands the URL to a shell
 * (`curl -T`), which has no bearer token. The token is spent before the body
 * is read, so a failed upload needs a new URL.
 */
export function createUploadRouter(deps: UploadRouterDeps = {}): Router {
  const tokens = deps.tokens ?? uploadTokens;
  const router = express.Router();

  const receive: RequestHandler<{ token: string }> = async (req, res) => {
    const target = tokens.consume(req.params.token);
    if (target === undefined) {
      res.setHeader('Connection', 'close');
      return uploadErrors.not_found();
    }
    if (target.kind === 'photo') return storePhoto(req, res, deps.media);
    return storeDocumentUpload(req, res, target, deps.documents);
  };

  router.put('/:token', receive);
  // The app's body-parser handler is mounted before this router, so the raw
  // parser's 413 needs its own, or it reaches the final handler as a 500.
  router.use(createPillarErrorHandlers({ pillar: 'mcp' }).bodyParser);
  return router;
}
