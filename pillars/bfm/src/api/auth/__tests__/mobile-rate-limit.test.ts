/**
 * The perimeter's two tiers, and the key they are charged against.
 *
 * `rate-limit.test.ts` proves the budget arithmetic. What is proved here is
 * the part specific to an internet-facing prefix: that the coarse tier is a
 * ceiling nothing a caller sends can move, that the fine tier stops one
 * hostile source from spending the household's budget, and — the one that
 * would quietly undo both — that a caller cannot mint itself a fresh key by
 * choosing what it puts in `CF-Connecting-IP`.
 *
 * The middleware is driven through a bare Express app rather than the real
 * one, so a failure here points at the limiter rather than at the guard
 * standing behind it. `mobile-perimeter.test.ts` covers the composition.
 */
import express, { type Express } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { MobileRateLimitErrorSchema } from '../../../contract/rest-schemas.js';
import {
  createMobileRateLimit,
  MOBILE_GLOBAL_LIMIT,
  MOBILE_PER_CLIENT_LIMIT,
  type MobileRateLimit,
  type MobileRateLimitOptions,
} from '../mobile-rate-limit.js';

/** A prefix-mounted limiter in front of one always-200 route. */
function mount(options: MobileRateLimitOptions): { app: Express; limiter: MobileRateLimit } {
  const limiter = createMobileRateLimit(options);
  const app = express();
  app.use('/mobile', limiter.handler);
  app.all('/mobile/{*rest}', (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return { app, limiter };
}

function appWith(options: MobileRateLimitOptions): Express {
  return mount(options).app;
}

async function statusesFrom(app: Express, count: number, clientIp?: string): Promise<number[]> {
  const statuses: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const pending = request(app).get('/mobile/anything');
    const res = await (clientIp === undefined
      ? pending
      : pending.set('CF-Connecting-IP', clientIp));
    statuses.push(res.status);
  }
  return statuses;
}

describe('the per-client tier', () => {
  it('admits up to the limit then answers 429', async () => {
    const app = appWith({ perClientLimit: 2, globalLimit: 100 });

    const statuses = await statusesFrom(app, 3, '203.0.113.7');

    expect(statuses).toEqual([200, 200, 429]);
  });

  it('does not charge one client’s requests to another', async () => {
    // The property that keeps a brute-force from becoming a denial of service
    // against the real phones.
    const app = appWith({ perClientLimit: 1, globalLimit: 100 });
    await statusesFrom(app, 2, '203.0.113.7');

    const other = await statusesFrom(app, 1, '198.51.100.4');

    expect(other).toEqual([200]);
  });

  it('distinguishes IPv6 clients from each other', async () => {
    const app = appWith({ perClientLimit: 1, globalLimit: 100 });

    const first = await statusesFrom(app, 2, '2001:db8::1');
    const second = await statusesFrom(app, 1, '2001:db8::2');

    expect(first).toEqual([200, 429]);
    expect(second).toEqual([200]);
  });
});

describe('the client key a caller cannot forge its way out of', () => {
  it('collapses a non-IP CF-Connecting-IP onto the socket peer instead of trusting it', async () => {
    // The attack this closes: if any string were taken as the key, a fresh
    // one per request would make the per-client tier a no-op and its map a
    // place to put unbounded data. All of these must land in one bucket.
    const app = appWith({ perClientLimit: 2, globalLimit: 100 });

    const statuses: number[] = [];
    for (const forged of ['not-an-ip', 'a', 'b', 'c']) {
      const res = await request(app).get('/mobile/anything').set('CF-Connecting-IP', forged);
      statuses.push(res.status);
    }

    expect(statuses).toEqual([200, 200, 429, 429]);
  });

  it('rejects a comma-joined pair of headers rather than letting either one win', async () => {
    // Node joins repeated headers, so `CF-Connecting-IP` sent twice arrives as
    // one comma-separated value. Honouring the first half would be a way to
    // spend a chosen victim's budget; honouring the whole string as a key
    // would be a way to mint a fresh one. Neither: it must land in the
    // socket-peer bucket, which the header-less request below has already
    // spent.
    const app = appWith({ perClientLimit: 1, globalLimit: 100 });
    await request(app).get('/mobile/anything');

    const res = await request(app)
      .get('/mobile/anything')
      .set('CF-Connecting-IP', '203.0.113.7, 198.51.100.4');

    expect(res.status).toBe(429);
  });

  it('tolerates surrounding whitespace on an otherwise valid address', async () => {
    const app = appWith({ perClientLimit: 1, globalLimit: 100 });
    await request(app).get('/mobile/anything').set('CF-Connecting-IP', '203.0.113.7');

    const res = await request(app).get('/mobile/anything').set('CF-Connecting-IP', ' 203.0.113.7 ');

    expect(res.status).toBe(429);
  });

  it('falls back to a single shared bucket when no header is present', async () => {
    // Absent must not mean unlimited. Every header-less caller shares the
    // socket peer's bucket, which is the conservative direction.
    const app = appWith({ perClientLimit: 2, globalLimit: 100 });

    const statuses = await statusesFrom(app, 3);

    expect(statuses).toEqual([200, 200, 429]);
  });
});

describe('the global tier', () => {
  it('caps the prefix no matter how many distinct clients call', async () => {
    // The tier that makes a forged `CF-Connecting-IP` worth something bounded
    // rather than worth everything.
    const app = appWith({ perClientLimit: 100, globalLimit: 3 });

    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app)
        .get('/mobile/anything')
        .set('CF-Connecting-IP', `203.0.113.${i}`);
      statuses.push(res.status);
    }

    expect(statuses).toEqual([200, 200, 200, 429, 429]);
  });

  it('is charged before the per-client tier, so a refused request mints no key', async () => {
    // The ordering that bounds the per-client map by the global limit rather
    // than by hope. Both orders answer 429 to the caller, so the status is not
    // the observable — the key count is: reversed, an attacker rotating
    // addresses would create one entry per request while every one of those
    // requests was being refused, which is unbounded growth driven by input
    // the attacker chooses.
    const { app, limiter } = mount({ perClientLimit: 5, globalLimit: 1 });
    await request(app).get('/mobile/anything').set('CF-Connecting-IP', '203.0.113.1');

    for (let i = 0; i < 50; i += 1) {
      const res = await request(app)
        .get('/mobile/anything')
        .set('CF-Connecting-IP', `198.51.100.${i}`);
      expect(res.status).toBe(429);
    }

    expect(limiter.trackedClients()).toBe(1);
  });

  it('keeps tracked clients at or below the global ceiling, whatever arrives', async () => {
    // The same invariant stated as the bound it buys: distinct keys minted in
    // one window can never exceed what the global tier admits in that window.
    const globalLimit = 5;
    const { app, limiter } = mount({ perClientLimit: 1, globalLimit });

    for (let i = 0; i < 100; i += 1) {
      await request(app)
        .get('/mobile/anything')
        .set('CF-Connecting-IP', `203.0.113.${i % 200}`);
    }

    expect(limiter.trackedClients()).toBeLessThanOrEqual(globalLimit);
  });
});

