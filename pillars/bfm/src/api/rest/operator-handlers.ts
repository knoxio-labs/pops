/**
 * Handlers for the `operator.*` sub-router.
 *
 * Every route opens with `requireOperator(readPrincipal(res))`. That is not
 * belt-and-braces: bfm's own hostname has Cloudflare Access bypassed so the
 * phone can reach the device-facing routes, and this same Express app answers
 * there, so an anonymous caller genuinely arrives at these handlers. The gate
 * is what turns them away.
 *
 * The gate runs BEFORE the rate limiter on purpose. Limiting first would let
 * an unauthenticated caller consume an authenticated operator's budget — the
 * limiter keys on the principal, and there is no principal to key on yet.
 */
import { issuePairingCode, listDevices, revokeDevice } from '../../db/index.js';
import { readPrincipal, requireOperator } from '../middleware/identity.js';
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
  /** Budget for pairing-code issuance, keyed per operator. */
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
 */
function buildPairingUrl(publicBaseUrl: string, code: string): string {
  const url = new URL('/devices/pair', publicBaseUrl);
  url.searchParams.set('code', code);
  return url.toString();
}

export function makeOperatorHandlers(deps: OperatorHandlerDeps) {
  return {
    issuePairingCode: ({ res }: { res: Response }) =>
      runHttp(() => {
        const operator = requireOperator(readPrincipal(res));

        const decision = deps.issuanceLimiter.check(operator.email);
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
