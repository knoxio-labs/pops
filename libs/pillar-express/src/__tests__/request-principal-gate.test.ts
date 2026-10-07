/**
 * The identity leg of the shared gate: operator, guest and service principals
 * resolved from a real signed Access token, over a real Express app.
 */
import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { guestRoute } from '@pops/pillar-sdk/server';
import { createAccessJwtFixture, generateAccessKeyPair } from '@pops/pillar-sdk/testing';

import { createPopsErrorHandler, defineErrors } from '../error-handling.js';
import { ACCESS_JWT_HEADER, readPrincipal, type RequestPrincipal } from '../request-principal.js';
import { createServiceAccountScopeGate } from '../service-account-scope-gate.js';

import type { ServiceAccountVerification, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const AUDIENCE = 'aud-under-test';
const access = createAccessJwtFixture({ audience: AUDIENCE });

const OPERATOR = 'owner@pops.test';
const GUEST = 'rosane@example.test';
const KEY = 'pops_sa_abcdefgh.a-secret-that-never-leaves-this-file';

const contract = {
  orders: {
    list: { method: 'GET', path: '/orders' },
    create: { method: 'POST', path: '/orders' },
  },
  shared: {
    list: { method: 'GET', path: '/shared', metadata: guestRoute() },
    remove: { method: 'DELETE', path: '/shared' },
  },
};

const rawRoutes = { blobs: { read: { method: 'GET', path: '/blobs/:sha256' } } };

const enforcing: NodeJS.ProcessEnv = {
  POPS_OPERATOR_EMAILS: `Second@Pops.Test, ${OPERATOR}`,
  CLOUDFLARE_ACCESS_TEAM_NAME: access.teamName,
  CLOUDFLARE_ACCESS_AUD: AUDIENCE,
};

const rejecting: ServiceAccountVerifier = () => Promise.resolve({ outcome: 'rejected' });

const granted = (scopes: readonly string[]): ServiceAccountVerifier => {
  const verification: ServiceAccountVerification = {
    outcome: 'authenticated',
    principal: { id: 'sa_test', name: 'ingest-cli', scopes },
  };
  return () => Promise.resolve(verification);
};

interface Harness {
  readonly app: Express;
  /** Called by every handler behind the gate with the principal it read. */
  readonly reached: ReturnType<typeof vi.fn<(principal: RequestPrincipal) => void>>;
  readonly fetchImpl: ReturnType<typeof vi.fn<typeof globalThis.fetch>>;
}

interface HarnessOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly verify?: ServiceAccountVerifier;
  readonly requireCredential?: boolean;
  readonly registeredErrors?: boolean;
}

const registered = defineErrors('widgets', {
  invalid: { area: 'auth', status: 401, message: 'registered invalid', retryable: false },
  forbidden: { area: 'auth', status: 403, message: 'registered forbidden', retryable: false },
  unavailable: { area: 'auth', status: 503, message: 'registered unavailable', retryable: true },
});

function harness(options: HarnessOptions = {}): Harness {
  const reached = vi.fn<(principal: RequestPrincipal) => void>();
  const fetchImpl = vi.fn<typeof globalThis.fetch>(access.fetchImpl);
  const gate = createServiceAccountScopeGate({
    contract,
    rootScope: 'widgets',
    logPrefix: 'widgets-api',
    rawRoutes,
    requireCredential: options.requireCredential,
    errors: options.registeredErrors === true ? registered : undefined,
    identity: { env: options.env ?? enforcing, fetchImpl },
  });
  const app = express();
  app.use(gate.createMiddleware(options.verify ?? rejecting));
  app.use((_req, res) => {
    reached(readPrincipal(res));
    res.json({ ok: true });
  });
  app.use(createPopsErrorHandler({ pillar: 'widgets' }));
  return { app, reached, fetchImpl };
}

