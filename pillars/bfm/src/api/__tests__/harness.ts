/**
 * Standing up the real `createBfmApiApp` for a test.
 *
 * Nothing here is a mock. The app requires a database handle and a signing key
 * because the `/mobile` perimeter cannot be optional — which means every test
 * that only wants `/health` needs both too. This exists so that cost is one
 * line rather than six, and so a test never reaches for a stub where a real
 * SQLite file would do: the pillar's subject matter is what is written to and
 * read from that database, and a stubbed handle would let assertions pass
 * against code that persists nothing.
 */
import { createSecretKey, type KeyObject } from 'node:crypto';

import { openTempDb } from '../../db/__tests__/helpers.js';
import { createBfmApiApp, type CreateBfmApiAppOptions } from '../app.js';
import { createMobileFinanceClient } from '../finance/client.js';
import { createPillarGateway } from '../pillars/gateway.js';
import { createRateLimiter, type RateLimiter } from '../rate-limit.js';

import type { Express } from 'express';

import type { BfmDb, OpenedBfmDb } from '../../db/index.js';
import type { BfmApiDeps } from '../app.js';
import type { MobileRateLimitOptions } from '../auth/mobile-rate-limit.js';
import type { PairingRateLimitOptions } from '../auth/pairing-rate-limit.js';
import type { RefreshChallengeStore } from '../auth/refresh-challenge.js';
import type { RefreshRateLimitOptions } from '../auth/refresh-rate-limit.js';
import type { MobileFinanceClient } from '../finance/client.js';
import type { PillarHandleFactory } from '../pillars/gateway.js';

/** Long enough to satisfy the resolver's floor; fixed so a failure is reproducible. */
export const TEST_SIGNING_SECRET = 'test-signing-key-0123456789abcdef';

export function testSigningKey(secret: string = TEST_SIGNING_SECRET): KeyObject {
  return createSecretKey(Buffer.from(secret, 'utf8'));
}

export const TEST_PUBLIC_BASE_URL = 'https://bfm.example.test';

/**
 * `NODE_ENV=production` plus a configured Access team: the only combination in
 * which the operator identity middleware demands a real Cloudflare Access
 * session.
 *
 * Every "an anonymous caller is refused" assertion needs this. Under the
 * suite's own `NODE_ENV=test`, the dev fallback resolves every request to an
 * operator, so those cases would silently assert nothing.
 */
export const PRODUCTION_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  CLOUDFLARE_ACCESS_TEAM_NAME: 'pops-test-team',
};

/**
 * Production with Access NOT configured. bfm treats this as anonymous rather
 * than as the registry's "trust the tunnel" — see the identity middleware
 * header for why that divergence exists.
 */
export const PRODUCTION_ENV_WITHOUT_ACCESS: NodeJS.ProcessEnv = { NODE_ENV: 'production' };

export interface TestApp {
  app: Express;
  db: BfmDb;
  /** The full opener result, for suites that assert on stored rows. */
  opened: OpenedBfmDb;
  accessTokenSigningKey: KeyObject;
  cleanup: () => void;
}

