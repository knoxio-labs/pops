import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTestApp, PRODUCTION_ENV, type TestApp, type TestAppOptions } from './harness.js';
import { requestOn } from './test-http.js';

vi.mock('@pops/pillar-sdk/access', () => ({
  verifyCloudflareAccessPrincipal: vi.fn(),
}));

const { verifyCloudflareAccessPrincipal } = await import('@pops/pillar-sdk/access');
const verify = vi.mocked(verifyCloudflareAccessPrincipal);

const apps: TestApp[] = [];

function open(options: TestAppOptions = {}): TestApp {
  const created = createTestApp(options);
  apps.push(created);
  return created;
}

afterEach(() => {
  while (apps.length > 0) apps.pop()?.cleanup();
  verify.mockReset();
});

const valid = {
  route: '/s/finance/import-review',
  anchorKind: 'selector',
  anchor: '{"selector":".row"}',
  body: 'the amount column is too tight',
};

async function create(app: TestApp['app'], overrides: Record<string, unknown> = {}) {
  return requestOn(app, (r) => r.post('/threads').send({ ...valid, ...overrides }));
}

describe('POST /api/threads — validation', () => {
  it.each(['route', 'anchorKind', 'anchor', 'body'])('400s when %s is missing', async (field) => {
    const { app } = open();

    const res = await create(app, { [field]: undefined });

    expect(res.status).toBe(400);
  });

  it('400s a whitespace-only body, which would render as an empty bubble', async () => {
    const { app } = open();

    const res = await create(app, { body: '   ' });

    expect(res.status).toBe(400);
  });

  it('400s a non-string field rather than coercing it', async () => {
    const { app } = open();

    const res = await create(app, { route: 42 });

    expect(res.status).toBe(400);
  });

  it('writes nothing when validation fails', async () => {
    const { app, opened } = open();

    await create(app, { body: '' });

    expect(opened.raw.prepare('SELECT COUNT(*) AS n FROM design_threads').get()).toEqual({ n: 0 });
  });
});

describe('POST /api/threads — success', () => {
  it('201s with an id and stores the thread open with its first message', async () => {
    const { app } = open();

    const res = await create(app);

    expect(res.status).toBe(201);
    const list = await requestOn(app, (r) => r.get('/threads'));
    expect(list.body.threads).toHaveLength(1);
    expect(list.body.threads[0]).toMatchObject({ id: res.body.id, status: 'open' });
    expect(list.body.threads[0].messages).toHaveLength(1);
  });

  it('defaults themeKey and viewport to empty when the client omits them', async () => {
    const { app } = open();

    await create(app);

    const list = await requestOn(app, (r) => r.get('/threads'));
    expect(list.body.threads[0]).toMatchObject({ themeKey: '', viewport: '' });
  });

  it('stores the theme and viewport the comment was left under', async () => {
    const { app } = open();

    await create(app, { themeKey: 'dark app-finance', viewport: '390x844' });

    const list = await requestOn(app, (r) => r.get('/threads'));
    expect(list.body.threads[0]).toMatchObject({
      themeKey: 'dark app-finance',
      viewport: '390x844',
    });
  });
});

describe('author resolution', () => {
  it('attributes a human session to its Access email, ignoring a claimed author', async () => {
    verify.mockResolvedValue({ kind: 'user', email: 'operator@pops.local' });
    const { app } = open({ env: PRODUCTION_ENV });

    await requestOn(app, (r) =>
      r
        .post('/threads')
        .set('cf-access-jwt-assertion', 'token')
        .send({ ...valid, author: 'Imposter' })
    );

    const list = await requestOn(app, (r) =>
      r.get('/threads').set('cf-access-jwt-assertion', 'token')
    );
    expect(list.body.threads[0].messages[0].author).toBe('operator@pops.local');
  });

  it('honours a self-declared author for a service token', async () => {
    verify.mockResolvedValue({ kind: 'service', commonName: 'abc123.access' });
    const { app } = open({ env: PRODUCTION_ENV });

    await requestOn(app, (r) =>
      r
        .post('/threads')
        .set('cf-access-jwt-assertion', 'token')
        .send({ ...valid, author: 'Claude' })
    );

    const list = await requestOn(app, (r) =>
      r.get('/threads').set('cf-access-jwt-assertion', 'token')
    );
    expect(list.body.threads[0].messages[0].author).toBe('Claude');
  });

  it('slices an over-long service author to 60 characters', async () => {
    verify.mockResolvedValue({ kind: 'service', commonName: 'abc123.access' });
    const { app } = open({ env: PRODUCTION_ENV });

    await requestOn(app, (r) =>
      r
        .post('/threads')
        .set('cf-access-jwt-assertion', 'token')
        .send({ ...valid, author: 'x'.repeat(80) })
    );

    const list = await requestOn(app, (r) =>
      r.get('/threads').set('cf-access-jwt-assertion', 'token')
    );
    expect(list.body.threads[0].messages[0].author).toBe('x'.repeat(60));
  });

  it('falls back to the token common name when a service names nothing', async () => {
    verify.mockResolvedValue({ kind: 'service', commonName: 'abc123.access' });
    const { app } = open({ env: PRODUCTION_ENV });

    await requestOn(app, (r) =>
      r.post('/threads').set('cf-access-jwt-assertion', 'token').send(valid)
    );

    const list = await requestOn(app, (r) =>
      r.get('/threads').set('cf-access-jwt-assertion', 'token')
    );
    expect(list.body.threads[0].messages[0].author).toBe('abc123.access');
  });
});

