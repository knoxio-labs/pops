/**
 * Integration tests for the `accounts/:id/grants` REST surface (POPS-5864),
 * over the real Express app, a real SQLite file and real signed Access tokens.
 *
 * The route tier is the cheapest one that can see what matters here: who the
 * scope gate lets through to a grant route, and that the email a caller typed
 * and the email the table holds are the same address.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ACCESS_JWT_HEADER } from '@pops/pillar-express';
import { createAccessJwtFixture } from '@pops/pillar-sdk/testing';

import { DAY_ONE_ACCOUNT_KINDS, type AccountKind } from '../../contract/account-kind.js';
import { accountGrantsService, openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import { createAccount } from '../../db/services/accounts.js';
import { createFinanceApiApp } from '../app.js';
import { makeContactsFake } from './contacts-fake.js';
import { requestOn } from './test-utils.js';

const AUDIENCE = 'aud-under-test';
const access = createAccessJwtFixture({ audience: AUDIENCE });

const OPERATOR = 'owner@pops.test';
const GUEST = 'rosane@example.test';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

function enforceAccess(): void {
  vi.stubEnv('POPS_OPERATOR_EMAILS', OPERATOR);
  vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', access.teamName);
  vi.stubEnv('CLOUDFLARE_ACCESS_AUD', AUDIENCE);
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-account-grants-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', access.fetchImpl);
  vi.stubEnv('POPS_OPERATOR_EMAILS', '');
  vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', '');
  vi.stubEnv('CLOUDFLARE_ACCESS_AUD', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function app() {
  return createFinanceApiApp({
    financeDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3004',
    contacts: makeContactsFake(),
  });
}

function anAccount(name = 'Everyday', kind: AccountKind = 'checking'): string {
  const entityId = kind === 'person' ? 'contact-rosane' : null;
  return createAccount(financeDb.db, { name, kind, currency: 'AUD', entityId }).id;
}

interface Caller {
  /** Email to sign an Access token for. Omitted, the request carries no credential. */
  readonly as?: string;
}

function listGrants(accountId: string, caller: Caller = {}) {
  return requestOn(app(), (agent) => {
    const req = agent.get(`/accounts/${accountId}/grants`);
    return caller.as === undefined
      ? req
      : req.set(ACCESS_JWT_HEADER, access.signForEmail(caller.as));
  });
}

function putGrant(accountId: string, body: unknown, caller: Caller = {}) {
  return requestOn(app(), (agent) => {
    const req = agent.put(`/accounts/${accountId}/grants`).send(body as object);
    return caller.as === undefined
      ? req
      : req.set(ACCESS_JWT_HEADER, access.signForEmail(caller.as));
  });
}

function revokeGrant(accountId: string, grantId: string, caller: Caller = {}) {
  return requestOn(app(), (agent) => {
    const req = agent.delete(`/accounts/${accountId}/grants/${grantId}`);
    return caller.as === undefined
      ? req
      : req.set(ACCESS_JWT_HEADER, access.signForEmail(caller.as));
  });
}

