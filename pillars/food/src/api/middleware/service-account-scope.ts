import { createServiceAccountScopeGate, defineErrors } from '@pops/pillar-express';

import { foodContract } from '../../contract/rest.js';

import type { RequestHandler } from 'express';

import type { RawRouteTree } from '@pops/pillar-express';
import type { ContractScopeMap, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const FOOD_SCOPE_ROOT = 'food';

/** Raw media routes whose data access follows the matching food domain grant. */
export const FOOD_RAW_ROUTE_SCOPES = {
  heroImage: {
    file: { method: 'GET', path: '/recipes/:recipeId/:filename' },
  },
  ingest: {
    media: {
      screenshot: { method: 'GET', path: '/ingest/source/:sourceId/screenshot' },
      video: { method: 'GET', path: '/ingest/source/:sourceId/video' },
    },
  },
} as const satisfies RawRouteTree;

const foodScopeErrors = defineErrors('food', {
  invalid: {
    area: 'auth',
    status: 401,
    message: 'Missing or invalid service-account credentials.',
    retryable: false,
  },
  forbidden: {
    area: 'auth',
    status: 403,
    message: 'This service account is not authorised for this operation.',
    retryable: false,
  },
  unavailable: {
    area: 'auth',
    status: 503,
    message: 'Service-account credentials could not be verified.',
    retryable: true,
  },
});

const gate = createServiceAccountScopeGate({
  contract: foodContract,
  rootScope: FOOD_SCOPE_ROOT,
  logPrefix: 'food-api',
  rawRoutes: FOOD_RAW_ROUTE_SCOPES,
  errors: foodScopeErrors,
});

/** Every food contract route projected onto the scope it requires. */
export const foodScopeMap: ContractScopeMap = gate.scopeMap;

/** Every food raw media route projected onto its required service-account scope. */
export const foodRawScopeMap: ContractScopeMap = gate.rawScopeMap;

/**
 * Build the food API's inbound service-account gate for contract and media routes.
 *
 * @param verify Resolves a presented key to its principal. Production passes a
 *   registry-backed verifier; tests inject a fake.
 */
export function createServiceAccountScopeMiddleware(
  verify: ServiceAccountVerifier
): RequestHandler {
  return gate.createMiddleware(verify);
}
