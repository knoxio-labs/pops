import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { HealthResponseSchema } from '../../contract/rest-schemas.js';
import { createTestApp, type TestApp } from './harness.js';

const apps: TestApp[] = [];

function open(version?: string): TestApp {
  const created = createTestApp(version);
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
    const { app } = open('9.9.9-fixture');

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
});
