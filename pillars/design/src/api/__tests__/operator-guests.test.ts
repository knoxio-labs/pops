/**
 * A verified Cloudflare Access user who is not the operator.
 *
 * `identity.test.ts` mocks the verifier, which is right for the resolution
 * ladder and wrong here: what is under test is what a verified email may do,
 * so every case signs a real token with the shared fixture and the SDK
 * verifies it against the fixture's certs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAccessJwtFixture, generateAccessKeyPair } from '@pops/pillar-sdk/testing';

import { createTestApp, type TestApp } from './harness.js';
import { requestOn } from './test-http.js';

import type supertest from 'supertest';

const access = createAccessJwtFixture({ teamName: 'design-operator-guests-suite' });

const OPERATOR_EMAIL = 'owner@example.com';
const GUEST_EMAIL = 'rosane@example.com';

/** Production, Access configured, no operator list: what is deployed today. */
const WITHOUT_OPERATOR_LIST: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  CLOUDFLARE_ACCESS_TEAM_NAME: access.teamName,
};

/** The list is written in mixed case with stray spaces on purpose. */
const WITH_OPERATOR_LIST: NodeJS.ProcessEnv = {
  ...WITHOUT_OPERATOR_LIST,
  POPS_OPERATOR_EMAILS: ' Owner@Example.com , second-owner@example.com',
};

const newThread = {
  route: '/s/finance/import-review',
  anchorKind: 'selector',
  anchor: '{}',
  body: 'x',
};

const apps: TestApp[] = [];

function open(env: NodeJS.ProcessEnv): TestApp {
  const created = createTestApp({ env });
  apps.push(created);
  return created;
}

type Agent = ReturnType<typeof supertest>;

function as(app: TestApp, token: string, build: (agent: Agent) => supertest.Test) {
  return requestOn(app.app, (r) => build(r).set('cf-access-jwt-assertion', token));
}

/** Every route mounted behind the identity middleware, plus one that does not exist. */
async function everyRouteStatus(app: TestApp, token: string): Promise<number[]> {
  const responses = [
    await as(app, token, (r) => r.get('/me')),
    await as(app, token, (r) => r.get('/threads')),
    await as(app, token, (r) => r.post('/threads').send(newThread)),
    await as(app, token, (r) => r.post('/threads/x/messages').send({ body: 'y' })),
    await as(app, token, (r) => r.patch('/threads/x').send({ status: 'applied' })),
    await as(app, token, (r) => r.get('/no-such-route')),
  ];
  return responses.map((res) => res.status);
}

function threadCount(app: TestApp): unknown {
  return app.opened.raw.prepare('SELECT COUNT(*) AS n FROM design_threads').get();
}

