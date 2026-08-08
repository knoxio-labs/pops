/**
 * ts-rest handler composer for the bfm pillar — the typed
 * `RouterImplementation<BfmContract>` that `createExpressEndpoints` consumes
 * in `app.ts`.
 */
import { initServer } from '@ts-rest/express';

import { bfmContract } from '../../contract/rest.js';
import {
  createRateLimiter,
  PAIRING_CODE_RATE_LIMIT,
  PAIRING_CODE_RATE_WINDOW_MS,
  type RateLimiter,
} from '../rate-limit.js';
import { makeOperatorHandlers } from './operator-handlers.js';

import type { BfmDb } from '../../db/index.js';

const server: ReturnType<typeof initServer> = initServer();

export interface BfmRestHandlerDeps {
  /** Build version, surfaced on the health response. */
  version: string;
  /** Open handle to `bfm.db`. */
  db: BfmDb;
  /**
   * The BFM's public, Access-bypassed origin — the base the pairing QR points
   * the phone at.
   */
  publicBaseUrl: string;
  /**
   * Issuance rate limiter. Defaults to {@link PAIRING_CODE_RATE_LIMIT} per
   * operator per {@link PAIRING_CODE_RATE_WINDOW_MS}; injectable so a test can
   * drive the window without sleeping through it.
   */
  issuanceLimiter?: RateLimiter;
  /** Lifetime of a minted pairing code. Defaults to the service's own TTL. */
  pairingCodeTtlMs?: number;
}

export function makeBfmRestHandlers(
  deps: BfmRestHandlerDeps
): ReturnType<typeof server.router<typeof bfmContract>> {
  const issuanceLimiter =
    deps.issuanceLimiter ??
    createRateLimiter({ limit: PAIRING_CODE_RATE_LIMIT, windowMs: PAIRING_CODE_RATE_WINDOW_MS });

  return server.router(bfmContract, {
    health: async () => ({
      status: 200,
      body: {
        ok: true,
        status: 'ok',
        pillar: 'bfm',
        version: deps.version,
        ts: new Date().toISOString(),
      },
    }),
    operator: makeOperatorHandlers({
      db: deps.db,
      issuanceLimiter,
      publicBaseUrl: deps.publicBaseUrl,
      ...(deps.pairingCodeTtlMs === undefined ? {} : { pairingCodeTtlMs: deps.pairingCodeTtlMs }),
    }),
  });
}
