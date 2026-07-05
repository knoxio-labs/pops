/**
 * Raw (non-ts-rest) byte-serving route for the documents pillar:
 * - `GET /documents/:id/thumbnail` — Paperless-ngx thumbnail proxy
 *
 * GET-only and validated by numeric id, so it needs no DB handle. Deliberately
 * NOT a ts-rest contract route (mirrors media's `/media/images`) so it adds
 * no OpenAPI surface.
 *
 * Moved from `pillars/inventory/src/api/files/router.ts` (workstream 13,
 * ADR-039). Inventory's own byte-serving route now proxies HERE over a raw
 * fetch resolved via pillar discovery — see
 * `pillars/inventory/src/api/files/router.ts`.
 */
import { type Router as ExpressRouter, Router } from 'express';

import { getPaperlessClient } from '../modules/paperless/index.js';
import { PaperlessApiError } from '../modules/paperless/types.js';

const THUMBNAIL_CACHE_CONTROL = 'public, max-age=3600';

/** Build the documents pillar's raw file-serving router. */
export function createDocumentsFilesRouter(): ExpressRouter {
  const router = Router();

  router.get('/documents/:id/thumbnail', async (req, res): Promise<void> => {
    const { id } = req.params;
    if (!/^\d+$/.test(id)) {
      res.status(400).json({ error: `Invalid document id: ${id}` });
      return;
    }

    const client = getPaperlessClient();
    if (!client) {
      res.status(503).json({ error: 'Paperless-ngx is not configured' });
      return;
    }

    try {
      const response = await client.fetchThumbnail(Number(id));
      if (!response.ok) {
        if (response.status === 404) {
          res.status(404).json({ error: 'Document not found' });
          return;
        }
        res.status(502).json({ error: 'Failed to fetch thumbnail from Paperless' });
        return;
      }

      const contentType = response.headers.get('content-type') ?? 'image/png';
      res.set({ 'Content-Type': contentType, 'Cache-Control': THUMBNAIL_CACHE_CONTROL });
      res.send(Buffer.from(await response.arrayBuffer()));
    } catch (err) {
      if (err instanceof PaperlessApiError) {
        res.status(502).json({ error: `Paperless error: ${err.message}` });
        return;
      }
      console.error('[documents] Thumbnail proxy error:', err);
      res.status(502).json({ error: 'Failed to fetch thumbnail' });
    }
  });

  return router;
}