beforeEach(() => {
  vi.stubGlobal('fetch', access.fetchImpl);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  while (apps.length > 0) apps.pop()?.cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('with an operator list', () => {
  it('refuses a guest on every route behind the middleware', async () => {
    const app = open(WITH_OPERATOR_LIST);

    const statuses = await everyRouteStatus(app, access.signForEmail(GUEST_EMAIL));

    expect(statuses).toEqual([403, 403, 403, 403, 403, 403]);
  });

  it('answers a guest with the error envelope and names nobody', async () => {
    const app = open(WITH_OPERATOR_LIST);

    const res = await as(app, access.signForEmail(GUEST_EMAIL), (r) => r.get('/me'));

    expect(res.body).toMatchObject({ code: 'design.auth.forbidden', retryable: false });
    expect(res.body.requestId).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toMatch(/example\.com/);
  });

  it('writes nothing when a guest tries to open a thread', async () => {
    const app = open(WITH_OPERATOR_LIST);

    await as(app, access.signForEmail(GUEST_EMAIL), (r) => r.post('/threads').send(newThread));

    expect(threadCount(app)).toEqual({ n: 0 });
  });

  it('does not let a guest reply to or close the operator’s thread', async () => {
    const app = open(WITH_OPERATOR_LIST);
    const created = await as(app, access.signForEmail(OPERATOR_EMAIL), (r) =>
      r.post('/threads').send(newThread)
    );
    const id: unknown = created.body.id;
    expect(id).toEqual(expect.any(String));
    const guest = access.signForEmail(GUEST_EMAIL);

    const reply = await as(app, guest, (r) =>
      r.post(`/threads/${String(id)}/messages`).send({ body: 'y' })
    );
    const close = await as(app, guest, (r) =>
      r.patch(`/threads/${String(id)}`).send({ status: 'applied' })
    );

    expect([reply.status, close.status]).toEqual([403, 403]);
    expect(app.opened.raw.prepare('SELECT status FROM design_threads').get()).toEqual({
      status: 'open',
    });
    expect(app.opened.raw.prepare('SELECT COUNT(*) AS n FROM design_messages').get()).toEqual({
      n: 1,
    });
  });

  it('leaves the liveness probe open to a guest', async () => {
    const app = open(WITH_OPERATOR_LIST);

    const res = await as(app, access.signForEmail(GUEST_EMAIL), (r) => r.get('/health'));

    expect(res.status).toBe(200);
  });

  it('accepts the operator, whatever case Access reports the email in', async () => {
    const app = open(WITH_OPERATOR_LIST);

    const me = await as(app, access.signForEmail('OWNER@example.COM'), (r) => r.get('/me'));
    const create = await as(app, access.signForEmail(OPERATOR_EMAIL), (r) =>
      r.post('/threads').send(newThread)
    );

    expect(me.body).toEqual({ email: 'OWNER@example.COM', service: null });
    expect(create.status).toBe(201);
  });

  /** A near miss is a different mailbox, and must not be folded into the owner's. */
  it.each(['owner+guest@example.com', 'owner@example.com.evil.test', 'o.wner@example.com'])(
    'treats %s as a guest',
    async (email) => {
      const app = open(WITH_OPERATOR_LIST);

      const res = await as(app, access.signForEmail(email), (r) => r.get('/threads'));

      expect(res.status).toBe(403);
    }
  );

  it('still admits a service token, which carries no email to list', async () => {
    const app = open(WITH_OPERATOR_LIST);
    const token = access.sign({ common_name: 'abc123.access' });

    const me = await as(app, token, (r) => r.get('/me'));
    const create = await as(app, token, (r) => r.post('/threads').send(newThread));

    expect(me.body).toEqual({ email: null, service: 'abc123.access' });
    expect(create.status).toBe(201);
  });

  it('still treats a forged operator token as anonymous', async () => {
    const app = open(WITH_OPERATOR_LIST);
    const impostor = generateAccessKeyPair();
    const forged = access.signForEmail(OPERATOR_EMAIL, { key: impostor.privateKey });

    const res = await as(app, forged, (r) => r.get('/me'));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('design.auth.required');
  });

  it('still treats a request with no token as anonymous', async () => {
    const app = open(WITH_OPERATOR_LIST);

    const res = await requestOn(app.app, (r) => r.get('/me'));

    expect(res.body.code).toBe('design.auth.required');
  });

  it('does not warn at startup', () => {
    open(WITH_OPERATOR_LIST);

    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('with no operator list', () => {
  it('treats every verified email as the operator, as it did before guests existed', async () => {
    const app = open(WITHOUT_OPERATOR_LIST);

    const statuses = await everyRouteStatus(app, access.signForEmail(GUEST_EMAIL));

    expect(statuses).toEqual([200, 200, 201, 404, 404, 404]);
  });

  it.each(['', ' , ,'])('reads a list of %j as no list', async (list) => {
    const app = open({ ...WITHOUT_OPERATOR_LIST, POPS_OPERATOR_EMAILS: list });

    const res = await as(app, access.signForEmail(GUEST_EMAIL), (r) => r.get('/me'));

    expect(res.body).toEqual({ email: GUEST_EMAIL, service: null });
  });

  it('warns once when the app is built, and not again per request', async () => {
    const app = open(WITHOUT_OPERATOR_LIST);
    const token = access.signForEmail(GUEST_EMAIL);

    await as(app, token, (r) => r.get('/me'));
    await as(app, token, (r) => r.get('/me'));

    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('POPS_OPERATOR_EMAILS'));
  });

  /** Unchanged: with no Access team this pillar trusts the tunnel, list or no list. */
  it('keeps the tunnel user in production with no Access team, even with a list set', async () => {
    const app = open({ NODE_ENV: 'production', POPS_OPERATOR_EMAILS: OPERATOR_EMAIL });

    const res = await requestOn(app.app, (r) => r.get('/me'));

    expect(res.body).toEqual({ email: 'tunnel-authenticated@pops.local', service: null });
  });

  it('keeps the dev user outside production, list or no list', async () => {
    const app = open({ NODE_ENV: 'development', POPS_OPERATOR_EMAILS: OPERATOR_EMAIL });

    const res = await requestOn(app.app, (r) => r.get('/me'));

    expect(res.body).toEqual({ email: 'dev@example.com', service: null });
  });
});
