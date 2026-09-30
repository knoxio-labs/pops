import { createServiceAccountScopeGate, defineErrors } from '@pops/pillar-express';

import { listsContract } from '../../contract/rest.js';

import type { RequestHandler } from 'express';

import type { ContractScopeMap, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const LISTS_SCOPE_ROOT = 'lists';

const listsAuthErrors = defineErrors('lists', {
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
  contract: listsContract,
  rootScope: LISTS_SCOPE_ROOT,
  logPrefix: 'lists-api',
  errors: listsAuthErrors,
});

/** Every lists contract route projected onto the scope it requires. */
export const listsScopeMap: ContractScopeMap = gate.scopeMap;

/**
 * Build the lists contract's inbound service-account gate.
 *
 * @param verify Resolves a presented key to its principal. Production passes a
 *   registry-backed verifier; tests inject a fake.
 */
export function createServiceAccountScopeMiddleware(
  verify: ServiceAccountVerifier
): RequestHandler {
  return gate.createMiddleware(verify);
}
