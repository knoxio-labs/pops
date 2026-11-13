import { createServiceAccountScopeGate, type AccessIdentityOptions } from '@pops/pillar-express';

import { tripsContract } from '../../contract/rest.js';

import type { RequestHandler } from 'express';

import type { ContractScopeMap, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

function createGate(
  identity?: AccessIdentityOptions
): ReturnType<typeof createServiceAccountScopeGate> {
  return createServiceAccountScopeGate({
    contract: tripsContract,
    rootScope: 'trips',
    logPrefix: 'trips-api',
    requireCredential: true,
    allowVerifiedAccessOperatorWithoutServiceAccountCredential: true,
    identity,
  });
}

const gate = createGate();

/** Projected route scopes for the trips contract. */
export const tripsScopeMap: ContractScopeMap = gate.scopeMap;

/** Build the Trips gate for verified operators and scoped service accounts. */
export function createServiceAccountScopeMiddleware(
  verify: ServiceAccountVerifier,
  identity?: AccessIdentityOptions
): RequestHandler {
  return (identity === undefined ? gate : createGate(identity)).createMiddleware(verify);
}
