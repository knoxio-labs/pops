import express, { type RequestHandler, type Router } from 'express';

import { createPillarErrorHandlers, defineErrors } from '@pops/pillar-express';

import { sniffImageType } from './image-format.js';
import { INVENTORY_MEDIA_MAX_BYTES, storeInventoryMedia } from './inventory-media.js';
import { uploadTokens } from './upload-tokens.js';

import type { MediaStoreDeps } from './inventory-media.js';
import type { UploadTokenStore } from './upload-tokens.js';

/** Path of the upload route; the `createUpload` tool builds URLs from it. */
export const UPLOAD_ROUTE_PREFIX = '/uploads';

const uploadErrors = defineErrors('mcp', {
  not_found: {
    area: 'upload',
    status: 404,
    message:
      'This upload URL is unknown, expired or already used. Mint a new one with inventory.photos.createUpload.',
    retryable: false,
  },
  empty_body: {
    area: 'upload',
    status: 400,
    message: 'The upload body is empty. Send the file bytes, e.g. curl -T photo.jpg <url>.',
    retryable: false,
  },
  unsupported_media_type: {
    area: 'upload',
    status: 415,
    message:
      'Only JPEG and HEIC images are accepted. Convert first, e.g. on macOS: sips -s format jpeg in.png --out out.jpg',
    retryable: false,
  },
  rejected: {
    area: 'upload',
    status: 400,
    message: 'Inventory rejected the image.',
    retryable: false,
  },
  upstream_unavailable: {
    area: 'upload',
    status: 502,
    message: 'Inventory could not store the image. Mint a new upload URL and try again.',
    retryable: true,
  },
});

/** Seams for tests; production uses the shared token store and the real media client. */
export interface UploadRouterDeps {
  readonly tokens?: UploadTokenStore;
  readonly media?: MediaStoreDeps;
}

/**
 * `PUT /uploads/:token` receives a file for a URL minted by the
 * `inventory.photos.createUpload` tool, stores it in inventory's media store
 * and answers its SHA-256 for `inventory.items.attachPhoto`. The token is the
 * credential, so the route sits outside the `/mcp` bearer check: a client
 * that can call tools hands the URL to a shell (`curl -T`), which has no
 * bearer token. The token is spent before the body is read, so a failed
 * upload needs a new URL.
 */
export function createUploadRouter(deps: UploadRouterDeps = {}): Router {
  const tokens = deps.tokens ?? uploadTokens;
  const router = express.Router();

  const spendToken: RequestHandler<{ token: string }> = (req, _res, next) => {
    if (!tokens.consume(req.params.token)) return uploadErrors.not_found();
    next();
  };

  const store: RequestHandler<{ token: string }> = async (req, res) => {
    const body: unknown = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) return uploadErrors.empty_body();
    const contentType = sniffImageType(body);
    if (contentType === undefined) return uploadErrors.unsupported_media_type();
    const result = await storeInventoryMedia(body, contentType, deps.media);
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
  };

  router.put(
    '/:token',
    spendToken,
    express.raw({ type: () => true, limit: INVENTORY_MEDIA_MAX_BYTES }),
    store
  );
  // The app's body-parser handler is mounted before this router, so the raw
  // parser's 413 needs its own, or it reaches the final handler as a 500.
  router.use(createPillarErrorHandlers({ pillar: 'mcp' }).bodyParser);
  return router;
}
