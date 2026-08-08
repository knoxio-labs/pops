/**
 * `POST /operator/pairing/codes` — the issuance surface.
 *
 * The load-bearing assertion in here is the one that reads the stored row: a
 * test that only checks the response body would pass against an
 * implementation that persists the plaintext next to the digest.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { IssuedPairingCodeSchema } from '../../contract/rest-operator-schemas.js';
import { hashPairingCode, normalizePairingCode, pairingCodes } from '../../db/index.js';
import { createRateLimiter } from '../rate-limit.js';
import {
  createTestApp,
  PRODUCTION_ENV,
  PRODUCTION_ENV_WITHOUT_ACCESS,
  TEST_PUBLIC_BASE_URL,
  type TestApp,
} from './harness.js';
import { requestOn } from './test-http.js';

let harness: TestApp;

afterEach(() => {
  harness.cleanup();
});

/** `POST /operator/pairing/codes` with an empty body — the shape every test here issues. */
function issueCode(app: TestApp) {
  return requestOn(app.app, (r) => r.post('/operator/pairing/codes').send({}));
}

describe('POST /operator/pairing/codes', () => {
  beforeEach(() => {
    harness = createTestApp();
  });

  it('mints a code that satisfies the contract schema', async () => {
    const res = await issueCode(harness);

    expect(res.status).toBe(201);
    const parsed = IssuedPairingCodeSchema.safeParse(res.body);
    expect(parsed.error?.issues ?? []).toEqual([]);
  });

  it('renders the code grouped, from the unambiguous alphabet only', async () => {
    const res = await issueCode(harness);

    expect(res.body.code).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  });

  it('never repeats a code across repeated issuance', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 25; i += 1) {
      const res = await issueCode(harness);
      codes.add(res.body.code as string);
    }

    expect(codes.size).toBe(25);
  });

  /**
   * The acceptance criterion that has to read the database rather than the
   * response. `bfm.db` must be inert: holding it should not yield a live code.
   */
  it('persists only the digest — the plaintext is absent from the stored row', async () => {
    const res = await issueCode(harness);
    const code = res.body.code as string;

    const rows = harness.opened.db.select().from(pairingCodes).all();

    expect(rows).toHaveLength(1);
    const serializedRow = JSON.stringify(rows[0]);
    expect(serializedRow).not.toContain(code);
    expect(serializedRow).not.toContain(code.replaceAll('-', ''));
    expect(rows[0]?.codeHash).toBe(hashPairingCode(normalizePairingCode(code) as string));
  });

  it('carries a pairing URL on the public origin, with the code as its query', async () => {
    const res = await issueCode(harness);

    const url = new URL(res.body.pairingUrl as string);
    expect(url.origin).toBe(TEST_PUBLIC_BASE_URL);
    expect(url.pathname).toBe('/devices/pair');
    expect(url.searchParams.get('code')).toBe(res.body.code);
  });

  it('expires in minutes rather than hours', async () => {
    const before = Date.now();
    const res = await issueCode(harness);

    const ttlMs = new Date(res.body.expiresAt as string).getTime() - before;
    expect(ttlMs).toBeGreaterThan(0);
    expect(ttlMs).toBeLessThanOrEqual(15 * 60 * 1000);
  });
});

describe('POST /operator/pairing/codes — authentication', () => {
  it('refuses an anonymous caller, and writes nothing', async () => {
    harness = createTestApp({ env: PRODUCTION_ENV });

    const res = await issueCode(harness);

    expect(res.status).toBe(401);
    expect(harness.opened.db.select().from(pairingCodes).all()).toHaveLength(0);
  });

  it('refuses a caller presenting a garbage Access assertion', async () => {
    harness = createTestApp({ env: PRODUCTION_ENV });

    const res = await requestOn(harness.app, (r) =>
      r.post('/operator/pairing/codes').set('cf-access-jwt-assertion', 'not-a-jwt').send({})
    );

    expect(res.status).toBe(401);
  });

  /**
   * The registry resolves "production, no Access team configured" to a trusted
   * tunnel user. bfm must not: its hostname bypasses Access, so that leg would
   * hand the public internet an operator session.
   */
  it('refuses everyone when Access is unconfigured in production, rather than trusting the tunnel', async () => {
    harness = createTestApp({ env: PRODUCTION_ENV_WITHOUT_ACCESS });

    const res = await issueCode(harness);

    expect(res.status).toBe(401);
  });

  it('does not disclose what would have been accepted', async () => {
    harness = createTestApp({ env: PRODUCTION_ENV });

    const res = await issueCode(harness);

    expect(JSON.stringify(res.body)).not.toMatch(/jwt|token|header|assertion/i);
  });
});

describe('POST /operator/pairing/codes — rate limiting', () => {
  it('refuses issuance past the budget with a 429', async () => {
    harness = createTestApp({
      issuanceLimiter: createRateLimiter({ limit: 3, windowMs: 60_000 }),
    });

    for (let i = 0; i < 3; i += 1) {
      expect((await issueCode(harness)).status).toBe(201);
    }
    const refused = await issueCode(harness);

    expect(refused.status).toBe(429);
  });

  it('tells the caller when to come back', async () => {
    harness = createTestApp({
      issuanceLimiter: createRateLimiter({ limit: 1, windowMs: 60_000 }),
    });

    await issueCode(harness);
    const refused = await issueCode(harness);

    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('mints nothing on the refused attempt', async () => {
    harness = createTestApp({
      issuanceLimiter: createRateLimiter({ limit: 1, windowMs: 60_000 }),
    });

    await issueCode(harness);
    await issueCode(harness);

    expect(harness.opened.db.select().from(pairingCodes).all()).toHaveLength(1);
  });

  it('lets issuance resume once the window rolls', async () => {
    let clock = 1_000_000;
    harness = createTestApp({
      issuanceLimiter: createRateLimiter({ limit: 1, windowMs: 60_000, now: () => clock }),
    });

    await issueCode(harness);
    expect((await issueCode(harness)).status).toBe(429);

    clock += 60_001;

    expect((await issueCode(harness)).status).toBe(201);
  });

  /**
   * The gate runs before the limiter. If it did not, an anonymous flood would
   * exhaust the real operator's budget and lock them out of pairing — a denial
   * of service handed to an unauthenticated caller.
   */
  it('does not let anonymous attempts consume an operator budget', async () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
    const anonymous = createTestApp({ env: PRODUCTION_ENV, issuanceLimiter: limiter });

    for (let i = 0; i < 10; i += 1) {
      await issueCode(anonymous);
    }
    anonymous.cleanup();

    harness = createTestApp({ issuanceLimiter: limiter });

    expect((await issueCode(harness)).status).toBe(201);
    expect((await issueCode(harness)).status).toBe(201);
  });
});
