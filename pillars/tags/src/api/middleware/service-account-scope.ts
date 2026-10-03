import { createServiceAccountScopeGate } from '@pops/pillar-express';

import { tagsContract } from '../../contract/rest.js';

import type { RequestHandler } from 'express';

import type { ContractScopeMap, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const gate = createServiceAccountScopeGate({
  contract: tagsContract,
  rootScope: 'tags',
  logPrefix: 'tags-api',
  requireCredential: true,
});

/** Projected route scopes for the tags contract. */
export const tagsScopeMap: ContractScopeMap = gate.scopeMap;

/** Build the mandatory service-account middleware for tags routes. */
export function createServiceAccountScopeMiddleware(
  verify: ServiceAccountVerifier
): RequestHandler {
  return gate.createMiddleware(verify);
}