let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a verified email on the operator list', () => {
  it('reaches an unmarked route as the operator', async () => {
    const { app, reached } = harness();
    const response = await request(app)
      .get('/orders')
      .set(ACCESS_JWT_HEADER, access.signForEmail(OPERATOR));

    expect(response.status).toBe(200);
    expect(reached).toHaveBeenCalledExactlyOnceWith({ kind: 'operator', email: OPERATOR });
  });

  it('matches whatever the case of the claim or of the list entry', async () => {
    const { app, reached } = harness();
    await request(app)
      .get('/orders')
      .set(ACCESS_JWT_HEADER, access.signForEmail('OWNER@Pops.Test'));
    await request(app)
      .post('/orders')
      .set(ACCESS_JWT_HEADER, access.signForEmail(' second@pops.test '));

    expect(reached.mock.calls).toEqual([
      [{ kind: 'operator', email: OPERATOR }],
      [{ kind: 'operator', email: 'second@pops.test' }],
    ]);
  });

  it('reaches raw routes and paths outside the contract', async () => {
    const { app, reached } = harness();
    const token = access.signForEmail(OPERATOR);
    const raw = await request(app).get('/blobs/abc').set(ACCESS_JWT_HEADER, token);
    const outside = await request(app).get('/undeclared').set(ACCESS_JWT_HEADER, token);

    expect([raw.status, outside.status]).toEqual([200, 200]);
    expect(reached).toHaveBeenCalledTimes(2);
  });

  it('is still held to requireCredential, as a request with no token is', async () => {
    const { app, reached } = harness({ requireCredential: true });
    const response = await request(app)
      .get('/orders')
      .set(ACCESS_JWT_HEADER, access.signForEmail(OPERATOR));

    expect(response.status).toBe(401);
    expect(reached).not.toHaveBeenCalled();
  });
});

describe('a verified email that is not on the operator list', () => {
  it.each([
    ['an unmarked contract route', 'get', '/orders'],
    ['a write on an unmarked contract route', 'post', '/orders'],
    ['an unmarked method on a path whose GET is marked', 'delete', '/shared'],
    ['a declared raw route', 'get', '/blobs/abc'],
    ['a path outside the contract', 'get', '/undeclared'],
  ] as const)('is refused 403 on %s before any handler runs', async (_label, method, path) => {
    const { app, reached } = harness();
    const response = await request(app)
      [method](path)
      .set(ACCESS_JWT_HEADER, access.signForEmail(GUEST))
      .set('X-Request-Id', '01JGUESTREQUESTID000000000');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      code: 'widgets.auth.forbidden',
      message: expect.any(String),
      requestId: '01JGUESTREQUESTID000000000',
      retryable: false,
      details: { principal: 'guest' },
    });
    expect(reached).not.toHaveBeenCalled();
  });

  it('reaches a marked route as a guest carrying the normalised email', async () => {
    const { app, reached } = harness();
    const response = await request(app)
      .get('/shared')
      .set(ACCESS_JWT_HEADER, access.signForEmail('Rosane@Example.Test'));

    expect(response.status).toBe(200);
    expect(reached).toHaveBeenCalledExactlyOnceWith({ kind: 'guest', email: GUEST });
  });

  it('reaches the health probe', async () => {
    const { app, reached } = harness();
    const response = await request(app)
      .get('/health')
      .set(ACCESS_JWT_HEADER, access.signForEmail(GUEST));

    expect(response.status).toBe(200);
    expect(reached).toHaveBeenCalledExactlyOnceWith({ kind: 'guest', email: GUEST });
  });

  it('is not let onto a path that merely starts with the health probe', async () => {
    const { app, reached } = harness();
    const response = await request(app)
      .get('/health/internals')
      .set(ACCESS_JWT_HEADER, access.signForEmail(GUEST));

    expect(response.status).toBe(403);
    expect(reached).not.toHaveBeenCalled();
  });

  it('is a guest when the email only resembles an operator address', async () => {
    const { app, reached } = harness();
    await request(app)
      .get('/shared')
      .set(ACCESS_JWT_HEADER, access.signForEmail(`x${OPERATOR}`));

    expect(reached).toHaveBeenCalledExactlyOnceWith({ kind: 'guest', email: `x${OPERATOR}` });
  });

  it('cannot step around classification by attaching a key to an unscoped path', async () => {
    const { app, reached } = harness();
    const response = await request(app)
      .get('/undeclared')
      .set(ACCESS_JWT_HEADER, access.signForEmail(GUEST))
      .set('x-api-key', 'made-up');

    expect(response.status).toBe(403);
    expect(reached).not.toHaveBeenCalled();
  });

  it('is refused through the registered failure when the pillar supplies one', async () => {
    const { app, reached } = harness({ registeredErrors: true });
    const response = await request(app)
      .get('/orders')
      .set(ACCESS_JWT_HEADER, access.signForEmail(GUEST));

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'widgets.auth.forbidden',
      message: 'registered forbidden',
      details: { principal: 'guest' },
    });
    expect(reached).not.toHaveBeenCalled();
  });

  it('is named in the log by what was refused, never by the token', async () => {
    const { app } = harness();
    const token = access.signForEmail(GUEST);
    await request(app).get('/orders').set(ACCESS_JWT_HEADER, token);

    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('[widgets-api] refused a guest');
    expect(logged).toContain('widgets.orders.list');
    expect(logged).not.toContain(token);
  });
});

