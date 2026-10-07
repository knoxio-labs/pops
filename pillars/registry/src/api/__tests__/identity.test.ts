/**
 * Tests for the registry's human-identity resolution and the gates built on
 * it.
 *
 * `resolvePrincipal` in production has two branches that matter: without
 * `CLOUDFLARE_ACCESS_TEAM_NAME` set, every request resolves to the tunnel
 * user and the JWT-verification branch below it is unreachable; with it set, a
 * `cf-access-jwt-assertion` is actually verified, and the verified email is
 * the operator or a guest by `POPS_OPERATOR_EMAILS`.
 *
 * The gate suites drive the real Express app, because what they pin is the
 * status a guest gets on each operator route, which is a property of the
 * handlers and not of the resolver.
 *
 * These only prove the code branches correctly given the environment — they
 * cannot prove the deployed container ever sees the variables set. That half
 * is `infra/docker-compose.yml` wiring them through, plus an operator step to
 * set the values in the deployed environment.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openCoreDb, type OpenedCoreDb } from '../../db/index.js';
import { createCoreApiApp } from '../app.js';
import { createIdentityMiddleware, resolvePrincipal } from '../middleware/identity.js';
import {
  accessHeaders,
  createAccessFixture,
  GUEST_EMAIL,
  OPERATOR_EMAIL,
  stubProductionAccess,
} from './access-session.js';
import { createTestTransport, type Test } from './test-http.js';
import { makeClient } from './test-utils.js';

import type { Request } from 'express';

const { requestOn } = createTestTransport();
const access = createAccessFixture('pops-registry-identity-test');

let tmpDir: string;
let coreDb: OpenedCoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-identity-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
});

afterEach(() => {
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function req(headers: Record<string, string> = {}): Pick<Request, 'headers'> {
  return { headers };
}

function app(): ReturnType<typeof createCoreApiApp> {
  return createCoreApiApp({ coreDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3001' });
}

const TUNNEL_OPERATOR = {
  user: { email: 'tunnel-authenticated@pops.local', kind: 'operator', accessVerified: false },
  serviceAccount: null,
};

describe('resolvePrincipal in production', () => {
  it('falls back to the tunnel user when CLOUDFLARE_ACCESS_TEAM_NAME is unset', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', '');

    await expect(resolvePrincipal(coreDb.db, req())).resolves.toEqual(TUNNEL_OPERATOR);
  });

  it('still falls back to the tunnel user even when a JWT assertion is presented', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', '');

    await expect(
      resolvePrincipal(coreDb.db, req({ 'cf-access-jwt-assertion': 'not-a-jwt' }))
    ).resolves.toEqual(TUNNEL_OPERATOR);
  });

  it('keeps the tunnel user the operator when an operator list is set without a team name', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', '');
    vi.stubEnv('POPS_OPERATOR_EMAILS', OPERATOR_EMAIL);

    await expect(
      resolvePrincipal(coreDb.db, req(accessHeaders(access, GUEST_EMAIL)))
    ).resolves.toEqual(TUNNEL_OPERATOR);
  });

  it('reaches the JWT-verification branch once CLOUDFLARE_ACCESS_TEAM_NAME is set, and rejects a bad assertion', async () => {
    stubProductionAccess(access, OPERATOR_EMAIL);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      resolvePrincipal(coreDb.db, req({ 'cf-access-jwt-assertion': 'not-a-jwt' }))
    ).resolves.toEqual({ user: null, serviceAccount: null });
  });

  it('is anonymous, never the tunnel user, when Access is configured but no assertion is presented', async () => {
    stubProductionAccess(access, OPERATOR_EMAIL);

    await expect(resolvePrincipal(coreDb.db, req())).resolves.toEqual({
      user: null,
      serviceAccount: null,
    });
  });

  it('is anonymous for a token signed by a key the team does not publish', async () => {
    stubProductionAccess(access, OPERATOR_EMAIL);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const impostor = createAccessFixture(access.teamName);

    await expect(
      resolvePrincipal(coreDb.db, req(accessHeaders(impostor, OPERATOR_EMAIL)))
    ).resolves.toEqual({ user: null, serviceAccount: null });
  });
});

describe('resolvePrincipal operator and guest classification', () => {
  it('resolves a listed email to the operator', async () => {
    stubProductionAccess(access, OPERATOR_EMAIL);

    await expect(
      resolvePrincipal(coreDb.db, req(accessHeaders(access, OPERATOR_EMAIL)))
    ).resolves.toEqual({
      user: { email: OPERATOR_EMAIL, kind: 'operator', accessVerified: true },
      serviceAccount: null,
    });
  });

  it('resolves any other verified email to a guest', async () => {
    stubProductionAccess(access, OPERATOR_EMAIL);

    await expect(
      resolvePrincipal(coreDb.db, req(accessHeaders(access, GUEST_EMAIL)))
    ).resolves.toEqual({
      user: { email: GUEST_EMAIL, kind: 'guest', accessVerified: true },
      serviceAccount: null,
    });
  });

  it('matches the list ignoring case and surrounding whitespace, on either side', async () => {
    stubProductionAccess(access, ` other@example.com , Owner@Example.COM `);

    const principal = await resolvePrincipal(
      coreDb.db,
      req(accessHeaders(access, 'OWNER@example.com'))
    );

    expect(principal.user?.kind).toBe('operator');
  });

  it('does not treat an email that merely contains an operator address as the operator', async () => {
    stubProductionAccess(access, OPERATOR_EMAIL);

    const principal = await resolvePrincipal(
      coreDb.db,
      req(accessHeaders(access, `not-${OPERATOR_EMAIL}`))
    );

    expect(principal.user?.kind).toBe('guest');
  });

  it('treats every verified email as the operator while the list is unset', async () => {
    stubProductionAccess(access);

    await expect(
      resolvePrincipal(coreDb.db, req(accessHeaders(access, GUEST_EMAIL)))
    ).resolves.toEqual({
      user: { email: GUEST_EMAIL, kind: 'operator', accessVerified: true },
      serviceAccount: null,
    });
  });

  it('treats a list of only separators and blanks as unset', async () => {
    stubProductionAccess(access, ' , ,');

    const principal = await resolvePrincipal(coreDb.db, req(accessHeaders(access, GUEST_EMAIL)));

    expect(principal.user?.kind).toBe('operator');
  });
});

const SETTING_KEY = 'core.aiRetry.maxRetries';
const FEATURE_KEY = 'any.feature';

type Agent = ReturnType<typeof requestOn>;

/** Every route behind `requireUser` or `requireProtected`, with a body that passes validation. */
const OPERATOR_ROUTES: ReadonlyArray<readonly [string, (agent: Agent) => Test]> = [
  ['GET /service-accounts', (a) => a.get('/service-accounts')],
  [
    'POST /service-accounts',
    (a) => a.post('/service-accounts').send({ name: 'guest-minted', scopes: ['core.settings'] }),
  ],
  [
    'POST /service-accounts/:id/revoke',
    (a) => a.post('/service-accounts/sa_missing/revoke').send({}),
  ],
  ['GET /features/manifests', (a) => a.get('/features/manifests')],
  ['GET /features', (a) => a.get('/features')],
  ['GET /features/:key/enabled', (a) => a.get(`/features/${FEATURE_KEY}/enabled`)],
  [
    'PUT /features/:key/enabled',
    (a) => a.put(`/features/${FEATURE_KEY}/enabled`).send({ enabled: true }),
  ],
  [
    'PUT /features/:key/preference',
    (a) => a.put(`/features/${FEATURE_KEY}/preference`).send({ enabled: true }),
  ],
  ['DELETE /features/:key/preference', (a) => a.delete(`/features/${FEATURE_KEY}/preference`)],
  ['GET /settings', (a) => a.get('/settings')],
  ['GET /settings/aggregate', (a) => a.get('/settings/aggregate')],
  ['GET /settings/:key', (a) => a.get(`/settings/${SETTING_KEY}`)],
  ['PUT /settings/:key', (a) => a.put(`/settings/${SETTING_KEY}`).send({ value: '9' })],
  ['POST /settings/get-many', (a) => a.post('/settings/get-many').send({ keys: [SETTING_KEY] })],
  [
    'POST /settings/set-many',
    (a) => a.post('/settings/set-many').send({ entries: [{ key: SETTING_KEY, value: '9' }] }),
  ],
  ['POST /settings/reset', (a) => a.post('/settings/reset').send({})],
  ['POST /settings/:key/reset', (a) => a.post(`/settings/${SETTING_KEY}/reset`).send({})],
  [
    'POST /settings/:key/ensure',
    (a) => a.post(`/settings/${SETTING_KEY}/ensure`).send({ value: '9' }),
  ],
  ['DELETE /settings/:key', (a) => a.delete(`/settings/${SETTING_KEY}`)],
];

