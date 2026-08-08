/**
 * ts-rest handler composer for the bfm pillar — the typed
 * `RouterImplementation<BfmContract>` that `createExpressEndpoints` consumes
 * in `app.ts`.
 */
import { initServer } from '@ts-rest/express';

import { bfmContract } from '../../contract/rest.js';
import { readDevice } from '../auth/require-device.js';
import { buildMobileBootstrap, defaultMobileBootstrapDeps } from '../mobile/bootstrap.js';
import {
  createRateLimiter,
  PAIRING_CODE_RATE_LIMIT,
  PAIRING_CODE_RATE_WINDOW_MS,
  type RateLimiter,
} from '../rate-limit.js';
import { makeOperatorHandlers } from './operator-handlers.js';

import type { Response } from 'express';

import type { BfmDb } from '../../db/index.js';
import type { MobileBootstrapDeps } from '../mobile/bootstrap.js';

const server: ReturnType<typeof initServer> = initServer();

export interface BfmRestHandlerDeps {
  /** Build version, surfaced on the health response. */
  version: string;
  /**
   * Open handle to `bfm.db` — the device allow-list. Read by the guard on
   * every `/mobile/*` request and written by the bootstrap route, which
   * records the check-in.
   */
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
  /**
   * `pillarId → baseUrl` overrides, as resolved once at boot by
   * `configureBfmServerSdk`. Threaded in rather than re-read from the
   * environment here so the reachability probe and the outbound calls it
   * predicts cannot end up aimed at different hosts.
   */
  internalBaseUrls?: Readonly<Record<string, string>>;
  /**
   * Seams for the bootstrap route's registry read, per-pillar probe and clock.
   * Production omits it; tests supply fakes so no probe leaves the process.
   */
  bootstrap?: Partial<Omit<MobileBootstrapDeps, 'db'>>;
}

export function makeBfmRestHandlers(
  deps: BfmRestHandlerDeps
): ReturnType<typeof server.router<typeof bfmContract>> {
  const issuanceLimiter =
    deps.issuanceLimiter ??
    createRateLimiter({ limit: PAIRING_CODE_RATE_LIMIT, windowMs: PAIRING_CODE_RATE_WINDOW_MS });

  const bootstrapDeps: MobileBootstrapDeps = {
    ...defaultMobileBootstrapDeps(deps.db, deps.internalBaseUrls ?? {}),
    ...deps.bootstrap,
  };

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
    mobile: {
      // `readDevice` throws rather than returning undefined when the guard did
      // not run, so a mis-mount that made this route public surfaces as a 500
      // on the first request instead of an anonymous caller being served.
      bootstrap: async ({ res }: { res: Response }) => ({
        status: 200 as const,
        body: await buildMobileBootstrap(readDevice(res), bootstrapDeps),
      }),
    },
  });
}