describe('a token that does not verify', () => {
  const impostor = generateAccessKeyPair();

  it.each([
    ['expired', () => access.signForEmail(OPERATOR, { expiresIn: -10 })],
    ['signed by another key', () => access.signForEmail(OPERATOR, { key: impostor.privateKey })],
    ['minted for another audience', () => access.sign({ email: OPERATOR, aud: 'another-app' })],
    ['carrying no audience', () => access.sign({ email: OPERATOR })],
    ['signed under an unknown key id', () => access.signForEmail(OPERATOR, { kid: 'kid-x' })],
    [
      'HMAC-signed with the public key',
      () => access.signForEmail(OPERATOR, { key: access.publicKey, algorithm: 'HS256' }),
    ],
    ['a service token with no email', () => access.sign({ common_name: 'x', aud: AUDIENCE })],
    ['not a token at all', () => 'not-a-jwt'],
  ])('is 401 when %s, even on a guest-capable route', async (_label, mint) => {
    const { app, reached } = harness();
    const token = mint();
    const response = await request(app).get('/shared').set(ACCESS_JWT_HEADER, token);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      code: 'widgets.auth.invalid',
      retryable: false,
      details: { credential: 'cloudflare-access' },
    });
    expect(reached).not.toHaveBeenCalled();
    expect(warn.mock.calls.flat().join(' ')).not.toContain(token);
  });

  it('is 401 when the signing keys cannot be fetched', async () => {
    const { app, reached, fetchImpl } = harness();
    fetchImpl.mockRejectedValueOnce(new Error('ENOTFOUND'));
    const response = await request(app)
      .get('/orders')
      .set(ACCESS_JWT_HEADER, access.signForEmail(OPERATOR));

    expect(response.status).toBe(401);
    expect(reached).not.toHaveBeenCalled();
  });

  it('is 401 through the registered failure when the pillar supplies one', async () => {
    const { app } = harness({ registeredErrors: true });
    const response = await request(app).get('/orders').set(ACCESS_JWT_HEADER, 'not-a-jwt');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ message: 'registered invalid' });
  });
});

