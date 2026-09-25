import type { RequestHandler } from 'express';

/**
 * Makes every `/mobile/*` answer uncacheable and unconditional.
 *
 * Express tags each JSON body with an ETag, and iOS's URL cache stores any
 * response that does not forbid it, then revalidates the next identical GET
 * with `If-None-Match`. The server's `304` reaches the generated client as an
 * undocumented status, so a repeat inventory download failed until the cache
 * was cleared. `no-store` stops new entries; dropping the conditional headers
 * means a phone that already holds entries gets a full `200` that replaces
 * them.
 */
export function createMobileNoStore(): RequestHandler {
  return (req, res, next) => {
    delete req.headers['if-none-match'];
    delete req.headers['if-modified-since'];
    res.set('Cache-Control', 'no-store');
    next();
  };
}
