import { afterEach, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp, type TestAppOptions } from './harness.js';
import { requestOn } from './test-http.js';

const apps: TestApp[] = [];

function open(options: TestAppOptions = {}): TestApp {
  const created = createTestApp(options);
  apps.push(created);
  return created;
}

afterEach(() => {
  while (apps.length > 0) apps.pop()?.cleanup();
});

describe('GET /health', () => {
  it('answers without any identity, so the container probe can reach it', async () => {
    const { app } = open();

    const res = await requestOn(app, (r) => r.get('/health'));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, status: 'ok', pillar: 'design' });
  });

  /**
   * The probe carries no Access session. A health route mounted behind the
   * identity middleware would report a correctly-running pillar as unhealthy,
   * and watchtower would roll it forever.
   */
  it('answers even in production with Access configured and no session', async () => {
    const { app } = open({
      env: { NODE_ENV: 'production', CLOUDFLARE_ACCESS_TEAM_NAME: 'pops-test-team' },
    });

    const res = await requestOn(app, (r) => r.get('/health'));

    expect(res.status).toBe(200);
  });

  it('reports the build version it was constructed with', async () => {
    const { app } = open({ version: '9.9.9-fixture' });

    const res = await requestOn(app, (r) => r.get('/health'));

    expect(res.body.version).toBe('9.9.9-fixture');
  });

  it('stamps a round-trippable ISO-8601 timestamp', async () => {
    const { app } = open();

    const res = await requestOn(app, (r) => r.get('/health'));

    expect(new Date(String(res.body.ts)).toISOString()).toBe(res.body.ts);
  });
});

describe('routing', () => {
  it('404s an unknown path', async () => {
    const { app } = open();

    const res = await requestOn(app, (r) => r.get('/widgets'));

    expect(res.status).toBe(404);
  });

  it('404s an unsupported method on a known path', async () => {
    const { app } = open();

    const res = await requestOn(app, (r) => r.delete('/threads/some-id'));

    expect(res.status).toBe(404);
  });

  /**
   * The shell's nginx strips `/design-api/` before the request arrives, so
   * the routes must answer at the root — a second `/api` prefix here would
   * make the public path `/design-api/api/threads`.
   */
  it('serves the thread routes at the root, where the nginx rewrite lands', async () => {
    const { app } = open();

    const res = await requestOn(app, (r) => r.get('/threads'));

    expect(res.status).toBe(200);
  });
});

describe('GET /api/me', () => {
  it('echoes the dev identity outside production', async () => {
    const { app } = open();

    const res = await requestOn(app, (r) => r.get('/me'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: 'dev@example.com', service: null });
  });
});
