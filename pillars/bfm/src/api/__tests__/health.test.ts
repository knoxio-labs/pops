import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { HealthResponseSchema } from '../../contract/rest-schemas.js';
import { createBfmApiApp } from '../app.js';

describe('GET /health', () => {
  it('returns a body that satisfies the contract schema', async () => {
    const app = createBfmApiApp({ version: '0.0.1-test' });

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    const parsed = HealthResponseSchema.safeParse(res.body);
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.success).toBe(true);
  });

  it('reports the build version it was constructed with', async () => {
    const app = createBfmApiApp({ version: '9.9.9-fixture' });

    const res = await request(app).get('/health');

    expect(res.body).toMatchObject({
      ok: true,
      status: 'ok',
      pillar: 'bfm',
      version: '9.9.9-fixture',
    });
  });

  it('stamps a round-trippable ISO-8601 UTC timestamp', async () => {
    const app = createBfmApiApp({ version: '0.0.1-test' });

    const res = await request(app).get('/health');

    const ts = res.body.ts as string;
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  it('does not serve a route the contract never declared', async () => {
    const app = createBfmApiApp({ version: '0.0.1-test' });

    const res = await request(app).get('/pillars');

    expect(res.status).toBe(404);
  });
});
