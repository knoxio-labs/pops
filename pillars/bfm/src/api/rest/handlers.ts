/**
 * ts-rest handler composer for the bfm pillar — the typed
 * `RouterImplementation<BfmContract>` that `createExpressEndpoints` consumes
 * in `app.ts`.
 */
import { initServer } from '@ts-rest/express';

import { bfmContract } from '../../contract/rest.js';
import { createRefreshChallengeStore } from '../auth/refresh-challenge.js';
import { readDevice } from '../auth/require-device.js';
import { buildMobileBootstrap, defaultMobileBootstrapDeps } from '../mobile/bootstrap.js';
import {
  createRateLimiter,
  PAIRING_CODE_RATE_LIMIT,
  PAIRING_CODE_RATE_WINDOW_MS,
  type RateLimiter,
} from '../rate-limit.js';
import { makeDeviceHandlers } from './device-handlers.js';
import {
  makeMobileFinanceHandlers,
  type MobileFinanceHandlerDeps,
} from './mobile-finance-handlers.js';
import {
  makeMobilePurchasesHandlers,
  type MobilePurchasesHandlerDeps,
} from './mobile-purchases-handlers.js';
import { makeOperatorHandlers } from './operator-handlers.js';

import type { KeyObject } from 'node:crypto';

import type { Response } from 'express';

import type { BfmDb } from '../../db/index.js';
import type { RefreshChallengeStore } from '../auth/refresh-challenge.js';
import type { MobileBootstrapDeps } from '../mobile/bootstrap.js';

const server: ReturnType<typeof initServer> = initServer();

export interface BfmRestHandlerDeps extends MobileFinanceHandlerDeps, MobilePurchasesHandlerDeps {
  /** Build version, surfaced on the health response. */
  version: string;
  /** Open handle to `bfm.db`. */
  db: BfmDb;
  /**
   * Signs the access token the pairing exchange mints, and verifies the one on
   * every `/mobile/*` request. Required rather than optional: an app that could
   * be built without one would be an app whose perimeter can go missing
   * silently.
   */
  accessTokenSigningKey: KeyObject;
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
   * Lifetime of the refresh token minted at pairing, and of every successor a
   * rotation issues. Defaults to the service's own TTL.
   */
  refreshTokenTtlMs?: number;
  /**
   * Where refresh nonces live between `POST /devices/challenge` and
   * `POST /devices/refresh`. Defaults to a fresh in-memory store with the
   * shipped TTL; injectable so a test can pin the clock and the nonce it is
   * about to sign over.
   *
   * One store per app instance, which is also one per process. See
   * `auth/refresh-challenge.ts` for what that costs and why it is the right
   * trade for a value worthless a minute after it is issued.
   */
  refreshChallenges?: RefreshChallengeStore;
  /**
   * `pillarId → baseUrl` overrides, as resolved once at boot by
   * `configureBfmServerSdk`. Threaded in rather than re-read from the
   * environment here so the bootstrap route's reachability probe and the
   * outbound calls it predicts cannot end up aimed at different hosts.
   */
  internalBaseUrls?: Readonly<Record<string, string>>;
  /**
   * Per-pillar deadline for the bootstrap route's reachability probe, as
   * resolved once at boot by `resolveProbeTimeoutMs`. Undefined means the
   * probe's own default (`DEFAULT_PROBE_TIMEOUT_MS`) stands.
   */
  probeTimeoutMs?: number;
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
    ...defaultMobileBootstrapDeps(deps.db, deps.internalBaseUrls ?? {}, deps.probeTimeoutMs),
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
    device: makeDeviceHandlers({
      db: deps.db,
      accessTokenSigningKey: deps.accessTokenSigningKey,
      refreshChallenges: deps.refreshChallenges ?? createRefreshChallengeStore(),
      ...(deps.refreshTokenTtlMs === undefined
        ? {}
        : { refreshTokenTtlMs: deps.refreshTokenTtlMs }),
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
    mobileFinance: makeMobileFinanceHandlers(deps),
    mobilePurchases: makeMobilePurchasesHandlers(deps),
  });
}
