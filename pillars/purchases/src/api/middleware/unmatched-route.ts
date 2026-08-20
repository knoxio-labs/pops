/**
 * Terminal handler for a request whose method and path matched no raw probe
 * route and no route in `purchasesContract`.
 *
 * Express's own fallback for that is a `text/html` page and, critically, no
 * server-side log line — a 404 that was never supposed to happen leaves
 * nothing to look at afterwards beyond whatever the caller printed. This logs
 * the method and path and answers the same `{ message, code }` shape every
 * other rejection in this pillar uses. It does not cover 404s a handler
 * produces itself; those still log nothing.
 *
 * `OPTIONS` is passed through: Express builds its automatic `Allow` response
 * in the router's out callback, which is reached only when every layer —
 * including this one, which matches every method — declines.
 */
import type { NextFunction, Request, Response } from 'express';

export function unmatchedRouteHandler(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'OPTIONS' || res.headersSent) {
    next();
    return;
  }
  console.error('[purchases-api] no route matched', {
    method: req.method,
    path: req.path,
  });
  res.status(404).json({
    message: `No route matches ${req.method} ${req.path}`,
    code: 'NOT_FOUND',
  });
}
