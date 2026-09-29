/**
 * Narrow inbound service-account gate for pairing-code issuance.
 *
 * Only the pairing route is in this gate's contract. The device list and
 * revocation routes remain human-operator surfaces even when a caller has a
 * valid service-account key.
 */
import { createServiceAccountScopeGate } from '@pops/pillar-express';

import { bfmOperatorContract } from '../../contract/rest-operator.js';
import { type IdentityLocals } from './identity.js';

import type { RequestHandler } from 'express';

import type { ContractScopeMap, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const pairingContract = {
  operator: {
    issuePairingCode: bfmOperatorContract.issuePairingCode,
  },
} as const;

/** The exact service-account grant required to mint a pairing code. */
export const BFM_PAIRING_ISSUE_SCOPE = 'bfm.operator.issuePairingCode';

const gate = createServiceAccountScopeGate({
  contract: pairingContract,
  rootScope: 'bfm',
  logPrefix: 'bfm-api',
});

/** The route-to-scope projection enforced by the pairing gate. */
export const bfmPairingScopeMap: ContractScopeMap = gate.scopeMap;

/**
 * Build the pairing route's service-account middleware.
 *
 * The shared gate makes the authorization decision and sends failures. This
 * wrapper preserves the verified principal for the pairing handler without
 * changing the gate's framework-neutral contract.
 */
export function createPairingServiceAccountMiddleware(
  verify: ServiceAccountVerifier
): RequestHandler {
  return (req, res, next): void => {
    (res.locals as IdentityLocals).pairingServiceAccount = null;
    const middleware = gate.createMiddleware(async (apiKey) => {
      const verification = await verify(apiKey);
      if (verification.outcome === 'authenticated') {
        (res.locals as IdentityLocals).pairingServiceAccount = verification.principal;
      }
      return verification;
    });
    middleware(req, res, next);
  };
}
