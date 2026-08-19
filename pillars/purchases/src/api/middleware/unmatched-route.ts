/**
 * The last handler in the stack: anything that reaches here matched no raw
 * probe route and no route in `purchasesContract`.
 *
 * Express's own fallback for this is a `text/html` page and, critically, no
 * server-side log line — a 404 that was never supposed to happen (a create
 * on `/purchases`, say) would leave nothing to look at afterwards beyond
 * whatever the caller printed. POPS-1312 found exactly one such 404, with an
 * empty body, once in 1,496 real backfill POSTs, and could not reproduce it
 * outside `supertest`'s per-request ephemeral listener. Unexplained is not
 * the same as safe to ignore, so a recurrence must not be silent again: this
 * logs the method and path server-side and answers with the same
 * `{ message, code }` shape every other rejection in this pillar uses,
 * rather than Express's unparseable HTML.
 */
import type { NextFunction, Request, Response } from 'express';

export function unmatchedRouteHandler(req: Request, res: Response, _next: NextFunction): void {
  console.error('[purchases-api] no route matched', {
    method: req.method,
    path: req.originalUrl,
  });
  res.status(404).json({
    message: `No route matches ${req.method} ${req.originalUrl}`,
    code: 'NOT_FOUND',
  });
}