describe('GET /api/threads — filters', () => {
  it('400s an unknown status filter rather than returning everything', async () => {
    const { app } = open();

    const res = await requestOn(app, (r) => r.get('/threads?status=wontfix'));

    expect(res.status).toBe(400);
  });

  it('filters by route', async () => {
    const { app } = open();
    await create(app);
    await create(app, { route: '/s/media/library' });

    const res = await requestOn(app, (r) => r.get('/threads?route=/s/media/library'));

    expect(res.body.threads).toHaveLength(1);
    expect(res.body.threads[0].route).toBe('/s/media/library');
  });

  it('filters by status', async () => {
    const { app } = open();
    const created = await create(app);
    await requestOn(app, (r) => r.patch(`/threads/${created.body.id}`).send({ status: 'applied' }));

    const stillOpen = await requestOn(app, (r) => r.get('/threads?status=open'));
    const applied = await requestOn(app, (r) => r.get('/threads?status=applied'));

    expect(stillOpen.body.threads).toEqual([]);
    expect(applied.body.threads).toHaveLength(1);
  });
});

describe('POST /api/threads/:id/messages', () => {
  it('400s an empty body', async () => {
    const { app } = open();
    const created = await create(app);

    const res = await requestOn(app, (r) =>
      r.post(`/threads/${created.body.id}/messages`).send({ body: '' })
    );

    expect(res.status).toBe(400);
  });

  it('201s and appends', async () => {
    const { app } = open();
    const created = await create(app);

    const res = await requestOn(app, (r) =>
      r.post(`/threads/${created.body.id}/messages`).send({ body: 'widened it' })
    );

    expect(res.status).toBe(201);
    const list = await requestOn(app, (r) => r.get('/threads'));
    expect(list.body.threads[0].messages).toHaveLength(2);
  });

  it('404s a thread that does not exist', async () => {
    const { app } = open();

    const res = await requestOn(app, (r) =>
      r.post('/threads/ghost/messages').send({ body: 'into the void' })
    );

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/threads/:id', () => {
  it.each(['open', 'applied', 'rejected', 'outdated'])('accepts %s', async (status) => {
    const { app } = open();
    const created = await create(app);

    const res = await requestOn(app, (r) =>
      r.patch(`/threads/${created.body.id}`).send({ status })
    );

    expect(res.status).toBe(200);
  });

  it('400s an unknown status', async () => {
    const { app } = open();
    const created = await create(app);

    const res = await requestOn(app, (r) =>
      r.patch(`/threads/${created.body.id}`).send({ status: 'wontfix' })
    );

    expect(res.status).toBe(400);
  });

  it('400s a missing status', async () => {
    const { app } = open();
    const created = await create(app);

    const res = await requestOn(app, (r) => r.patch(`/threads/${created.body.id}`).send({}));

    expect(res.status).toBe(400);
  });

  it('records who resolved it and when, and clears both on reopen', async () => {
    const { app } = open();
    const created = await create(app);

    await requestOn(app, (r) => r.patch(`/threads/${created.body.id}`).send({ status: 'applied' }));
    const resolved = await requestOn(app, (r) => r.get('/threads'));
    await requestOn(app, (r) => r.patch(`/threads/${created.body.id}`).send({ status: 'open' }));
    const reopened = await requestOn(app, (r) => r.get('/threads'));

    expect(resolved.body.threads[0]).toMatchObject({
      status: 'applied',
      resolvedBy: 'dev@example.com',
    });
    expect(resolved.body.threads[0].resolvedAt).not.toBeNull();
    expect(reopened.body.threads[0]).toMatchObject({ resolvedBy: null, resolvedAt: null });
  });

  it('404s a thread that does not exist', async () => {
    const { app } = open();

    const res = await requestOn(app, (r) => r.patch('/threads/ghost').send({ status: 'applied' }));

    expect(res.status).toBe(404);
  });
});