describe('the operator, signed in through Access', () => {
  beforeEach(enforceAccess);

  it('grants, lists, changes the role and revokes', async () => {
    const accountId = anAccount();

    const granted = await putGrant(accountId, { email: GUEST, role: 'view' }, { as: OPERATOR });
    expect(granted.status).toBe(200);
    expect(granted.body.data).toEqual({
      id: expect.any(String),
      accountId,
      email: GUEST,
      role: 'view',
      createdAt: expect.any(String),
      createdBy: OPERATOR,
    });
    const grantId: string = granted.body.data.id;

    const listed = await listGrants(accountId, { as: OPERATOR });
    expect(listed.status).toBe(200);
    expect(listed.body.data).toEqual([granted.body.data]);

    const changed = await putGrant(accountId, { email: GUEST, role: 'edit' }, { as: OPERATOR });
    expect(changed.status).toBe(200);
    expect(changed.body.data).toMatchObject({ id: grantId, role: 'edit' });
    expect(accountGrantsService.roleFor(financeDb.db, GUEST, accountId)).toBe('edit');

    const revoked = await revokeGrant(accountId, grantId, { as: OPERATOR });
    expect(revoked.status).toBe(204);
    expect((await listGrants(accountId, { as: OPERATOR })).body.data).toEqual([]);
    expect(accountGrantsService.roleFor(financeDb.db, GUEST, accountId)).toBeNull();
  });

  it('updates the existing grant on a second PUT for the same email, keeping who first granted it', async () => {
    const accountId = anAccount();
    const first = await putGrant(accountId, { email: GUEST, role: 'edit' }, { as: OPERATOR });
    const second = await putGrant(accountId, { email: GUEST, role: 'view' });

    expect(second.body.data).toEqual({ ...first.body.data, role: 'view' });
    const listed = await listGrants(accountId);
    expect(listed.body.data).toHaveLength(1);
  });

  it('resolves a mixed-case email to the one grant its lower-case spelling holds', async () => {
    const accountId = anAccount();
    const lower = await putGrant(accountId, { email: GUEST, role: 'view' });
    const mixed = await putGrant(accountId, { email: 'Rosane@Example.TEST', role: 'edit' });

    expect(mixed.status).toBe(200);
    expect(mixed.body.data).toMatchObject({ id: lower.body.data.id, email: GUEST, role: 'edit' });
    expect((await listGrants(accountId)).body.data).toHaveLength(1);
    expect(accountGrantsService.roleFor(financeDb.db, 'ROSANE@example.test', accountId)).toBe(
      'edit'
    );
  });

  it('does not fold a plus tag or dots into another address', async () => {
    const accountId = anAccount();
    await putGrant(accountId, { email: 'ro.sane@example.test', role: 'view' });
    await putGrant(accountId, { email: 'rosane+pops@example.test', role: 'view' });

    expect(accountGrantsService.roleFor(financeDb.db, GUEST, accountId)).toBeNull();
    expect((await listGrants(accountId)).body.data).toHaveLength(2);
  });

  it('keeps grants per account: one email, two accounts, two independent roles', async () => {
    const shared = anAccount('Shared');
    const other = anAccount('Other', 'savings');
    await putGrant(shared, { email: GUEST, role: 'edit' });
    await putGrant(other, { email: GUEST, role: 'view' });

    expect(accountGrantsService.grantsForEmail(financeDb.db, ' Rosane@Example.Test ')).toEqual(
      new Map([
        [shared, 'edit'],
        [other, 'view'],
      ])
    );
    expect((await listGrants(shared)).body.data).toHaveLength(1);
  });

  it('grants on any account kind without creating an account', async () => {
    const countAccounts = () => financeDb.raw.prepare('SELECT count(*) AS n FROM accounts').get();
    const accountIds = DAY_ONE_ACCOUNT_KINDS.map((kind) => anAccount(`A ${kind}`, kind));
    const before = countAccounts();

    for (const accountId of accountIds) {
      const response = await putGrant(accountId, { email: GUEST, role: 'view' });
      expect(response.status).toBe(200);
    }

    expect(countAccounts()).toEqual(before);
    expect(accountGrantsService.grantsForEmail(financeDb.db, GUEST).size).toBe(
      DAY_ONE_ACCOUNT_KINDS.length
    );
  });
});

