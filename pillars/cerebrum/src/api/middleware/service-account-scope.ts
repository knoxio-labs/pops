/**
 * Inbound service-account gate for Cerebrum's contract surface. A presented
 * key must resolve to a live account whose grant covers the route. Requests
 * without a key continue to rely on the existing network perimeter.
 */
import { createServiceAccountScopeGate, defineErrors } from '@pops/pillar-express';

import { cerebrumContract } from '../../contract/rest.js';

import type { RequestHandler } from 'express';

import type { ContractScopeMap, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const gate = createServiceAccountScopeGate({
  contract: cerebrumContract,
  rootScope: 'cerebrum',
  logPrefix: 'cerebrum-api',
  errors: defineErrors('cerebrum', {
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
  }),
});

/**
 * Every contract route projected onto its required Cerebrum scope. Exported
 * so tests can detect an empty table that would leave the contract ungated.
 */
export const cerebrumScopeMap: ContractScopeMap = gate.scopeMap;

/**
 * Build the middleware and mount it before `createExpressEndpoints`.
 *
 * @param verify Resolves a presented key to its principal. Production passes a
 *   registry-backed verifier; tests inject a fake.
 */
export function createServiceAccountScopeMiddleware(
  verify: ServiceAccountVerifier
): RequestHandler {
  return gate.createMiddleware(verify);
}
