/**
 * Handlers for the `device.*` sub-router — the routes a phone reaches with no
 * Access session, no device row and no usable token.
 *
 * There is no `requireOperator` here and there is nothing standing in for it.
 * That is the design, not an omission: pairing is how a caller *becomes*
 * someone and refresh is what it does when the token proving it has lapsed, so
 * neither can require presenting one. What guards them is the credential in
 * the body, the budgets mounted on the paths in `app.ts`, and the fact that
 * every failure branch below answers the same way for every reason of its
 * class.
 *
 * The decisions live with the operations, not here — validate the key before
 * the code in `auth/pairing-exchange.ts`; the signed-message format, the order
 * of the refresh checks and why reuse detection precedes signature
 * verification in `auth/refresh-exchange.ts`; and which refusal is which
 * status in `contract/rest-device-schemas.ts`. This file is the mapping and
 * nothing more.
 */
import { completePairingExchange } from '../auth/pairing-exchange.js';
import { completeRefreshExchange } from '../auth/refresh-exchange.js';

import type { KeyObject } from 'node:crypto';

import type { ServerInferRequest } from '@ts-rest/core';
import type { Response } from 'express';

import type { bfmDeviceContract } from '../../contract/rest-device.js';
import type { BfmDb } from '../../db/index.js';
import type { RefreshChallengeStore } from '../auth/refresh-challenge.js';

type Req = ServerInferRequest<typeof bfmDeviceContract>;

export interface DeviceHandlerDeps {
  db: BfmDb;
  /** Signs the access token both exchanges return. */
  accessTokenSigningKey: KeyObject;
  /**
   * Where `challenge` puts a nonce and `refresh` spends it. ONE store shared by
   * both handlers — two would mean a nonce issued by one route could never be
   * spent at the other, which is the only thing either of them is for.
   */
  refreshChallenges: RefreshChallengeStore;
  /**
   * Lifetime of the refresh token minted at pairing AND of every successor
   * rotation issues. Defaults to the service's own TTL.
   */
  refreshTokenTtlMs?: number;
}

/**
 * RFC 9110 §15.5.2 makes `WWW-Authenticate` mandatory on a 401, and this route
 * — unlike the pairing exchange beside it — has a real challenge to send.
 *
 * That asymmetry is principled rather than an oversight. A pairing code is not
 * an HTTP authentication scheme, so `POST /devices/pair` has nothing to name
 * and answers 403 instead, which its schema's own note argues from §15.5.4. A
 * refresh token IS a bearer token; RFC 6750 §2.2 allows one to travel in the
 * request body, and §3 defines exactly this challenge for it. So the header is
 * accurate here, and it is the same one `require-device.ts` sends for the same
 * reason.
 *
 * Deliberately no `error_description`. The reason belongs in the body, where
 * it cannot be mistaken for a machine-readable hint, and the two 401 codes are
 * already the machine-readable part.
 */
function challengeBearer(res: Response): void {
  res.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"');
}

export function makeDeviceHandlers(deps: DeviceHandlerDeps) {
  return {
    // `async` only to satisfy ts-rest's `Promise`-returning implementation
    // type. The exchange is synchronous throughout: better-sqlite3 is, and a
    // transaction that could await would be a transaction that could interleave
    // with another request between spending the code and writing the device.
    pair: async ({ body }: Req['pair']) => {
      const result = completePairingExchange(body, {
        db: deps.db,
        accessTokenSigningKey: deps.accessTokenSigningKey,
        ...(deps.refreshTokenTtlMs === undefined
          ? {}
          : { refreshTokenTtlMs: deps.refreshTokenTtlMs }),
      });

      if (result.outcome === 'invalid-key') {
        return {
          status: 400 as const,
          body: {
            code: 'invalid_request' as const,
            // Names the field and the expectation, and nothing about the
            // bytes. The app author needs to know which of the four fields is
            // wrong; the parser's reason would add only what a malformed key
            // already tells whoever sent it.
            message: 'publicKey must be the base64 SPKI/DER encoding of a P-256 public key.',
          },
        };
      }

      if (result.outcome === 'rejected') {
        return {
          status: 403 as const,
          body: {
            code: 'pairing_rejected' as const,
            // One sentence for three causes — unknown, expired, consumed. It
            // is a constant, so the response is byte-identical across them.
            message: 'That pairing code cannot be used. Ask for a new one.',
          },
        };
      }

      return {
        status: 201 as const,
        body: {
          deviceId: result.deviceId,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresIn: result.expiresInSeconds,
        },
      };
    },

    challenge: async () => {
      const challenge = deps.refreshChallenges.issue();
      return {
        status: 201 as const,
        body: { nonce: challenge.nonce, expiresIn: challenge.expiresInSeconds },
      };
    },

    refresh: async ({ body, res }: Req['refresh'] & { res: Response }) => {
      const result = completeRefreshExchange(body, {
        db: deps.db,
        accessTokenSigningKey: deps.accessTokenSigningKey,
        challenges: deps.refreshChallenges,
        ...(deps.refreshTokenTtlMs === undefined
          ? {}
          : { refreshTokenTtlMs: deps.refreshTokenTtlMs }),
      });

      if (result.outcome === 'challenge-expired') {
        challengeBearer(res);
        return {
          status: 401 as const,
          body: {
            code: 'challenge_expired' as const,
            message: 'That challenge is spent or expired. Request another and retry.',
          },
        };
      }

      if (result.outcome === 'device-revoked') {
        return {
          status: 403 as const,
          body: {
            code: 'device_revoked' as const,
            message: 'This device has been revoked. Pair again.',
          },
        };
      }

      if (result.outcome === 'rejected') {
        challengeBearer(res);
        return {
          status: 401 as const,
          body: {
            code: 'invalid_grant' as const,
            // One sentence for five causes — unknown, expired, revoked,
            // already spent, and signed by the wrong key. A constant, so the
            // response is byte-identical across them.
            message: 'That refresh token cannot be used. Pair this device again.',
          },
        };
      }

      return {
        status: 200 as const,
        body: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresIn: result.expiresInSeconds,
        },
      };
    },
  };
}