describe('a request presenting an API key', () => {
  it('is a service principal held to its grant, exactly as before', async () => {
    const { app, reached } = harness({ verify: granted(['widgets.orders']) });
    const admitted = await request(app).get('/orders').set('x-api-key', KEY);
    const refused = await request(app).get('/shared').set('x-api-key', KEY);

    expect(admitted.status).toBe(200);
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ details: { requiredScope: 'widgets.shared.list' } });
    expect(reached).toHaveBeenCalledExactlyOnceWith({ kind: 'service' });
  });

  it('is 401 when the registry rejects the key', async () => {
    const { app, reached } = harness();
    const response = await request(app).get('/orders').set('x-api-key', KEY);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ details: { requiredScope: 'widgets.orders.list' } });
    expect(reached).not.toHaveBeenCalled();
  });

  it('is judged by the key alone on a scoped route, without verifying a token beside it', async () => {
    const { app, reached, fetchImpl } = harness({ verify: granted(['widgets']) });
    const response = await request(app)
      .get('/orders')
      .set('x-api-key', KEY)
      .set(ACCESS_JWT_HEADER, 'not-a-jwt');

    expect(response.status).toBe(200);
    expect(reached).toHaveBeenCalledExactlyOnceWith({ kind: 'service' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('still passes an unscoped path untouched when no token rides with it', async () => {
    const verify = vi.fn(rejecting);
    const { app, reached } = harness({ verify });
    const response = await request(app).get('/undeclared').set('x-api-key', KEY);

    expect(response.status).toBe(200);
    expect(verify).not.toHaveBeenCalled();
    expect(reached).toHaveBeenCalledExactlyOnceWith({ kind: 'service' });
  });
});

describe('a request presenting no credential', () => {
  it('is the operator with no email, on every kind of path', async () => {
    const verify = vi.fn(rejecting);
    const { app, reached, fetchImpl } = harness({ verify });
    const statuses = await Promise.all(
      ['/orders', '/shared', '/blobs/abc', '/undeclared'].map(
        async (path) => (await request(app).get(path)).status
      )
    );

    expect(statuses).toEqual([200, 200, 200, 200]);
    expect(reached.mock.calls).toEqual(
      Array.from({ length: 4 }, () => [{ kind: 'operator', email: null }])
    );
    expect(verify).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('treats an empty token header as no token', async () => {
    const { app, reached } = harness();
    const response = await request(app).get('/orders').set(ACCESS_JWT_HEADER, '');

    expect(response.status).toBe(200);
    expect(reached).toHaveBeenCalledExactlyOnceWith({ kind: 'operator', email: null });
  });

  it('is 401 on a scoped route when the pillar requires a credential, as before', async () => {
    const { app, reached } = harness({ requireCredential: true });
    const response = await request(app).get('/orders');

    expect(response.status).toBe(401);
    expect(reached).not.toHaveBeenCalled();
  });
});

describe.each([
  ['POPS_OPERATOR_EMAILS is unset', { ...enforcing, POPS_OPERATOR_EMAILS: undefined }],
  ['POPS_OPERATOR_EMAILS is empty', { ...enforcing, POPS_OPERATOR_EMAILS: ' , ' }],
  [
    'CLOUDFLARE_ACCESS_TEAM_NAME is unset',
    { ...enforcing, CLOUDFLARE_ACCESS_TEAM_NAME: undefined },
  ],
  ['CLOUDFLARE_ACCESS_TEAM_NAME is empty', { ...enforcing, CLOUDFLARE_ACCESS_TEAM_NAME: '' }],
  ['neither is set', {}],
])('while %s', (_label, env) => {
  it.each([
    ['a guest token', () => access.signForEmail(GUEST)],
    ['an operator token', () => access.signForEmail(OPERATOR)],
    ['an expired token', () => access.signForEmail(GUEST, { expiresIn: -10 })],
    ['a token that is not a token', () => 'not-a-jwt'],
  ])('%s is ignored and the request is the operator everywhere', async (_token, mint) => {
    const { app, reached, fetchImpl } = harness({ env });
    const statuses = await Promise.all(
      ['/orders', '/shared', '/blobs/abc', '/undeclared'].map(
        async (path) => (await request(app).get(path).set(ACCESS_JWT_HEADER, mint())).status
      )
    );

    expect(statuses).toEqual([200, 200, 200, 200]);
    expect(reached.mock.calls).toEqual(
      Array.from({ length: 4 }, () => [{ kind: 'operator', email: null }])
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('a write with a guest token is not refused', async () => {
    const { app } = harness({ env });
    const response = await request(app)
      .post('/orders')
      .set(ACCESS_JWT_HEADER, access.signForEmail(GUEST));

    expect(response.status).toBe(200);
  });

  it('an API key is held to its grant exactly as before', async () => {
    const { app, reached } = harness({ env, verify: granted(['widgets.orders']) });
    const admitted = await request(app).get('/orders').set('x-api-key', KEY);
    const refused = await request(app).get('/shared').set('x-api-key', KEY);
    const outside = await request(app)
      .get('/undeclared')
      .set('x-api-key', 'made-up')
      .set(ACCESS_JWT_HEADER, access.signForEmail(GUEST));

    expect([admitted.status, refused.status, outside.status]).toEqual([200, 403, 200]);
    expect(reached.mock.calls).toEqual([[{ kind: 'service' }], [{ kind: 'service' }]]);
  });

  it('requireCredential still 401s a request with no key', async () => {
    const { app } = harness({ env, requireCredential: true });
    const response = await request(app)
      .get('/orders')
      .set(ACCESS_JWT_HEADER, access.signForEmail(OPERATOR));

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ details: { requiredScope: 'widgets.orders.list' } });
  });
});

describe('the startup warning', () => {
  function gateWith(env: NodeJS.ProcessEnv) {
    return createServiceAccountScopeGate({
      contract,
      rootScope: 'widgets',
      logPrefix: 'widgets-api',
      identity: { env },
    });
  }

  it('is logged once per gate however many middlewares it builds', () => {
    const gate = gateWith({});
    gate.createMiddleware(rejecting);
    gate.createMiddleware(rejecting);
    gate.createMiddleware(rejecting);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('[widgets-api] POPS_OPERATOR_EMAILS is not set');
  });

  it('names the team name when that is the one missing', () => {
    gateWith({ POPS_OPERATOR_EMAILS: OPERATOR }).createMiddleware(rejecting);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('CLOUDFLARE_ACCESS_TEAM_NAME is not set');
  });

  it('is not logged while enforcement is on', () => {
    gateWith(enforcing).createMiddleware(rejecting);

    expect(warn).not.toHaveBeenCalled();
  });

  it('is not logged by building the gate, only by building its middleware', () => {
    gateWith({});

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('the environment', () => {
  it('is read from process.env when no override is given', async () => {
    vi.stubEnv('POPS_OPERATOR_EMAILS', OPERATOR);
    vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', access.teamName);
    vi.stubEnv('CLOUDFLARE_ACCESS_AUD', AUDIENCE);
    const gate = createServiceAccountScopeGate({
      contract,
      rootScope: 'widgets',
      logPrefix: 'widgets-api',
      identity: { fetchImpl: access.fetchImpl },
    });
    const app = express().use(gate.createMiddleware(rejecting), (_req, res) => {
      res.json(readPrincipal(res));
    });

    const guest = await request(app)
      .get('/orders')
      .set(ACCESS_JWT_HEADER, access.signForEmail(GUEST));
    const shared = await request(app)
      .get('/shared')
      .set(ACCESS_JWT_HEADER, access.signForEmail(GUEST));
    vi.unstubAllEnvs();

    expect(guest.status).toBe(403);
    expect(shared.body).toEqual({ kind: 'guest', email: GUEST });
  });

  it('is re-read by each middleware, so setting the list turns enforcement on', async () => {
    const env: NodeJS.ProcessEnv = { CLOUDFLARE_ACCESS_TEAM_NAME: access.teamName };
    const gate = createServiceAccountScopeGate({
      contract,
      rootScope: 'widgets',
      logPrefix: 'widgets-api',
      identity: { env, fetchImpl: access.fetchImpl },
    });
    const appFor = (): Express =>
      express().use(gate.createMiddleware(rejecting), (_req, res) => {
        res.json({ ok: true });
      });
    const token = access.sign({ email: GUEST });

    const before = await request(appFor()).get('/orders').set(ACCESS_JWT_HEADER, token);
    env['POPS_OPERATOR_EMAILS'] = OPERATOR;
    const after = await request(appFor()).get('/orders').set(ACCESS_JWT_HEADER, token);

    expect([before.status, after.status]).toEqual([200, 403]);
  });
});

describe('readPrincipal', () => {
  it('throws on a response the gate never saw, rather than answering operator', async () => {
    const app = express();
    app.get('/early', (_req, res) => {
      res.json(readPrincipal(res));
    });
    app.use(createPopsErrorHandler({ pillar: 'widgets', logger: { error: () => undefined } }));

    const response = await request(app).get('/early');

    expect(response.status).toBe(500);
  });
});
