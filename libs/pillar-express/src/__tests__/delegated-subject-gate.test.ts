/**
 * The delegation leg of the shared gate: a service account naming the guest it
 * calls for, over a real Express app with real signed Access tokens.
 */
import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { guestRoute } from '@pops/pillar-sdk/server';
import { createAccessJwtFixture } from '@pops/pillar-sdk/testing';

import { DELEGATED_SUBJECT_HEADER } from '../delegated-subject.js';
import { createPopsErrorHandler, defineErrors } from '../error-handling.js';
import { ACCESS_JWT_HEADER, readPrincipal, type RequestPrincipal } from '../request-principal.js';
import { createServiceAccountScopeGate } from '../service-account-scope-gate.js';

import type { ServiceAccountVerification, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const AUDIENCE = 'aud-under-test';
const access = createAccessJwtFixture({ audience: AUDIENCE });

const OPERATOR = 'owner@pops.test';
const GUEST = 'rosane@example.test';
const KEY = 'pops_sa_abcdefgh.a-secret-that-never-leaves-this-file';
const DELEGATION_SCOPE = 'widgets.delegatedSubject';

const contract = {
  orders: { list: { method: 'GET', path: '/orders' } },
  shared: {
    list: { method: 'GET', path: '/shared', metadata: guestRoute() },
    remove: { method: 'DELETE', path: '/shared' },
  },
};

const rawRoutes = { blobs: { read: { method: 'GET', path: '/blobs/:sha256' } } };

const unset: NodeJS.ProcessEnv = {};
const enforcing: NodeJS.ProcessEnv = {
  POPS_OPERATOR_EMAILS: OPERATOR,
  CLOUDFLARE_ACCESS_TEAM_NAME: access.teamName,
  CLOUDFLARE_ACCESS_AUD: AUDIENCE,
};

const granted = (scopes: readonly string[]): ServiceAccountVerifier => {
  const verification: ServiceAccountVerification = {
    outcome: 'authenticated',
    principal: { id: 'sa_bfm', name: 'bfm', scopes },
  };
  return () => Promise.resolve(verification);
};

const delegating = granted(['widgets.shared', 'widgets.orders', 'widgets.blobs', DELEGATION_SCOPE]);
const withoutDelegation = granted(['widgets.shared', 'widgets.orders']);

const registered = defineErrors('widgets', {
  invalid: { area: 'auth', status: 401, message: 'registered invalid', retryable: false },
  forbidden: { area: 'auth', status: 403, message: 'registered forbidden', retryable: false },
  unavailable: { area: 'auth', status: 503, message: 'registered unavailable', retryable: true },
});

interface HarnessOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly verify?: ServiceAccountVerifier;
  /** `null` builds a gate that never opted in to delegation. */
  readonly delegatedSubjectScope?: string | null;
  readonly registeredErrors?: boolean;
}

interface Harness {
  readonly app: Express;
  readonly reached: ReturnType<typeof vi.fn<(principal: RequestPrincipal) => void>>;
}

function harness(options: HarnessOptions = {}): Harness {
  const reached = vi.fn<(principal: RequestPrincipal) => void>();
  const gate = createServiceAccountScopeGate({
    contract,
    rootScope: 'widgets',
    logPrefix: 'widgets-api',
    rawRoutes,
    errors: options.registeredErrors === true ? registered : undefined,
    delegatedSubjectScope:
      options.delegatedSubjectScope === null
        ? undefined
        : (options.delegatedSubjectScope ?? DELEGATION_SCOPE),
    identity: { env: options.env ?? unset, fetchImpl: access.fetchImpl },
  });
  const app = express();
  app.use(gate.createMiddleware(options.verify ?? delegating));
  app.use((_req, res) => {
    reached(readPrincipal(res));
    res.json({ ok: true });
  });
  app.use(createPopsErrorHandler({ pillar: 'widgets' }));
  return { app, reached };
}

