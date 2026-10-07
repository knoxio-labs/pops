/**
 * The Cloudflare Access guard, driven through the real app.
 *
 * Every case signs a real token with the shared fixture: the property under
 * test is what a verified email may do, and a stubbed verifier would assert
 * only that the stub was called. Each route gets a spy for its data source so
 * "refused" can be asserted as "the handler never ran", not just as a status.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAccessJwtFixture, generateAccessKeyPair } from '@pops/pillar-sdk/testing';
import { ErrorBodySchema } from '@pops/types';

import { createOrchestratorApp } from '../app.js';
import { createTestTransport, type Test } from './test-http.js';

import type { BuildToolList } from '../ai-tools/index.js';
import type { SearchSource } from '../search/index.js';
import type { TagFederationRequest, TagFederationResponse } from '../tags/federation.js';

const { requestOn } = createTestTransport();

const access = createAccessJwtFixture({ teamName: 'orchestrator-access-guard-suite' });

const OPERATOR_EMAIL = 'owner@example.com';
const GUEST_EMAIL = 'rosane@example.com';

/** The list is written in mixed case with stray spaces on purpose. */
const OPERATOR_LIST = ' Owner@Example.com , second-owner@example.com';

const ENFORCING: NodeJS.ProcessEnv = {
  CLOUDFLARE_ACCESS_TEAM_NAME: access.teamName,
  POPS_OPERATOR_EMAILS: OPERATOR_LIST,
};

function build(env: NodeJS.ProcessEnv) {
  const searchSource = vi.fn<SearchSource>(async () => []);
  const buildToolList = vi.fn<BuildToolList>(async () => []);
  const taggedQuerySource = vi.fn(
    async (_request: TagFederationRequest): Promise<TagFederationResponse> => ({
      expandedTagIds: [],
      sections: [],
      pillars: [],
    })
  );
  const app = createOrchestratorApp(
    { version: '1.2.3', selfBaseUrl: 'http://localhost:3009', snapshotReader: async () => [] },
    { searchSource, buildToolList, taggedQuerySource, env }
  );
  return { app, searchSource, buildToolList, taggedQuerySource };
}

type Built = ReturnType<typeof build>;

/** Every route mounted behind the guard, plus one that does not exist. */
function guardedRequests(built: Built): Test[] {
  const on = requestOn(built.app);
  return [
    on.get('/openapi'),
    on.get('/pillars'),
    on.post('/search').send({ query: { text: 'flight' } }),
    on.get('/ai/tools'),
    on.post('/tagged/query').send({ tagIds: ['trip-id'], limit: 25 }),
    on.get('/no-such-route'),
  ];
}

async function statusesFor(built: Built, token: string | null): Promise<number[]> {
  const statuses: number[] = [];
  for (const request of guardedRequests(built)) {
    const res = await (token === null ? request : request.set('cf-access-jwt-assertion', token));
    statuses.push(res.status);
  }
  return statuses;
}

function expectNoHandlerRan(built: Built): void {
  expect(built.searchSource).not.toHaveBeenCalled();
  expect(built.buildToolList).not.toHaveBeenCalled();
  expect(built.taggedQuerySource).not.toHaveBeenCalled();
}

const SERVED = [200, 200, 200, 200, 200, 404];

