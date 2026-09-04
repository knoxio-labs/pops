/**
 * Binary GET for a logo blob. A plain Express route, not a ts-rest contract
 * route — it streams raw bytes with a content-type header, not JSON — mounted
 * in `app.ts` after the service-account-scope gate so it is covered by the
 * exact same middleware every contract route is (mirrors food's
 * `serveHeroImage`, the established precedent for a binary route living
 * beside a ts-rest contract surface).
 *
 * `:id` is a `logo_blobs.id`, never mutated in place (see the schema doc
 * comment) — the URL is therefore content-addressed and safe to cache
 * forever, no revalidation required.
 */
import { logoBlobsService, type FinanceDb } from '../../db/index.js';

import type { Request, RequestHandler, Response } from 'express';

const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export function makeServeLogo(db: FinanceDb): RequestHandler {
  return (req: Request, res: Response): void => {
    const id = req.params['id'];
    if (typeof id !== 'string' || id.length === 0) {
      res.status(400).json({ error: 'Missing logo id' });
      return;
    }

    const etag = `"${id}"`;
    if (req.get('If-None-Match') === etag) {
      res.status(304).end();
      return;
    }

    let blob;
    try {
      blob = logoBlobsService.getLogoBlob(db, id);
    } catch {
      res.status(404).json({ error: 'Logo not found' });
      return;
    }

    res.set({
      'Content-Type': blob.contentType,
      'Content-Length': String(blob.byteLength),
      'Cache-Control': IMMUTABLE_CACHE_CONTROL,
      ETag: etag,
    });
    res.status(200).send(blob.data);
  };
}
