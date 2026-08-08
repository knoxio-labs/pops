/**
 * The guard as `app.ts` actually mounts it, rather than as a unit.
 *
 * `require-device.test.ts` proves the middleware decides correctly. What is
 * asserted here is the wiring around it: that the prefix covers routes nobody
 * has written yet, and that it stops exactly where the unauthenticated
 * surface begins. The two failure modes are opposite and both silent — a
 * `/mobile` route that turns out to be public, and a `/health` that turns out
 * to need a token, breaking every liveness probe in the fleet.
 *
 * The rate limiter (POPS-1468) is wired in the same place, and its wiring has
 * one property no unit test can see: that it runs *ahead* of the guard, so a
 * caller over its budget never reaches the signature check it was there to
 * make expensive.
 */
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices } from '../../db/index.js';
import { MOBILE_PATH_PREFIX } from '../app.js';
import { mintAccessToken } from '../auth/access-token.js';
import { createTestApp, type TestApp } from './harness.js';

import type { MobileRateLimitOptions } from '../auth/mobile-rate-limit.js';

const apps: TestApp[] = [];

function open(mobileRateLimit?: MobileRateLimitOptions): TestApp {
  const created = createTestApp(mobileRateLimit === undefined ? {} : { mobileRateLimit });
  apps.push(created);
  return created;
}

afterEach(() => {
  while (apps.length > 0) {
    apps.pop()?.cleanup();
  }
});

describe('the unauthenticated surface', () => {
  it.each(['/health', '/openapi'])('serves %s without a token', async (path) => {
    const { app } = open();

    const res = await request(app).get(path);

    expect(res.status).toBe(200);
  });

  it('still serves /health when a caller sends a token that would fail the guard', async () => {
    const { app } = open();

    const res = await request(app).get('/health').set('Authorization', 'Bearer garbage');

    expect(res.status).toBe(200);
  });
});

describe('the /mobile perimeter', () => {
  it('gates a path no route has been written for yet', async () => {
    // The whole point of a prefix mount: POPS-1378 and POPS-1379 cannot land
    // an ungated mobile route, because the gate is already in front of the
    // path they will claim.
    const { app } = open();

    const res = await request(app).get('/mobile/transactions');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('invalid_token');
  });

  it.each(['get', 'post', 'put', 'patch', 'delete'] as const)(
    'gates %s as well as GET',
    async (method) => {
      const { app } = open();

      const res = await request(app)[method]('/mobile/anything');

      expect(res.status).toBe(401);
    }
  );

  it('gates the prefix itself', async () => {
    const { app } = open();

    const res = await request(app).get(MOBILE_PATH_PREFIX);

    expect(res.status).toBe(401);
  });

  it('refuses before parsing a body, so an anonymous caller cannot make bfm work', async () => {
    // A malformed JSON body would produce a 400 from `express.json()` if the
    // parser ran first. A 401 is the proof that it does not — which is what
    // keeps an unauthenticated request from costing anything but a header
    // read, given nothing yet limits how often one may arrive (POPS-1468).
    const { app } = open();

    const res = await request(app)
      .post('/mobile/transactions')
      .set('Content-Type', 'application/json')
      .send('{"unterminated":');

    expect(res.status).toBe(401);
  });

  it('does not gate a sibling path that merely starts with the same characters', async () => {
    // `app.use` matches whole segments, so `/mobiles` is outside the perimeter
    // and 404s. Asserted because a guard that silently widened to every path
    // beginning `/mobile` would take `/health` with it the day someone
    // reordered the mount.
    const { app } = open();

    const res = await request(app).get('/mobiles');

    expect(res.status).toBe(404);
  });

  it('answers 401 rather than 404 for an unrouted path, leaking no route map', async () => {
    const { app, db, accessTokenSigningKey } = open();
    const row = deviceRow();
    db.insert(devices).values(row).run();
    const { token } = mintAccessToken(row.id, accessTokenSigningKey);

    // Past the guard, and now genuinely absent — so an authenticated caller
    // sees the real shape of the surface and an unauthenticated one does not.
    const res = await request(app)
      .get('/mobile/transactions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe('the request budget in front of the guard', () => {
  it('answers 429 once an anonymous caller exceeds its budget', async () => {
    const { app } = open({ perClientLimit: 2, globalLimit: 100 });

    const first = await request(app).get('/mobile/transactions');
    const second = await request(app).get('/mobile/transactions');
    const third = await request(app).get('/mobile/transactions');

    expect([first.status, second.status]).toEqual([401, 401]);
    expect(third.status).toBe(429);
    expect(third.headers['retry-after']).toBeDefined();
  });

  it('refuses over-budget requests before verifying a signature, not after', async () => {
    // The ordering assertion, and the only observable proof of it: a caller
    // sending a token that the guard would reject gets 429 rather than 401
    // once its budget is spent. A limiter mounted behind the guard would
    // answer 401 here, having paid for the HMAC first — which is precisely
    // the unbounded work this exists to bound.
    const { app } = open({ perClientLimit: 1, globalLimit: 100 });
    await request(app).get('/mobile/transactions').set('Authorization', 'Bearer garbage');

    const res = await request(app)
      .get('/mobile/transactions')
      .set('Authorization', 'Bearer garbage');

    expect(res.status).toBe(429);
  });

  it('charges a valid device too, so a compromised handset cannot flood the federation', async () => {
    // Being past the guard is not an exemption. The tiers sit ahead of it and
    // cannot know whether a request was going to succeed, and a paired phone
    // is exactly what an attacker with a stolen handset would be holding.
    const { app, db, accessTokenSigningKey } = open({ perClientLimit: 1, globalLimit: 100 });
    const row = deviceRow();
    db.insert(devices).values(row).run();
    const { token } = mintAccessToken(row.id, accessTokenSigningKey);
    const authorized = (): request.Test =>
      request(app).get('/mobile/transactions').set('Authorization', `Bearer ${token}`);

    const first = await authorized();
    const second = await authorized();

    expect(first.status).toBe(404);
    expect(second.status).toBe(429);
  });

  it('leaves /health and /openapi answering after the mobile budget is spent', async () => {
    // A liveness probe that a stranger's traffic can rate-limit out of
    // existence reports this pillar down for someone else's reason, and the
    // fleet would take it out of rotation over it.
    const { app } = open({ perClientLimit: 1, globalLimit: 1 });
    const exhausted = await request(app).get('/mobile/transactions');
    expect(exhausted.status).toBe(401);
    expect((await request(app).get('/mobile/transactions')).status).toBe(429);

    expect((await request(app).get('/health')).status).toBe(200);
    expect((await request(app).get('/openapi')).status).toBe(200);
  });

  it('does not budget a sibling path outside the prefix', async () => {
    const { app } = open({ perClientLimit: 1, globalLimit: 1 });
    await request(app).get('/mobile/transactions');

    const res = await request(app).get('/mobiles');

    expect(res.status).toBe(404);
  });

  it('applies the shipped limits when a deployment configures nothing', async () => {
    // The default path is the one production runs. A handful of requests must
    // sail through it, or the shipped numbers are wrong in the direction that
    // breaks real phones.
    const { app } = open();

    const statuses: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      statuses.push((await request(app).get('/mobile/transactions')).status);
    }

    expect(statuses.every((status) => status === 401)).toBe(true);
  });
});