function as(email: string, issue: (agent: Agent) => Test): Test {
  return issue(requestOn(app())).set(accessHeaders(access, email));
}

describe('a guest on the operator routes', () => {
  beforeEach(() => {
    stubProductionAccess(access, OPERATOR_EMAIL);
  });

  it.each(OPERATOR_ROUTES)('is 403 on %s', async (_name, issue) => {
    const res = await as(GUEST_EMAIL, issue);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'registry.auth.forbidden', retryable: false });
  });

  it('leaves nothing behind: the refused create minted no account and the refused write changed no setting', async () => {
    await as(GUEST_EMAIL, (a) =>
      a.post('/service-accounts').send({ name: 'guest-minted', scopes: ['core.settings'] })
    );
    await as(GUEST_EMAIL, (a) => a.put(`/settings/${SETTING_KEY}`).send({ value: '9' }));

    const operator = makeClient(app(), accessHeaders(access, OPERATOR_EMAIL));
    await expect(operator.serviceAccounts.list()).resolves.toEqual([]);
    const setting = await operator.settings.get(SETTING_KEY);
    expect(setting.data?.value).not.toBe('9');
  });

  it('cannot revoke an account the operator minted', async () => {
    const operator = makeClient(app(), accessHeaders(access, OPERATOR_EMAIL));
    const created = await operator.serviceAccounts.create({
      name: 'operator-minted',
      scopes: ['core.settings'],
    });

    const res = await as(GUEST_EMAIL, (a) =>
      a.post(`/service-accounts/${created.id}/revoke`).send({})
    );

    expect(res.status).toBe(403);
    const [account] = await operator.serviceAccounts.list();
    expect(account?.revokedAt).toBeNull();
  });
});

