import { createServiceAccountScopeGate } from '@pops/pillar-express';

import { barcodeContract } from '../../contract/rest.js';

import type { RequestHandler } from 'express';

import type { ContractScopeMap, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const gate = createServiceAccountScopeGate({
  contract: barcodeContract,
  rootScope: 'barcode',
  logPrefix: 'barcode-api',
  requireCredential: true,
});

/** Projected route scopes for the barcode contract. */
export const barcodeScopeMap: ContractScopeMap = gate.scopeMap;

/** Build the mandatory service-account middleware for barcode routes. */
export function createServiceAccountScopeMiddleware(
  verify: ServiceAccountVerifier
): RequestHandler {
  return gate.createMiddleware(verify);
}
