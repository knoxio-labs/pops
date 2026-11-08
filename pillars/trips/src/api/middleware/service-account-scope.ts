import { createServiceAccountScopeGate } from '@pops/pillar-express';

import { tripsContract } from '../../contract/rest.js';

import type { RequestHandler } from 'express';

import type { ContractScopeMap, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const gate = createServiceAccountScopeGate({
  contract: tripsContract,
  rootScope: 'trips',
  logPrefix: 'trips-api',
  requireCredential: true,
});

/** Projected route scopes for the trips contract. */
export const tripsScopeMap: ContractScopeMap = gate.scopeMap;

/** Build the mandatory service-account middleware for trips routes. */
export function createServiceAccountScopeMiddleware(
  verify: ServiceAccountVerifier
): RequestHandler {
  return gate.createMiddleware(verify);
}
