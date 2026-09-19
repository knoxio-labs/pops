import { buildContractScopeMap, resolveContractScope } from '@pops/pillar-sdk/server';

import { SyncRequestError } from './errors.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

const PROTOCOL_PATTERN = /^\d{1,6}$/;

/**
 * Check a request's `Pops-Inventory-Protocol` against the server's minimum
 * (Inventory ADR-002 D10) and return it. Absent, or below the minimum, is
 * `426 client_too_old`, which the phone shows as "This app is too old";
 * present but not a whole number is `400 invalid_protocol`. A client newer
 * than the server is served: protocol changes are additive until the minimum
 * is raised.
 */
export function requireProtocol(header: string | undefined, minProtocol: number): number {
  const trimmed = header?.trim() ?? '';
  if (trimmed === '') {
    throw new SyncRequestError(
      426,
      'client_too_old',
      `Pops-Inventory-Protocol is required; this server needs at least ${minProtocol}`
    );
  }
  if (!PROTOCOL_PATTERN.test(trimmed)) {
    throw new SyncRequestError(400, 'invalid_protocol', 'Pops-Inventory-Protocol is not a number');
  }
  const protocol = Number.parseInt(trimmed, 10);
  if (protocol < minProtocol) {
    throw new SyncRequestError(
      426,
      'client_too_old',
      `protocol ${protocol} is below this server's minimum of ${minProtocol}`
    );
  }
  return protocol;
}

/**
 * Middleware applying {@link requireProtocol} to every route of `routers`
 * (the sync protocol's sub-routers) and to nothing else. It runs ahead of the
 * contract handlers because `426` is outside the status set ts-rest lets a
 * handler return; the routes' paths come from the contract, as the scope gate
 * derives its own, so a route added there is covered without a second list.
 *
 * @param readMinProtocol The server's current minimum, read per request so an
 *   operator raising it takes effect without a restart.
 */
export function createProtocolGate(
  routers: unknown,
  readMinProtocol: () => number
): RequestHandler {
  const routes = buildContractScopeMap(routers, 'protocol');
  return (req: Request, res: Response, next: NextFunction): void => {
    if (resolveContractScope(routes, req.method, req.path) === undefined) {
      next();
      return;
    }
    try {
      requireProtocol(req.get('pops-inventory-protocol'), readMinProtocol());
      next();
    } catch (error) {
      if (!(error instanceof SyncRequestError)) {
        next(error);
        return;
      }
      res.status(error.status).json({ message: error.message, code: error.code });
    }
  };
}
