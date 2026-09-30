import { createServiceAccountScopeGate, defineErrors } from '@pops/pillar-express';

import { mediaContract } from '../../contract/rest.js';

import type { RequestHandler } from 'express';

import type { ContractScopeMap, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const gate = createServiceAccountScopeGate({
  contract: mediaContract,
  rootScope: 'media',
  logPrefix: 'media-api',
  errors: defineErrors('media', {
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

/** Scopes derived from every operation in the media contract. */
export const mediaScopeMap: ContractScopeMap = gate.scopeMap;

/**
 * Creates the media contract's inbound service-account gate.
 *
 * @param verify Resolves a presented key to its live service-account grants.
 */
export function createServiceAccountScopeMiddleware(
  verify: ServiceAccountVerifier
): RequestHandler {
  return gate.createMiddleware(verify);
}
