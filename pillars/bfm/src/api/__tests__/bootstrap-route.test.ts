/**
 * `GET /mobile/bootstrap` as a phone actually reaches it: the real Express
 * app, the real perimeter, a real migrated database, and the real SDK
 * discovery cache driven by a fake registry fetcher.
 *
 * The discovery cache is deliberately NOT stubbed out at the deps boundary
 * here — `bootstrap.test.ts` already covers the branches that way. What this
 * file proves is the wiring `bootstrap.test.ts` cannot: that the production
 * default really does read the registry through `@pops/pillar-sdk/discovery`,
 * that the TTL'd cache means a second launch costs no second fetch, and that
 * the response the phone parses matches the contract the OpenAPI document
 * promised it.
 *
 * Only the per-pillar probe is injected, because it is the one leg that would
 * otherwise open a socket to a hostname that does not exist in a test process.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  configureDiscoveryForTest,
  failNextRegistryFetches,
} from '@pops/pillar-sdk/testing/discovery';

import { MobileBootstrapResponseSchema } from '../../contract/rest-schemas.js';
import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices } from '../../db/index.js';
import { mintAccessToken } from '../auth/access-token.js';
import { contractResponse, fakeFetch, pillarSnapshot } from '../mobile/__tests__/fixtures.js';
import { createTestApp, type TestApp, type TestAppOptions } from './harness.js';
import { requestOn } from './test-http.js';

import type { PillarSnapshot } from '@pops/pillar-sdk/discovery';

import type { ReachabilityProbeDeps } from '../mobile/reachability.js';

const apps: TestApp[] = [];

function probeAnswering(answers: Record<string, () => Response>): {
  probe: ReachabilityProbeDeps;
  requested: string[];
} {
  const { fetchImpl, requested } = fakeFetch(answers);
  return { probe: { fetchImpl, timeoutMs: 50, baseUrlOverrides: {} }, requested };
}

function healthyProbe(...ids: string[]): ReachabilityProbeDeps {
  return probeAnswering(
    Object.fromEntries(ids.map((id) => [`http://${id}-api:3000/openapi`, contractResponse]))
  ).probe;
}

/** Point the SDK's discovery cache at a fetcher instead of the network. */
function registryServing(...pillars: PillarSnapshot[]): { fetches: number } {
  const counter = { fetches: 0 };
  configureDiscoveryForTest({
    registryUrl: 'http://registry-under-test',
    fetcher: () => {
      counter.fetches += 1;
      return Promise.resolve({ pillars, fetchedAt: new Date() });
    },
  });
  return counter;
}

/**
 * The instant the route writes, pinned.
 *
 * The row's own `last_seen_at` default comes from SQLite's `'now'`, which can
 * land in the same millisecond as a `new Date()` taken microseconds later — so
 * asserting that the column "advanced" against a production clock is a test
 * that passes on a slow machine and fails on a fast one. A fixed instant well
 * ahead of the insert makes the comparison mean what it says.
 */
const CHECKED_IN_AT = '2027-01-01T00:00:00.000Z';

function open(options: TestAppOptions): TestApp {
  const created = createTestApp({
    ...options,
    bootstrap: { now: () => new Date(CHECKED_IN_AT), ...options.bootstrap },
  });
  apps.push(created);
  return created;
}

function storedLastSeenAt(app: TestApp): string | undefined {
  return app.db.select().from(devices).all()[0]?.lastSeenAt;
}

/** A paired, trusted handset and a token it can present. */
function pairedDevice(
  app: TestApp,
  overrides: Parameters<typeof deviceRow>[0] = {}
): {
  id: string;
  authorization: string;
} {
  const row = deviceRow(overrides);
  app.db.insert(devices).values(row).run();
  const { token } = mintAccessToken(row.id, app.accessTokenSigningKey);
  return { id: row.id, authorization: `Bearer ${token}` };
}

/** `GET /mobile/bootstrap`, authenticated as `device`. */
function bootstrapAs(app: TestApp, device: { authorization: string }) {
  return requestOn(app.app, (r) =>
    r.get('/mobile/bootstrap').set('Authorization', device.authorization)
  );
}

beforeEach(() => {
  registryServing(pillarSnapshot('finance'));
});

afterEach(() => {
  vi.restoreAllMocks();
  while (apps.length > 0) apps.pop()?.cleanup();
});

describe('the perimeter in front of the route', () => {
  it('refuses an unauthenticated caller with a 401 and no payload', async () => {
    const app = open({ bootstrap: { probe: healthyProbe('finance') } });

    const res = await requestOn(app.app, (r) => r.get('/mobile/bootstrap'));

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('invalid_token');
    expect(res.body.pillars).toBeUndefined();
  });

  it('refuses a token this deployment did not sign', async () => {
    const app = open({ bootstrap: { probe: healthyProbe('finance') } });

    const res = await requestOn(app.app, (r) =>
      r.get('/mobile/bootstrap').set('Authorization', 'Bearer not-a-token')
    );

    expect(res.status).toBe(401);
  });

  it('refuses a revoked device with a 403 — refreshing cannot help it', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const app = open({ bootstrap: { probe: healthyProbe('finance') } });
    const device = pairedDevice(app, { revokedAt: '2026-08-01T00:00:00.000Z' });

    const res = await bootstrapAs(app, device);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('device_revoked');
  });

  it('does not advance lastSeenAt for a device it just refused', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const app = open({ bootstrap: { probe: healthyProbe('finance') } });
    const device = pairedDevice(app, { revokedAt: '2026-08-01T00:00:00.000Z' });
    const before = storedLastSeenAt(app);

    await bootstrapAs(app, device);

    expect(storedLastSeenAt(app)).toBe(before);
    expect(storedLastSeenAt(app)).not.toBe(CHECKED_IN_AT);
  });
});