let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each([
  ['while the operator list is unset', unset],
  ['with Access enforced', enforcing],
])('a key holding the delegation scope that names a subject, %s', (_label, env) => {
  it('reaches a marked route as that guest, with the email normalised', async () => {
    const { app, reached } = harness({ env });
    const response = await request(app)
      .get('/shared')
      .set('x-api-key', KEY)
      .set(DELEGATED_SUBJECT_HEADER, '  Rosane@Example.Test ');

    expect(response.status).toBe(200);
    expect(reached).toHaveBeenCalledExactlyOnceWith({ kind: 'guest', email: GUEST });
  });

  it.each([
    ['an unmarked contract route', 'get', '/orders'],
    ['an unmarked method on a path whose GET is marked', 'delete', '/shared'],
    ['a declared raw route', 'get', '/blobs/abc'],
  ] as const)('is refused 403 as a guest on %s', async (_route, method, path) => {
    const { app, reached } = harness({ env });
    const response = await request(app)
      [method](path)
      .set('x-api-key', KEY)
      .set(DELEGATED_SUBJECT_HEADER, GUEST);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'widgets.auth.forbidden',
      details: { principal: 'guest' },
    });
    expect(reached).not.toHaveBeenCalled();
  });

  it('is a guest even when the named email is on the operator list', async () => {
    const { app, reached } = harness({ env });
    const marked = await request(app)
      .get('/shared')
      .set('x-api-key', KEY)
      .set(DELEGATED_SUBJECT_HEADER, OPERATOR);
    const unmarked = await request(app)
      .get('/orders')
      .set('x-api-key', KEY)
      .set(DELEGATED_SUBJECT_HEADER, OPERATOR);

    expect([marked.status, unmarked.status]).toEqual([200, 403]);
    expect(reached).toHaveBeenCalledExactlyOnceWith({ kind: 'guest', email: OPERATOR });
  });

  it('is still held to the scope of the route itself', async () => {
    const { app, reached } = harness({ env, verify: granted([DELEGATION_SCOPE]) });
    const response = await request(app)
      .get('/shared')
      .set('x-api-key', KEY)
      .set(DELEGATED_SUBJECT_HEADER, GUEST);

    expect(response.status).toBe(403);
    expect(response.body.details).toEqual({ requiredScope: 'widgets.shared.list' });
    expect(reached).not.toHaveBeenCalled();
  });

  it('ignores an Access token riding beside the key', async () => {
    const { app, reached } = harness({ env });
    const response = await request(app)
      .get('/shared')
      .set('x-api-key', KEY)
      .set(ACCESS_JWT_HEADER, access.signForEmail(OPERATOR))
      .set(DELEGATED_SUBJECT_HEADER, GUEST);

    expect(response.status).toBe(200);
    expect(reached).toHaveBeenCalledExactlyOnceWith({ kind: 'guest', email: GUEST });
  });
});

describe('the delegation scope', () => {
  it('is matched by dot prefix, as every other scope is', async () => {
    const { app, reached } = harness({ verify: granted(['widgets']) });
    const response = await request(app)
      .get('/shared')
      .set('x-api-key', KEY)
      .set(DELEGATED_SUBJECT_HEADER, GUEST);

    expect(response.status).toBe(200);
    expect(reached).toHaveBeenCalledExactlyOnceWith({ kind: 'guest', email: GUEST });
  });

  it('is not held by a key granted a scope that merely starts with its name', async () => {
    const { app, reached } = harness({
      verify: granted(['widgets.shared', 'widgets.delegatedSubjectX', 'widgets.delegated']),
    });
    const response = await request(app)
      .get('/shared')
      .set('x-api-key', KEY)
      .set(DELEGATED_SUBJECT_HEADER, GUEST);

    expect(response.status).toBe(403);
    expect(reached).not.toHaveBeenCalled();
  });
});

describe('a subject header from a caller that may not delegate', () => {
  it('is 403 from a key without the scope, on a route that key could otherwise reach', async () => {
    const { app, reached } = harness({ verify: withoutDelegation });
    const response = await request(app)
      .get('/shared')
      .set('x-api-key', KEY)
      .set(DELEGATED_SUBJECT_HEADER, GUEST)
      .set('X-Request-Id', '01JDELEGATEDREQUESTID00000');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      code: 'widgets.auth.forbidden',
      message: expect.any(String),
      requestId: '01JDELEGATEDREQUESTID00000',
      retryable: false,
      details: { requiredScope: DELEGATION_SCOPE },
    });
    expect(reached).not.toHaveBeenCalled();
  });

  it('is 403 before the value is looked at, so a malformed one is not 400', async () => {
    const { app } = harness({ verify: withoutDelegation });
    const response = await request(app)
      .get('/shared')
      .set('x-api-key', KEY)
      .set(DELEGATED_SUBJECT_HEADER, 'not-an-email');

    expect(response.status).toBe(403);
  });

  it.each([
    ['while the operator list is unset', unset],
    ['with Access enforced', enforcing],
  ])('is 403 from a request with no key, %s', async (_label, env) => {
    const { app, reached } = harness({ env });
    const response = await request(app).get('/shared').set(DELEGATED_SUBJECT_HEADER, GUEST);

    expect(response.status).toBe(403);
    expect(response.body.details).toEqual({ requiredScope: DELEGATION_SCOPE });
    expect(reached).not.toHaveBeenCalled();
  });

  it.each([
    ['the operator', OPERATOR],
    ['a guest', GUEST],
  ])('is 403 from a browser session of %s', async (_label, email) => {
    const { app, reached } = harness({ env: enforcing });
    const response = await request(app)
      .get('/shared')
      .set(ACCESS_JWT_HEADER, access.signForEmail(email))
      .set(DELEGATED_SUBJECT_HEADER, 'someone-else@example.test');

    expect(response.status).toBe(403);
    expect(reached).not.toHaveBeenCalled();
  });

  it('is 403 on a path outside the scope table, where no key is ever verified', async () => {
    const { app, reached } = harness();
    const response = await request(app)
      .get('/health')
      .set('x-api-key', KEY)
      .set(DELEGATED_SUBJECT_HEADER, GUEST);

    expect(response.status).toBe(403);
    expect(reached).not.toHaveBeenCalled();
  });

  it('is 401 when the key itself is rejected, as without the header', async () => {
    const { app } = harness({ verify: () => Promise.resolve({ outcome: 'rejected' }) });
    const response = await request(app)
      .get('/shared')
      .set('x-api-key', KEY)
      .set(DELEGATED_SUBJECT_HEADER, GUEST);

    expect(response.status).toBe(401);
  });

  it('is refused through the registered failure when the pillar supplies one', async () => {
    const { app } = harness({ verify: withoutDelegation, registeredErrors: true });
    const response = await request(app)
      .get('/shared')
      .set('x-api-key', KEY)
      .set(DELEGATED_SUBJECT_HEADER, GUEST);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('registered forbidden');
  });

  it('names the account and the scope it lacks in the log, never the key or the subject', async () => {
    const { app } = harness({ verify: withoutDelegation });
    await request(app).get('/shared').set('x-api-key', KEY).set(DELEGATED_SUBJECT_HEADER, GUEST);

    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('bfm');
    expect(logged).toContain(DELEGATION_SCOPE);
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain(GUEST);
  });
});