beforeEach(() => {
  vi.stubGlobal('fetch', access.fetchImpl);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('with an operator list and an Access team', () => {
  it('refuses a guest on every route, and runs no handler', async () => {
    const built = build(ENFORCING);

    const statuses = await statusesFor(built, access.signForEmail(GUEST_EMAIL));

    expect(statuses).toEqual([403, 403, 403, 403, 403, 403]);
    expectNoHandlerRan(built);
  });

  it('answers a guest with the error envelope and names nobody', async () => {
    const res = await requestOn(build(ENFORCING).app)
      .get('/ai/tools')
      .set('cf-access-jwt-assertion', access.signForEmail(GUEST_EMAIL));

    expect(ErrorBodySchema.safeParse(res.body).success).toBe(true);
    expect(res.body).toMatchObject({ code: 'orchestrator.auth.forbidden', retryable: false });
    expect(JSON.stringify(res.body)).not.toMatch(/example\.com/);
  });

  it('serves the operator, whatever case Access reports the email in', async () => {
    const built = build(ENFORCING);

    const lower = await statusesFor(built, access.signForEmail(OPERATOR_EMAIL));
    const upper = await statusesFor(built, access.signForEmail('OWNER@example.COM'));

    expect([lower, upper]).toEqual([SERVED, SERVED]);
    expect(built.searchSource).toHaveBeenCalledTimes(2);
  });

  /** A near miss is a different mailbox, and must not be folded into the owner's. */
  it.each(['owner+guest@example.com', 'owner@example.com.evil.test', 'o.wner@example.com'])(
    'treats %s as a guest',
    async (email) => {
      const res = await requestOn(build(ENFORCING).app)
        .get('/pillars')
        .set('cf-access-jwt-assertion', access.signForEmail(email));

      expect(res.status).toBe(403);
    }
  );

  it('serves a request with no token exactly as before', async () => {
    const built = build(ENFORCING);

    expect(await statusesFor(built, null)).toEqual(SERVED);
    expect(built.searchSource).toHaveBeenCalledTimes(1);
  });

  it('reads an empty token header as no token', async () => {
    const res = await requestOn(build(ENFORCING).app)
      .get('/pillars')
      .set('cf-access-jwt-assertion', '');

    expect(res.status).toBe(200);
  });

  it('serves a service token, which carries no email to list', async () => {
    const built = build(ENFORCING);

    const statuses = await statusesFor(built, access.sign({ common_name: 'abc123.access' }));

    expect(statuses).toEqual(SERVED);
  });

  it.each([
    ['garbage', () => 'not-a-jwt'],
    ['expired', () => access.signForEmail(OPERATOR_EMAIL, { expiresIn: -60 })],
    [
      'signed by another key',
      () => access.signForEmail(OPERATOR_EMAIL, { key: generateAccessKeyPair().privateKey }),
    ],
    ['carrying neither email nor common name', () => access.sign({ sub: 'nobody' })],
  ])('answers 401 to a token that is %s, and runs no handler', async (_label, makeToken) => {
    const built = build(ENFORCING);

    const statuses = await statusesFor(built, makeToken());

    expect(statuses).toEqual([401, 401, 401, 401, 401, 401]);
    expectNoHandlerRan(built);
  });

  it('answers an invalid token with the error envelope, without echoing it', async () => {
    const res = await requestOn(build(ENFORCING).app)
      .get('/pillars')
      .set('cf-access-jwt-assertion', 'not-a-jwt');

    expect(res.body).toMatchObject({ code: 'orchestrator.auth.invalid_session', retryable: false });
    expect(JSON.stringify(res.body)).not.toContain('not-a-jwt');
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('not-a-jwt');
  });

  it('holds a token to the configured audience', async () => {
    const env = { ...ENFORCING, CLOUDFLARE_ACCESS_AUD: 'expected-audience' };
    const wrongAudience = access.sign({ email: OPERATOR_EMAIL, aud: 'another-application' });
    const rightAudience = access.sign({ email: OPERATOR_EMAIL, aud: 'expected-audience' });

    const refused = await requestOn(build(env).app)
      .get('/pillars')
      .set('cf-access-jwt-assertion', wrongAudience);
    const served = await requestOn(build(env).app)
      .get('/pillars')
      .set('cf-access-jwt-assertion', rightAudience);

    expect([refused.status, served.status]).toEqual([401, 200]);
  });

  it('leaves the liveness probe open to a guest and to a broken token', async () => {
    const { app } = build(ENFORCING);

    const guest = await requestOn(app)
      .get('/health')
      .set('cf-access-jwt-assertion', access.signForEmail(GUEST_EMAIL));
    const broken = await requestOn(app).get('/health').set('cf-access-jwt-assertion', 'not-a-jwt');

    expect([guest.status, broken.status]).toEqual([200, 200]);
  });

  it('does not warn at startup', () => {
    build(ENFORCING);

    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe.each([
  ['no operator list', { CLOUDFLARE_ACCESS_TEAM_NAME: access.teamName }, 'POPS_OPERATOR_EMAILS'],
  [
    'an empty operator list',
    { CLOUDFLARE_ACCESS_TEAM_NAME: access.teamName, POPS_OPERATOR_EMAILS: ' , ,' },
    'POPS_OPERATOR_EMAILS',
  ],
  ['no Access team', { POPS_OPERATOR_EMAILS: OPERATOR_LIST }, 'CLOUDFLARE_ACCESS_TEAM_NAME'],
  ['neither variable', {}, 'POPS_OPERATOR_EMAILS'],
])('with %s', (_label, env: NodeJS.ProcessEnv, missing) => {
  it('serves a guest token as it did before the guard existed', async () => {
    const built = build(env);

    expect(await statusesFor(built, access.signForEmail(GUEST_EMAIL))).toEqual(SERVED);
  });

  it('serves a token that would not verify, because it is never looked at', async () => {
    const expired = access.signForEmail(OPERATOR_EMAIL, { expiresIn: -60 });

    expect(await statusesFor(build(env), expired)).toEqual(SERVED);
    expect(await statusesFor(build(env), 'not-a-jwt')).toEqual(SERVED);
  });

  it('serves a request with no token', async () => {
    expect(await statusesFor(build(env), null)).toEqual(SERVED);
  });

  it('warns once when the app is built, naming what is missing, and not again per request', async () => {
    const built = build(env);

    await statusesFor(built, access.signForEmail(GUEST_EMAIL));

    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(`${missing} is not set`));
  });
});
