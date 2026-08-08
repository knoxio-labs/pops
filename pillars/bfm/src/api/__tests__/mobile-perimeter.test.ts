/**
 * The guard as `app.ts` actually mounts it, rather than as a unit.
 *
 * `require-device.test.ts` proves the middleware decides correctly. What is
 * asserted here is the wiring around it: that the prefix covers routes nobody
 * has written yet, and that it stops exactly where the unauthenticated
 * surface begins. The two failure modes are opposite and both silent — a
 * `/mobile` route that turns out to be public, and a `/health` that turns out
 * to need a token, breaking every liveness probe in the fleet.
 */
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices } from '../../db/index.js';
import { MOBILE_PATH_PREFIX } from '../app.js';
import { mintAccessToken } from '../auth/access-token.js';
import { createTestApp, type TestApp } from './harness.js';

const apps: TestApp[] = [];

function open(): TestApp {
  const created = createTestApp();
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