describe('a malformed subject from a key that may delegate', () => {
  it.each([
    ['empty', ''],
    ['only whitespace', '   '],
    ['no at sign', 'rosane.example.test'],
    ['no local part', '@example.test'],
    ['no domain', 'rosane@'],
    ['two at signs', 'rosane@example@test'],
    ['an inner space', 'rosane @example.test'],
    ['two addresses, as a repeated header arrives joined', `${GUEST}, ${OPERATOR}`],
    ['longer than an address can be', `${'a'.repeat(250)}@example.test`],
  ])('is 400 when it is %s', async (_label, value) => {
    const { app, reached } = harness();
    const response = await request(app)
      .get('/shared')
      .set('x-api-key', KEY)
      .set(DELEGATED_SUBJECT_HEADER, value)
      .set('X-Request-Id', '01JMALFORMEDREQUESTID00000');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'widgets.auth.subject_invalid',
      message: expect.any(String),
      requestId: '01JMALFORMEDREQUESTID00000',
      retryable: false,
      details: { header: DELEGATED_SUBJECT_HEADER },
    });
    expect(reached).not.toHaveBeenCalled();
  });

  it('is 400 with the same envelope when the pillar registers its own failures', async () => {
    const { app } = harness({ registeredErrors: true });
    const response = await request(app)
      .get('/shared')
      .set('x-api-key', KEY)
      .set(DELEGATED_SUBJECT_HEADER, 'nope');

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('widgets.auth.subject_invalid');
  });
});

describe('a request with no subject header', () => {
  it.each([
    ['an unmarked route', '/orders'],
    ['a marked route', '/shared'],
  ])('leaves a delegating key a service principal on %s', async (_label, path) => {
    const { app, reached } = harness();
    const response = await request(app).get(path).set('x-api-key', KEY);

    expect(response.status).toBe(200);
    expect(reached).toHaveBeenCalledExactlyOnceWith({ kind: 'service' });
  });

  it('leaves a request with no key the operator while the operator list is unset', async () => {
    const { app, reached } = harness();
    const response = await request(app)
      .get('/orders')
      .set(ACCESS_JWT_HEADER, access.signForEmail(GUEST));

    expect(response.status).toBe(200);
    expect(reached).toHaveBeenCalledExactlyOnceWith({ kind: 'operator', email: null });
  });
});

describe('a gate that did not opt in to delegation', () => {
  it('does not read the header: a key stays a service principal on every route', async () => {
    const { app, reached } = harness({ delegatedSubjectScope: null });
    const response = await request(app)
      .get('/orders')
      .set('x-api-key', KEY)
      .set(DELEGATED_SUBJECT_HEADER, GUEST);

    expect(response.status).toBe(200);
    expect(reached).toHaveBeenCalledExactlyOnceWith({ kind: 'service' });
  });

  it('does not refuse a keyless request that carries it', async () => {
    const { app, reached } = harness({ delegatedSubjectScope: null });
    const response = await request(app).get('/orders').set(DELEGATED_SUBJECT_HEADER, 'nope');

    expect(response.status).toBe(200);
    expect(reached).toHaveBeenCalledExactlyOnceWith({ kind: 'operator', email: null });
  });
});
