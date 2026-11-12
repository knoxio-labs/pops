import { initContract } from '@ts-rest/core';

import { createServiceAccountScopeGate, type AccessIdentityOptions } from '@pops/pillar-express';
import { resolveContractScope } from '@pops/pillar-sdk/server';

import { tagsContract } from '../../contract/rest.js';

import type { RequestHandler } from 'express';

import type { ContractScopeMap, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const contract = initContract();
const listContract = contract.router(
  { tags: { list: tagsContract.tags.list } },
  { pathPrefix: '', strictStatusCodes: false }
);

function createGate(
  routeContract: unknown,
  identity?: AccessIdentityOptions,
  allowVerifiedOperator = false
): ReturnType<typeof createServiceAccountScopeGate> {
  return createServiceAccountScopeGate({
    contract: routeContract,
    rootScope: 'tags',
    logPrefix: 'tags-api',
    requireCredential: true,
    ...(allowVerifiedOperator
      ? { allowVerifiedAccessOperatorWithoutServiceAccountCredential: true }
      : {}),
    identity,
  });
}

const gate = createGate(tagsContract);

/** Projected route scopes for the tags contract. */
export const tagsScopeMap: ContractScopeMap = gate.scopeMap;

/** Build Tags authorization for verified Access operators and scoped service accounts. */
export function createServiceAccountScopeMiddleware(
  verify: ServiceAccountVerifier,
  identity?: AccessIdentityOptions
): RequestHandler {
  const strictGate = identity === undefined ? gate : createGate(tagsContract, identity);
  const operatorListGate = createGate(listContract, identity, true);
  const strictMiddleware = strictGate.createMiddleware(verify);
  const listMiddleware = operatorListGate.createMiddleware(verify);

  return (req, res, next) => {
    if (resolveContractScope(operatorListGate.scopeMap, req.method, req.path) !== undefined) {
      listMiddleware(req, res, next);
      return;
    }
    strictMiddleware(req, res, next);
  };
}