describe('the 429 a refused caller receives', () => {
  it('carries the contract body, with a positive retry interval', async () => {
    const app = appWith({ perClientLimit: 1, globalLimit: 100, windowMs: 60_000 });
    await statusesFrom(app, 1, '203.0.113.7');

    const res = await request(app).get('/mobile/anything').set('CF-Connecting-IP', '203.0.113.7');

    const parsed = MobileRateLimitErrorSchema.safeParse(res.body);
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.success).toBe(true);
    expect(res.body.code).toBe('rate_limited');
  });

  it('sets Retry-After to the same interval the body reports', async () => {
    // Two copies of one fact; a client that reads either must not be told
    // different things.
    const app = appWith({ perClientLimit: 1, globalLimit: 100, windowMs: 60_000 });
    await statusesFrom(app, 1, '203.0.113.7');

    const res = await request(app).get('/mobile/anything').set('CF-Connecting-IP', '203.0.113.7');

    expect(res.headers['retry-after']).toBe('60');
    expect(res.body.retryAfterSeconds).toBe(60);
  });

  it('carries nothing about the token, the route or the limit’s size', async () => {
    // A refusal is reachable by anyone who can reach the hostname, so its body
    // is an unauthenticated read of this pillar's internals unless it says
    // nothing. `retryAfterSeconds` is the window length, which is not the
    // budget and does not narrow it.
    const app = appWith({ perClientLimit: 1, globalLimit: 100 });
    await request(app)
      .get('/mobile/secret-route')
      .set('CF-Connecting-IP', '203.0.113.7')
      .set('Authorization', 'Bearer sensitive-token-value');

    const res = await request(app)
      .get('/mobile/secret-route')
      .set('CF-Connecting-IP', '203.0.113.7')
      .set('Authorization', 'Bearer sensitive-token-value');

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('sensitive-token-value');
    expect(serialized).not.toContain('secret-route');
    expect(Object.keys(res.body).toSorted()).toEqual(['code', 'message', 'retryAfterSeconds']);
  });

  it('refuses every method, not only GET', async () => {
    const app = appWith({ perClientLimit: 1, globalLimit: 100 });
    await request(app).post('/mobile/anything').set('CF-Connecting-IP', '203.0.113.7');

    const res = await request(app).post('/mobile/anything').set('CF-Connecting-IP', '203.0.113.7');

    expect(res.status).toBe(429);
  });
});

describe('the shipped numbers', () => {
  it('leaves the per-client budget an order of magnitude above a busy handset', () => {
    // Not an arithmetic check — a statement that the value is the one the
    // module's reasoning describes, so changing it is a deliberate act with a
    // failing test attached rather than a quiet edit.
    expect(MOBILE_PER_CLIENT_LIMIT).toBe(60);
  });

  it('keeps the global ceiling well above one client’s budget', () => {
    // A ceiling at or near the per-client limit would mean a single phone
    // could lock out the rest of the house.
    expect(MOBILE_GLOBAL_LIMIT).toBeGreaterThanOrEqual(MOBILE_PER_CLIENT_LIMIT * 5);
  });
});