describe('the operator on the operator routes', () => {
  beforeEach(() => {
    stubProductionAccess(access, OPERATOR_EMAIL);
  });

  it.each(OPERATOR_ROUTES)('is not refused on %s', async (_name, issue) => {
    const res = await as(OPERATOR_EMAIL, issue);

    expect([401, 403]).not.toContain(res.status);
  });

  it('mints an account recorded against the verified email', async () => {
    const operator = makeClient(app(), accessHeaders(access, OPERATOR_EMAIL));

    const created = await operator.serviceAccounts.create({
      name: 'operator-minted',
      scopes: ['core.settings'],
    });

    expect(created.createdBy).toBe(OPERATOR_EMAIL);
  });

  it('is still 401, not 403, with no session at all', async () => {
    const res = await requestOn(app()).get('/service-accounts');

    expect(res.status).toBe(401);
  });
});

describe('rollout safety: POPS_OPERATOR_EMAILS unset', () => {
  it.each(OPERATOR_ROUTES)('refuses no verified user on %s', async (_name, issue) => {
    stubProductionAccess(access);

    const res = await as(GUEST_EMAIL, issue);

    expect([401, 403]).not.toContain(res.status);
  });

  it.each(OPERATOR_ROUTES)('refuses nobody on %s without a team name either', async (_n, issue) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', '');
    vi.stubEnv('POPS_OPERATOR_EMAILS', '');

    const res = await issue(requestOn(app()));

    expect([401, 403]).not.toContain(res.status);
  });
});

describe('service accounts with an operator list set', () => {
  async function mintKey(scopes: string[]): Promise<Record<string, string>> {
    const operator = makeClient(app(), accessHeaders(access, OPERATOR_EMAIL));
    const created = await operator.serviceAccounts.create({ name: 'machine', scopes });
    return { 'x-api-key': created.plaintextKey };
  }

  beforeEach(() => {
    stubProductionAccess(access, OPERATOR_EMAIL);
  });

  it('passes a protected route its scope covers', async () => {
    const key = await mintKey(['core.settings']);

    const res = await requestOn(app()).get('/settings').set(key);

    expect(res.status).toBe(200);
  });

  it('is 401 on a protected route its scope misses', async () => {
    const key = await mintKey(['cerebrum.query']);

    const res = await requestOn(app()).get('/settings').set(key);

    expect(res.status).toBe(401);
  });

  it('is 401 on a userOnly route whatever its scope', async () => {
    const key = await mintKey(['core.serviceAccounts']);

    const res = await requestOn(app()).get('/service-accounts').set(key);

    expect(res.status).toBe(401);
  });

  it('is resolved from the key even when a guest token rides along', async () => {
    const key = await mintKey(['core.settings']);

    const res = await requestOn(app())
      .get('/settings')
      .set({ ...key, ...accessHeaders(access, GUEST_EMAIL) });

    expect(res.status).toBe(200);
  });
});

describe('the classification-off startup warning', () => {
  function warnings(): string[] {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createIdentityMiddleware(coreDb.db);
    return warn.mock.calls.map(([message]) => String(message));
  }

  it('warns once, naming POPS_OPERATOR_EMAILS, when the list is unset in production', () => {
    stubProductionAccess(access);

    const logged = warnings();

    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('POPS_OPERATOR_EMAILS is not set');
  });

  it('names CLOUDFLARE_ACCESS_TEAM_NAME when that is what is missing', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', '');
    vi.stubEnv('POPS_OPERATOR_EMAILS', OPERATOR_EMAIL);

    const logged = warnings();

    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('CLOUDFLARE_ACCESS_TEAM_NAME is not set');
  });

  it('is silent once both are set', () => {
    stubProductionAccess(access, OPERATOR_EMAIL);

    expect(warnings()).toEqual([]);
  });

  it('is silent outside production, where the dev fallback decides', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('POPS_OPERATOR_EMAILS', '');

    expect(warnings()).toEqual([]);
  });
});
