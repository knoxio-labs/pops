import { createServiceAccountScopeGate, defineErrors } from '@pops/pillar-express';

import { foodContract } from '../../contract/rest.js';

import type { RequestHandler } from 'express';

import type { ContractScopeMap, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const FOOD_SCOPE_ROOT = 'food';

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
  errors: foodScopeErrors,
});

/** Every food contract route projected onto the scope it requires. */
export const foodScopeMap: ContractScopeMap = gate.scopeMap;

/**
 * Build the food contract's inbound service-account gate.
 *
 * @param verify Resolves a presented key to its principal. Production passes a
 *   registry-backed verifier; tests inject a fake.
 */
export function createServiceAccountScopeMiddleware(
  verify: ServiceAccountVerifier
): RequestHandler {
  return gate.createMiddleware(verify);
}
