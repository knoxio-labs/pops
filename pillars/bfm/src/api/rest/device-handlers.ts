/**
 * Handlers for the `device.*` sub-router — the routes a phone reaches with no
 * Access session, no device row and no token.
 *
 * There is no `requireOperator` here and there is nothing standing in for it.
 * That is the design, not an omission: the pairing exchange is how a caller
 * *becomes* someone, so it cannot require being someone first. What guards it
 * is possession of a live pairing code, the budget mounted on the path in
 * `app.ts`, and the fact that every branch below answers the same way for
 * every reason a code can fail.
 *
 * The decisions — validate the key before the code, 403 rather than 401, why
 * the two failure statuses are safe to distinguish — are in
 * `auth/pairing-exchange.ts` and `contract/rest-device-schemas.ts`. This file
 * is the mapping and nothing more.
 */
import { completePairingExchange } from '../auth/pairing-exchange.js';

import type { ServerInferRequest } from '@ts-rest/core';
import type { KeyObject } from 'node:crypto';

import type { bfmDeviceContract } from '../../contract/rest-device.js';
import type { BfmDb } from '../../db/index.js';

type Req = ServerInferRequest<typeof bfmDeviceContract>;

export interface DeviceHandlerDeps {
  db: BfmDb;
  /** Signs the access token the exchange returns. */
  accessTokenSigningKey: KeyObject;
  /** Lifetime of the refresh token minted at pairing. Defaults to the service's own TTL. */
  refreshTokenTtlMs?: number;
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
  };
}
