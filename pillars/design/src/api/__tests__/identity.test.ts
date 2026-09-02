import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolvePrincipal } from '../middleware/identity.js';
import {
  createTestApp,
  PRODUCTION_ENV,
  PRODUCTION_ENV_WITHOUT_ACCESS,
  type TestApp,
  type TestAppOptions,
} from './harness.js';
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

const newThread = {
  route: '/s/finance/import-review',
  anchorKind: 'selector',
  anchor: '{}',
  body: 'x',
};

describe('resolvePrincipal', () => {
  it('resolves a dev user outside production, with no header at all', async () => {
    await expect(resolvePrincipal({ headers: {} }, { NODE_ENV: 'test' })).resolves.toEqual({
      kind: 'user',
      email: 'dev@example.com',
    });
  });

  /**
   * Nothing reaches this pillar except through the shell's Access-protected
   * tunnel, so an unconfigured team is the registry's "trust the tunnel", not
   * bfm's "refuse everyone".
   */
  it('resolves a tunnel user in production when no Access team is configured', async () => {
    await expect(resolvePrincipal({ headers: {} }, PRODUCTION_ENV_WITHOUT_ACCESS)).resolves.toEqual(
      { kind: 'user', email: 'tunnel-authenticated@pops.local' }
    );
  });

  it('is anonymous in production with a team configured and no assertion header', async () => {
    await expect(resolvePrincipal({ headers: {} }, PRODUCTION_ENV)).resolves.toBeNull();
  });

  it('is anonymous when the assertion header arrives repeated as an array', async () => {
    await expect(
      resolvePrincipal({ headers: { 'cf-access-jwt-assertion': ['a', 'b'] } }, PRODUCTION_ENV)
    ).resolves.toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });

  it('resolves a verified human session', async () => {
    verify.mockResolvedValue({ kind: 'user', email: 'operator@pops.local' });

    await expect(
      resolvePrincipal({ headers: { 'cf-access-jwt-assertion': 'token' } }, PRODUCTION_ENV)
    ).resolves.toEqual({ kind: 'user', email: 'operator@pops.local' });
  });

  it('resolves a verified service token', async () => {
    verify.mockResolvedValue({ kind: 'service', commonName: 'abc123.access' });

    await expect(
      resolvePrincipal({ headers: { 'cf-access-jwt-assertion': 'token' } }, PRODUCTION_ENV)
    ).resolves.toEqual({ kind: 'service', commonName: 'abc123.access' });
  });

  it('is anonymous when verification throws, rather than propagating', async () => {
    verify.mockRejectedValue(new Error('bad signature'));

    await expect(
      resolvePrincipal({ headers: { 'cf-access-jwt-assertion': 'forged' } }, PRODUCTION_ENV)
    ).resolves.toBeNull();
  });
});

describe('the gate', () => {
  it('403s every thread route for an anonymous caller', async () => {
    const { app } = open({ env: PRODUCTION_ENV });

    const list = await requestOn(app, (r) => r.get('/threads'));
    const create = await requestOn(app, (r) => r.post('/threads').send(newThread));
    const reply = await requestOn(app, (r) => r.post('/threads/x/messages').send({ body: 'y' }));
    const patch = await requestOn(app, (r) => r.patch('/threads/x').send({ status: 'applied' }));
    const me = await requestOn(app, (r) => r.get('/me'));

    expect([list.status, create.status, reply.status, patch.status, me.status]).toEqual([
      403, 403, 403, 403, 403,
    ]);
  });

  it('writes nothing on a refused create', async () => {
    const { app, opened } = open({ env: PRODUCTION_ENV });

    await requestOn(app, (r) => r.post('/threads').send(newThread));

    expect(opened.raw.prepare('SELECT COUNT(*) AS n FROM design_threads').get()).toEqual({ n: 0 });
  });

  it('lets a verified service token read and write', async () => {
    verify.mockResolvedValue({ kind: 'service', commonName: 'abc123.access' });
    const { app } = open({ env: PRODUCTION_ENV });

    const res = await requestOn(app, (r) =>
      r.post('/threads').set('cf-access-jwt-assertion', 'token').send(newThread)
    );

    expect(res.status).toBe(201);
  });

  it('reports a service principal on /api/me with a null email', async () => {
    verify.mockResolvedValue({ kind: 'service', commonName: 'abc123.access' });
    const { app } = open({ env: PRODUCTION_ENV });

    const res = await requestOn(app, (r) => r.get('/me').set('cf-access-jwt-assertion', 'token'));

    expect(res.body).toEqual({ email: null, service: 'abc123.access' });
  });
});
