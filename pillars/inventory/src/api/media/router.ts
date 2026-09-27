/**
 * Raw (non-ts-rest) byte routes for content-addressed media (Inventory
 * ADR-002 D9): `PUT /media/:sha256` accepts the bytes, `GET /media/:sha256`
 * serves a variant back. Mirrors `api/files/router.ts` — bytes in and out
 * don't fit the JSON contract, so like the rest of this pillar's byte
 * serving, these routes are deliberately NOT ts-rest, and add no OpenAPI
 * surface.
 *
 * bfm's mobile-facing `PUT/GET /mobile/inventory/media/:sha256` (A13)
 * proxies straight through to these routes; the outcome vocabulary
 * (`alreadyStored`, `hash_mismatch`, `413`, `415`) is this module's, not
 * reinterpreted at the proxy.
 */
import { existsSync, readFileSync } from 'node:fs';

import { Router, type Request, type Response } from 'express';

import { inventoryError, sendInventoryError } from '../errors.js';
import { PayloadTooLargeError, readRawBody } from './read-raw-body.js';
import {
  MediaHashMismatchError,
  UnsupportedMediaTypeError,
  getMedia,
  isValidSha256,
  storeMedia,
} from './store.js';
import { isMediaVariant, mediaVariantETag, mediaVariantPath } from './variants.js';

import type { InventoryDb } from '../../db/index.js';

/**
 * The one path both media routes serve. Exported so the service-account gate
 * scopes exactly the path this router registers (`inventory.media`).
 */
export const MEDIA_ROUTE_PATH = '/media/:sha256';

/** Matches D9's mobile media cap so a route can't accept locally what bfm's proxy would reject upstream. */
export const MEDIA_UPLOAD_LIMIT_BYTES = 8 * 1024 * 1024;

const ALLOWED_UPLOAD_CONTENT_TYPES = ['image/jpeg', 'image/heic'];

/** `public, immutable`: a content-addressed blob's bytes never change once stored. */
const MEDIA_CACHE_CONTROL = 'public, max-age=604800, immutable';

export interface CreateInventoryMediaRouterDeps {
  db: InventoryDb;
  /** Absolute path of the images volume. Production resolves it from `INVENTORY_IMAGES_DIR`. */
  imagesDir: () => string;
}

function sha256Param(req: Request): string | null {
  const value = req.params['sha256'];
  return typeof value === 'string' && isValidSha256(value) ? value : null;
}

interface MediaErrorSpec {
  reason: string;
  status: number;
  message: string;
}

function sendMediaError(req: Request, res: Response, spec: MediaErrorSpec): void {
  sendInventoryError(req, res, inventoryError({ area: 'media', ...spec }));
}

async function readUpload(req: Request, res: Response): Promise<Buffer | null> {
  try {
    return await readRawBody(req, MEDIA_UPLOAD_LIMIT_BYTES);
  } catch (err) {
    if (!(err instanceof PayloadTooLargeError)) throw err;
    res.once('finish', () => req.socket.destroy());
    sendMediaError(req, res, {
      reason: 'payload_too_large',
      status: 413,
      message: 'The media payload is too large.',
    });
    return null;
  }
}

async function storeUpload(
  req: Request,
  res: Response,
  upload: { deps: CreateInventoryMediaRouterDeps; sha256: string; bytes: Buffer }
): Promise<void> {
  try {
    const result = await storeMedia(
      upload.deps.db,
      upload.deps.imagesDir(),
      upload.sha256,
      upload.bytes
    );
    res.status(result.alreadyStored ? 200 : 201).json(result);
  } catch (err) {
    if (err instanceof MediaHashMismatchError) {
      sendMediaError(req, res, {
        reason: 'hash_mismatch',
        status: 400,
        message: 'The media hash does not match the payload.',
      });
      return;
    }
    if (err instanceof UnsupportedMediaTypeError) {
      sendMediaError(req, res, {
        reason: 'unsupported_media_type',
        status: 415,
        message: 'The media type is not supported.',
      });
      return;
    }
    throw err;
  }
}

async function handlePut(
  deps: CreateInventoryMediaRouterDeps,
  req: Request,
  res: Response
): Promise<void> {
  const sha256 = sha256Param(req);
  if (sha256 === null) {
    sendMediaError(req, res, {
      reason: 'invalid_sha256',
      status: 400,
      message: 'The media hash is invalid.',
    });
    return;
  }

  if (!req.is(ALLOWED_UPLOAD_CONTENT_TYPES)) {
    sendMediaError(req, res, {
      reason: 'unsupported_media_type',
      status: 415,
      message: 'The media type is not supported.',
    });
    return;
  }

  const bytes = await readUpload(req, res);
  if (bytes === null) return;

  if (bytes.length === 0) {
    sendMediaError(req, res, {
      reason: 'empty_body',
      status: 400,
      message: 'The media payload is empty.',
    });
    return;
  }

  await storeUpload(req, res, { deps, sha256, bytes });
}

function handleGet(deps: CreateInventoryMediaRouterDeps, req: Request, res: Response): void {
  const sha256 = sha256Param(req);
  if (sha256 === null) {
    sendMediaError(req, res, {
      reason: 'invalid_sha256',
      status: 400,
      message: 'The media hash is invalid.',
    });
    return;
  }

  const variantParam = req.query['variant'] ?? 'full';
  if (!isMediaVariant(variantParam)) {
    sendMediaError(req, res, {
      reason: 'invalid_variant',
      status: 400,
      message: 'The media variant is invalid.',
    });
    return;
  }

  const record = getMedia(deps.db, sha256);
  if (record === null) {
    sendMediaError(req, res, {
      reason: 'not_found',
      status: 404,
      message: 'The media was not found.',
    });
    return;
  }

  const imagesDir = deps.imagesDir();
  const filePath = mediaVariantPath(imagesDir, sha256, variantParam);
  if (!existsSync(filePath)) {
    sendMediaError(req, res, {
      reason: 'not_found',
      status: 404,
      message: 'The media was not found.',
    });
    return;
  }

  const etag = mediaVariantETag(sha256, variantParam);
  res.set({
    'Content-Type': variantParam === 'full' ? record.mime : 'image/jpeg',
    'Cache-Control': MEDIA_CACHE_CONTROL,
    ETag: etag,
  });

  if (req.get('If-None-Match') === etag) {
    res.status(304).end();
    return;
  }

  res.send(readFileSync(filePath));
}

/** Build the inventory pillar's content-addressed media router. */
export function createInventoryMediaRouter(deps: CreateInventoryMediaRouterDeps): Router {
  const router = Router();

  router.put(MEDIA_ROUTE_PATH, (req, res, next) => {
    handlePut(deps, req, res).catch(next);
  });

  router.get(MEDIA_ROUTE_PATH, (req, res) => {
    handleGet(deps, req, res);
  });

  return router;
}
