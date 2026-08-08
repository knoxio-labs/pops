/**
 * `GET /service-accounts/self` — service-account introspection for sibling
 * pillars.
 *
 * The registry owns the `service_accounts` table, so no other producer can turn
 * a presented `X-API-Key` into a principal on its own. This route is how they
 * ask: the caller forwards the key it received, and gets back the account that
 * key resolves to, or a 401 if it resolves to nothing. `@pops/pillar-sdk/server`'s
 * `createRegistryServiceAccountVerifier` is the client half; the path is shared
 * through `REGISTRY_SERVICE_ACCOUNT_SELF_PATH` so the two cannot drift.
 *
 * Authentication is the identity middleware's existing service-account leg,
 * which is also where revocation is checked — so a revoked key stops resolving
 * here the moment it is revoked, and every pillar that asks learns it within
 * the verifier's cache TTL.
 *
 * Raw HTTP, not a ts-rest contract route: it is a machine-to-machine
 * federation primitive like `POST /uri/resolve` and `GET /registry/pillars`,
 * and keeping it off the contract keeps it out of the OpenAPI projection the
 * frontend clients are generated from.
 *
 * Presenting the key is the price of admission, so the route tells a caller
 * nothing it could not already learn by using the key directly.
 */
import { readPrincipal } from '../../middleware/identity.js';

import type { Request, RequestHandler, Response } from 'express';

/** The wire shape sibling pillars parse. Field names are load-bearing. */
export interface ServiceAccountSelfPayload {
  id: string;
  name: string;
  scopes: string[];
}

export function createServiceAccountSelfHandler(): RequestHandler {
  return (_req: Request, res: Response): void => {
    const { serviceAccount } = readPrincipal(res);
    if (!serviceAccount) {
      res.status(401).json({
        message: 'This endpoint requires a service-account X-API-Key.',
      });
      return;
    }
    const payload: ServiceAccountSelfPayload = {
      id: serviceAccount.id,
      name: serviceAccount.name,
      scopes: [...serviceAccount.scopes],
    };
    res.json(payload);
  };
}