describe('a request the routes refuse', () => {
  beforeEach(enforceAccess);

  it('404s all three routes for an unknown account, in the error envelope', async () => {
    const responses = [
      await listGrants('no-such-account'),
      await putGrant('no-such-account', { email: GUEST, role: 'view' }),
      await revokeGrant('no-such-account', 'no-such-grant'),
    ];

    expect(responses.map((r) => r.status)).toEqual([404, 404, 404]);
    expect(responses[1]?.body).toMatchObject({
      code: 'finance.resource.not_found',
      requestId: expect.any(String),
      retryable: false,
    });
    expect(financeDb.raw.prepare('SELECT count(*) AS n FROM account_grants').get()).toEqual({
      n: 0,
    });
  });

  it('404s revoking an unknown grant, and a grant that belongs to another account', async () => {
    const accountId = anAccount('Shared');
    const other = anAccount('Other', 'savings');
    const granted = await putGrant(other, { email: GUEST, role: 'view' });
    const grantId: string = granted.body.data.id;

    expect((await revokeGrant(accountId, 'no-such-grant')).status).toBe(404);
    expect((await revokeGrant(accountId, grantId)).status).toBe(404);
    expect(accountGrantsService.roleFor(financeDb.db, GUEST, other)).toBe('view');
  });

  it.each([
    ['no at sign', 'rosane.example.test'],
    ['no domain', 'rosane@'],
    ['an empty string', ''],
    ['surrounding whitespace', ` ${GUEST} `],
    ['two addresses', `${GUEST},other@example.test`],
    ['a non-string', 42],
    ['longer than an address can be', `${'a'.repeat(250)}@example.test`],
  ])('400s a malformed email: %s', async (_label, email) => {
    const accountId = anAccount();
    const response = await putGrant(accountId, { email, role: 'view' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: expect.any(String), retryable: false });
    expect((await listGrants(accountId)).body.data).toEqual([]);
  });

  it.each([
    ['an unknown role', { email: GUEST, role: 'admin' }],
    ['a role in the wrong case', { email: GUEST, role: 'View' }],
    ['a missing role', { email: GUEST }],
    ['a missing email', { role: 'view' }],
  ])('400s %s', async (_label, body) => {
    const accountId = anAccount();
    const response = await putGrant(accountId, body);

    expect(response.status).toBe(400);
    expect((await listGrants(accountId)).body.data).toEqual([]);
  });
});

describe('a guest', () => {
  beforeEach(enforceAccess);

  it('is 403 on all three routes, even holding edit on the account, and changes nothing', async () => {
    const accountId = anAccount();
    const own = accountGrantsService.upsertGrant(financeDb.db, {
      accountId,
      email: GUEST,
      role: 'edit',
      actor: null,
    });

    const responses = [
      await listGrants(accountId, { as: GUEST }),
      await putGrant(accountId, { email: 'friend@example.test', role: 'edit' }, { as: GUEST }),
      await revokeGrant(accountId, own.id, { as: GUEST }),
    ];

    expect(responses.map((r) => r.status)).toEqual([403, 403, 403]);
    expect(responses[0]?.body).toMatchObject({
      code: 'finance.auth.forbidden',
      details: { principal: 'guest' },
    });
    expect(accountGrantsService.listGrantsForAccount(financeDb.db, accountId)).toEqual([own]);
  });

  it('is 403 before the account is looked up, so an unknown id reads the same as a known one', async () => {
    const response = await listGrants('no-such-account', { as: GUEST });
    expect(response.status).toBe(403);
  });
});

describe('a request with no credential (LAN, Tailscale, dev)', () => {
  beforeEach(enforceAccess);

  it('is the operator on all three routes, and records no granter', async () => {
    const accountId = anAccount();

    const granted = await putGrant(accountId, { email: GUEST, role: 'view' });
    expect(granted.status).toBe(200);
    expect(granted.body.data.createdBy).toBeNull();
    expect((await listGrants(accountId)).status).toBe(200);
    expect((await revokeGrant(accountId, granted.body.data.id)).status).toBe(204);
  });
});

describe('a deployment that has not been given the operator list', () => {
  it('refuses nobody: a token for an email that would be a guest still manages grants', async () => {
    const accountId = anAccount();

    const granted = await putGrant(accountId, { email: GUEST, role: 'view' }, { as: GUEST });
    expect(granted.status).toBe(200);
    expect(granted.body.data.createdBy).toBeNull();
    expect((await listGrants(accountId, { as: GUEST })).status).toBe(200);
    expect((await revokeGrant(accountId, granted.body.data.id, { as: GUEST })).status).toBe(204);
  });

  it('refuses nobody with the operator list set but no Access team to verify against', async () => {
    vi.stubEnv('POPS_OPERATOR_EMAILS', OPERATOR);
    const accountId = anAccount();

    const granted = await putGrant(accountId, { email: GUEST, role: 'view' }, { as: GUEST });
    expect(granted.status).toBe(200);
  });
});
