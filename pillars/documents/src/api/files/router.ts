/**
 * Raw (non-ts-rest) byte routes for the documents pillar:
 * - `GET /documents/:id/thumbnail` — Paperless-ngx thumbnail proxy
 * - `GET /paperless/documents/:id/download` — document file, Range-aware
 * - `POST /paperless/documents` — streamed upload to `post_document`
 *
 * Deliberately NOT ts-rest contract routes (mirrors media's `/media/images`):
 * their bodies are bytes, so they add no OpenAPI surface. The scope gate
 * declares each one in `middleware/service-account-scope.ts`.
 *
 * Moved from `pillars/inventory/src/api/files/router.ts` (workstream 13,
 * ADR-039). Inventory's own byte-serving route now proxies HERE over a raw
 * fetch resolved via pillar discovery — see
 * `pillars/inventory/src/api/files/router.ts`.
 */
import { type Router as ExpressRouter, Router } from 'express';

import { defineErrors, PopsError } from '@pops/pillar-express';

import { getPaperlessClient } from '../modules/paperless/index.js';
import { PaperlessApiError } from '../modules/paperless/types.js';
import { DOWNLOAD_ROUTE_PATH, handleDownload } from './download-route.js';
import { handleUpload, UPLOAD_ROUTE_PATH } from './upload-route.js';

const THUMBNAIL_CACHE_CONTROL = 'public, max-age=3600';

const thumbnailErrors = defineErrors('documents', {
  invalid_id: {
    area: 'thumbnail',
    status: 400,
    message: 'The document id is invalid.',
    retryable: false,
  },
  not_configured: {
    area: 'paperless',
    status: 503,
    message: 'Paperless-ngx is not configured.',
    retryable: false,
  },
  not_found: {
    area: 'thumbnail',
    status: 404,
    message: 'The document thumbnail was not found.',
    retryable: false,
  },
  upstream_failure: {
    area: 'thumbnail',
    status: 502,
    message: 'The document thumbnail could not be fetched.',
    retryable: true,
  },
});

/** Build the documents pillar's raw file-serving router. */
export function createDocumentsFilesRouter(): ExpressRouter {
  const router = Router();

  router.get('/documents/:id/thumbnail', async (req, res): Promise<void> => {
    const { id } = req.params;
    if (!/^\d+$/.test(id)) {
      return thumbnailErrors.invalid_id({ id });
    }

    const client = getPaperlessClient();
    if (!client) {
      return thumbnailErrors.not_configured();
    }

    try {
      const response = await client.fetchThumbnail(Number(id));
      if (!response.ok) {
        if (response.status === 404) {
          return thumbnailErrors.not_found({ id });
        }
        return thumbnailErrors.upstream_failure({ upstreamStatus: response.status });
      }

      const contentType = response.headers.get('content-type') ?? 'image/png';
      res.set({ 'Content-Type': contentType, 'Cache-Control': THUMBNAIL_CACHE_CONTROL });
      res.send(Buffer.from(await response.arrayBuffer()));
    } catch (err) {
      if (err instanceof PopsError) throw err;
      if (err instanceof PaperlessApiError) {
        return thumbnailErrors.upstream_failure({ upstreamStatus: err.status });
      }
      console.error('[documents] Thumbnail proxy error:', err);
      return thumbnailErrors.upstream_failure();
    }
  });

  router.get(DOWNLOAD_ROUTE_PATH, handleDownload);
  router.post(UPLOAD_ROUTE_PATH, handleUpload);

  return router;
}
