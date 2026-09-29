/**
 * Handlers for the `operator.*` sub-router.
 *
 * Pairing-code issuance accepts either the human operator principal or the
 * exact registry-backed service-account scope. Device listing and revocation
 * remain human-only through `requireOperator(readPrincipal(res))`. That is not
 * belt-and-braces: bfm's own hostname has Cloudflare Access bypassed so the
 * phone can reach the device-facing routes, and this same Express app answers
 * there, so an anonymous caller genuinely arrives at these handlers. The gates
 * are what turn such callers away.
 *
 * The gate runs BEFORE the rate limiter on purpose. Limiting first would let
 * an unauthenticated caller consume an authenticated operator's budget — the
 * limiter keys on the principal, and there is no principal to key on yet.
 */
import { bfmDeviceContract } from '../../contract/rest-device.js';
import { issuePairingCode, listDevices, revokeDevice } from '../../db/index.js';
import { readPrincipal, requireOperator, requirePairingIssuer } from '../middleware/identity.js';
import { NotFoundError, TooManyRequestsError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';
import type { Response } from 'express';

import type { bfmOperatorContract } from '../../contract/rest-operator.js';
import type { BfmDb } from '../../db/index.js';
import type { RateLimiter } from '../rate-limit.js';

type Req = ServerInferRequest<typeof bfmOperatorContract>;

export interface OperatorHandlerDeps {
  db: BfmDb;
  /** Budget for pairing-code issuance, keyed by human email or service-account id. */
  issuanceLimiter: RateLimiter;
  /**
   * The BFM's public, Access-bypassed origin — where the phone sends
   * `POST /devices/pair`. Carried into the QR payload so the handset is not
   * compiled against a hostname.
   */
  publicBaseUrl: string;
  /** Lifetime of a minted code. Defaults to the service's own TTL. */
  pairingCodeTtlMs?: number;
}

/**
 * The scannable payload: where to pair, and with what.
 *
 * A URL rather than a bare code so one QR carries both halves — the phone
 * derives the base URL from it instead of shipping a compiled-in hostname, and
 * the same string is still readable enough for an operator to dictate.
 *
 * The path comes off the contract, not a literal. This is the only place that
 * tells a handset where to send its pairing request, so a route that moved
 * without this following would print a QR pointing at a 404 — and nothing in
 * this pillar's own tests would fail, because they call the route directly.
 */
function buildPairingUrl(publicBaseUrl: string, code: string): string {
  const url = new URL(bfmDeviceContract.pair.path, publicBaseUrl);
  url.searchParams.set('code', code);
  return url.toString();
}

export function makeOperatorHandlers(deps: OperatorHandlerDeps) {
  return {
    issuePairingCode: ({ res }: { res: Response }) =>
      runHttp(() => {
        const issuer = requirePairingIssuer(res);
        const limiterKey =
          issuer.kind === 'operator' ? issuer.email : `service-account:${issuer.id}`;

        const decision = deps.issuanceLimiter.check(limiterKey);
        if (!decision.allowed) {
          res.setHeader('Retry-After', String(decision.retryAfterSeconds));
          throw new TooManyRequestsError(decision.retryAfterSeconds);
        }

        const issued = issuePairingCode(
          deps.db,
          deps.pairingCodeTtlMs === undefined ? {} : { ttlMs: deps.pairingCodeTtlMs }
        );

        return {
          status: 201 as const,
          body: {
            code: issued.code,
            pairingUrl: buildPairingUrl(deps.publicBaseUrl, issued.code),
            expiresAt: issued.expiresAt,
          },
        };
      }),

    listDevices: ({ res }: { res: Response }) =>
      runHttp(() => {
        requireOperator(readPrincipal(res));
        return { status: 200 as const, body: { devices: listDevices(deps.db) } };
      }),

    revokeDevice: ({ params, res }: Req['revokeDevice'] & { res: Response }) =>
      runHttp(() => {
        requireOperator(readPrincipal(res));

        const result = revokeDevice(deps.db, params.id);
        if (result.outcome === 'not-found') {
          throw new NotFoundError('Device', params.id);
        }

        return {
          status: 200 as const,
          body: {
            id: params.id,
            revokedAt: result.revokedAt,
            alreadyRevoked: result.outcome === 'already-revoked',
          },
        };
      }),
  };
}
