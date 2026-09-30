import { createServiceAccountScopeGate, defineErrors } from '@pops/pillar-express';

import { documentsContract } from '../../contract/rest.js';

import type { RequestHandler } from 'express';

import type { RawRouteTree } from '@pops/pillar-express';
import type { ContractScopeMap, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const DOCUMENTS_SCOPE_ROOT = 'documents';

const DOCUMENTS_RAW_ROUTE_SCOPES = {
  paperless: {
    thumbnail: { method: 'GET', path: '/documents/:id/thumbnail' },
  },
} as const satisfies RawRouteTree;

const documentsAuthErrors = defineErrors('documents', {
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
  contract: documentsContract,
  rootScope: DOCUMENTS_SCOPE_ROOT,
  logPrefix: 'documents-api',
  rawRoutes: DOCUMENTS_RAW_ROUTE_SCOPES,
  errors: documentsAuthErrors,
});

/** Every documents contract route projected onto its required scope. */
export const documentsScopeMap: ContractScopeMap = gate.scopeMap;

/** The raw thumbnail route projected onto its required scope. */
export const documentsRawScopeMap: ContractScopeMap = gate.rawScopeMap;

/**
 * Build the documents gate for contract and thumbnail requests.
 *
 * @param verify Resolves a presented key to its principal. Production passes a
 *   registry-backed verifier; tests inject a fake.
 */
export function createServiceAccountScopeMiddleware(
  verify: ServiceAccountVerifier
): RequestHandler {
  return gate.createMiddleware(verify);
}