describe('a paired device asking what to render', () => {
  it('answers the shape the contract promises', async () => {
    const app = open({ bootstrap: { probe: healthyProbe('finance') } });
    const device = pairedDevice(app);

    const res = await bootstrapAs(app, device);

    expect(res.status).toBe(200);
    // Parsed rather than eyeballed: the Swift client is generated from this
    // document, so a field that drifts from the schema breaks the app's build
    // and nothing here would notice on a hand-written assertion.
    expect(() => MobileBootstrapResponseSchema.parse(res.body)).not.toThrow();
  });

  it('reads its roster through the SDK discovery cache', async () => {
    const app = open({ bootstrap: { probe: healthyProbe('finance', 'media') } });
    const device = pairedDevice(app);
    registryServing(pillarSnapshot('finance'), pillarSnapshot('media'));

    const res = await bootstrapAs(app, device);

    expect(res.body.registry.source).toBe('fresh');
    expect(res.body.pillars).toEqual([
      { id: 'finance', reachability: 'healthy' },
      { id: 'media', reachability: 'healthy' },
    ]);
  });

  it('does not re-fetch the registry on the next launch inside the TTL window', async () => {
    const app = open({ bootstrap: { probe: healthyProbe('finance') } });
    const device = pairedDevice(app);
    const registry = registryServing(pillarSnapshot('finance'));

    await bootstrapAs(app, device);
    const second = await bootstrapAs(app, device);

    expect(registry.fetches).toBe(1);
    expect(second.body.registry.source).toBe('cached');
  });

  it('advances lastSeenAt, and says so in the payload', async () => {
    const app = open({ bootstrap: { probe: healthyProbe('finance') } });
    const device = pairedDevice(app);
    const before = storedLastSeenAt(app);

    const res = await bootstrapAs(app, device);

    expect(storedLastSeenAt(app)).toBe(CHECKED_IN_AT);
    expect(res.body.device.lastSeenAt).toBe(CHECKED_IN_AT);
    expect(CHECKED_IN_AT > String(before)).toBe(true);
  });

  it('never returns the device key or model — the phone knows those already', async () => {
    const app = open({ bootstrap: { probe: healthyProbe('finance') } });
    const device = pairedDevice(app);

    const res = await bootstrapAs(app, device);

    expect(Object.keys(res.body.device).toSorted()).toEqual(['id', 'lastSeenAt', 'name']);
  });
});

describe('the federation half-broken, seen from the phone', () => {
  it('keeps unavailable and contract-mismatch apart on the wire', async () => {
    const { probe } = probeAnswering({
      'http://finance-api:3000/openapi': contractResponse,
      'http://media-api:3000/openapi': () => new Response('Not Found', { status: 404 }),
      'http://food-api:3000/openapi': () => {
        throw new Error('ECONNREFUSED');
      },
    });
    const app = open({ bootstrap: { probe } });
    const device = pairedDevice(app);
    registryServing(pillarSnapshot('finance'), pillarSnapshot('media'), pillarSnapshot('food'));

    const res = await bootstrapAs(app, device);

    expect(res.status).toBe(200);
    expect(res.body.pillars).toEqual([
      { id: 'finance', reachability: 'healthy' },
      { id: 'food', reachability: 'unavailable' },
      { id: 'media', reachability: 'contract-mismatch' },
    ]);
  });

  it('boots the phone with an empty federation rather than failing, when the registry is gone', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const app = open({ bootstrap: { probe: healthyProbe('finance') } });
    const device = pairedDevice(app);
    registryServing(pillarSnapshot('finance'));
    failNextRegistryFetches(1, new Error('registry down'));

    const res = await bootstrapAs(app, device);

    // A 500 here is a phone that cannot get past its splash screen because a
    // sibling container blinked. That is strictly worse than an empty list.
    expect(res.status).toBe(200);
    expect(res.body.registry.source).toBe('unavailable');
    expect(res.body.pillars).toEqual([]);
    expect(res.body.features).toEqual([{ id: 'transactions', reachability: 'unavailable' }]);
  });

  it('still records the check-in when the registry is gone', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const app = open({ bootstrap: { probe: healthyProbe('finance') } });
    const device = pairedDevice(app);
    registryServing(pillarSnapshot('finance'));
    failNextRegistryFetches(1, new Error('registry down'));

    await bootstrapAs(app, device);

    expect(storedLastSeenAt(app)).toBe(CHECKED_IN_AT);
  });
});
