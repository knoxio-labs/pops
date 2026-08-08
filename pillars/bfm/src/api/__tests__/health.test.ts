import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { HealthResponseSchema } from '../../contract/rest-schemas.js';
import { createTestApp, type TestApp, type TestAppOptions } from './harness.js';

const apps: TestApp[] = [];

function open(options: TestAppOptions = {}): TestApp {
  const created = createTestApp(options);
  apps.push(created);
  return created;
}

afterEach(() => {
  while (apps.length > 0) {
    apps.pop()?.cleanup();
  }
});

describe('GET /health', () => {
  it('returns a body that satisfies the contract schema', async () => {
    const { app } = open();

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    const parsed = HealthResponseSchema.safeParse(res.body);
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.success).toBe(true);
  });

  it('reports the build version it was constructed with', async () => {
    const { app } = open({ version: '9.9.9-fixture' });

    const res = await request(app).get('/health');

    expect(res.body).toMatchObject({
      ok: true,
      status: 'ok',
      pillar: 'bfm',
      version: '9.9.9-fixture',
    });
  });

  it('answers without a database round-trip, so a wedged DB still reads as live', async () => {
    // The contract summary promises this. Closing the handle first is the only
    // way to assert it: a `/health` that had grown a query would throw here.
    const { app, cleanup } = createTestApp();
    cleanup();

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
  });

  it('stamps a round-trippable ISO-8601 UTC timestamp', async () => {
    const { app } = open();

    const res = await request(app).get('/health');

    const ts = res.body.ts as string;
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  it('does not serve a route the contract never declared', async () => {
    const { app } = open();

    const res = await request(app).get('/pillars');

    expect(res.status).toBe(404);
  });

  /**
   * Liveness must not depend on a principal. The operator gate lives in the
   * handlers, and a probe answering 401 would read as the pillar being down —
   * which is precisely backwards, since the probe is what tells the fleet the
   * pillar is up.
   */
  it('answers an anonymous probe, unlike the operator routes', async () => {
    const { app } = open({ env: { NODE_ENV: 'production' } });

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
  });
});