export interface TestAppOptions {
  version?: string;
  /** Drives the operator identity middleware. See {@link PRODUCTION_ENV}. */
  env?: NodeJS.ProcessEnv;
  issuanceLimiter?: RateLimiter;
  pairingCodeTtlMs?: number;
  refreshTokenTtlMs?: number;
  publicBaseUrl?: string;
  accessTokenSigningKey?: KeyObject;
  /**
   * Overrides for the `/mobile` perimeter budget. Left absent, the app applies
   * the shipped numbers — which is what every suite that is not about rate
   * limiting should exercise, since one running against a quietly relaxed
   * perimeter would stop noticing if the real one broke.
   */
  mobileRateLimit?: MobileRateLimitOptions;
  /**
   * Seams for the bootstrap route. Left unset, the route wires its production
   * defaults — which means a real registry read and a real probe, so any test
   * that calls `/mobile/bootstrap` has to supply at least the probe.
   */
  bootstrap?: BfmApiDeps['bootstrap'];
  internalBaseUrls?: BfmApiDeps['internalBaseUrls'];
  /**
   * Where the `/mobile/finance/*` routes get their data. Defaults to a client
   * over a gateway whose handle factory throws — a test that reaches finance
   * without saying how fails loudly instead of hanging on a real network call.
   */
  finance?: MobileFinanceClient;
  /** Same, for the pairing exchange's budget. */
  pairingRateLimit?: PairingRateLimitOptions;
  /** Same, for the budget the challenge and refresh routes share. */
  refreshRateLimit?: RefreshRateLimitOptions;
  /**
   * The nonce store both refresh routes use. Left absent, the app builds one
   * with the shipped TTL — which is what a suite that is not about challenges
   * should exercise. A refresh suite injects its own so it can pin the clock
   * and read back the nonce it is about to sign over.
   */
  refreshChallenges?: RefreshChallengeStore;
}

const unreachableHandleFactory: PillarHandleFactory = (pillarId: string) => {
  throw new Error(
    `[bfm-test] this test called ${pillarId} without supplying a fake — pass \`finance\` to createTestApp`
  );
};

/**
 * The options this harness forwards untouched, minus the ones nobody set.
 *
 * `exactOptionalPropertyTypes` makes "absent" and "present and `undefined`"
 * different types, so each of these needs its own conditional spread rather
 * than a plain assignment. Six of them inline in `createTestApp` is six
 * branches in a function whose actual job is three lines, which the complexity
 * rule flags — correctly. They live here so that function reads as what it
 * does: open a database, fill in the defaults, build the app.
 */
function passthroughDeps(options: TestAppOptions): Partial<BfmApiDeps> {
  return {
    ...(options.pairingCodeTtlMs === undefined
      ? {}
      : { pairingCodeTtlMs: options.pairingCodeTtlMs }),
    ...(options.refreshTokenTtlMs === undefined
      ? {}
      : { refreshTokenTtlMs: options.refreshTokenTtlMs }),
    ...(options.mobileRateLimit === undefined ? {} : { mobileRateLimit: options.mobileRateLimit }),
    ...(options.pairingRateLimit === undefined
      ? {}
      : { pairingRateLimit: options.pairingRateLimit }),
    ...(options.refreshRateLimit === undefined
      ? {}
      : { refreshRateLimit: options.refreshRateLimit }),
    ...(options.refreshChallenges === undefined
      ? {}
      : { refreshChallenges: options.refreshChallenges }),
    ...(options.internalBaseUrls === undefined
      ? {}
      : { internalBaseUrls: options.internalBaseUrls }),
    ...(options.bootstrap === undefined ? {} : { bootstrap: options.bootstrap }),
  };
}

export function createTestApp(options: TestAppOptions = {}): TestApp {
  const { opened, cleanup } = openTempDb();
  const accessTokenSigningKey = options.accessTokenSigningKey ?? testSigningKey();

  const deps: BfmApiDeps = {
    version: options.version ?? '0.0.1-test',
    finance:
      options.finance ?? createMobileFinanceClient(createPillarGateway(unreachableHandleFactory)),
    db: opened.db,
    accessTokenSigningKey,
    publicBaseUrl: options.publicBaseUrl ?? TEST_PUBLIC_BASE_URL,
    issuanceLimiter:
      options.issuanceLimiter ??
      // Generous by default so a suite that is not about rate limiting never
      // trips it; the limiting suite injects its own.
      createRateLimiter({ limit: 1_000, windowMs: 60_000 }),
    ...passthroughDeps(options),
  };

  const appOptions: CreateBfmApiAppOptions = options.env === undefined ? {} : { env: options.env };

  return {
    app: createBfmApiApp(deps, appOptions),
    db: opened.db,
    opened,
    accessTokenSigningKey,
    cleanup,
  };
}
