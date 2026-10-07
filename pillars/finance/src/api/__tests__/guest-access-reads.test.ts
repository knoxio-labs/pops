/**
 * Integration tests for what a guest may read of finance (POPS-5866): the
 * accounts granted to them, those accounts' balances, transactions and
 * history, and nothing else. Real Express app, real SQLite file, real signed
 * Access tokens.
 *
 * The route tier is the cheapest one that sees this, because the answer
 * depends on who the scope gate resolved the request to and on the grants
 * table together.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ACCESS_JWT_HEADER } from '@pops/pillar-express';
import { createAccessJwtFixture } from '@pops/pillar-sdk/testing';

import {
  accountGrantsService,
  openFinanceDb,
  transactionsService,
  type OpenedFinanceDb,
} from '../../db/index.js';
import { createAccount } from '../../db/services/accounts.js';
import { createFinanceApiApp } from '../app.js';
import { financeScopeMap } from '../middleware/service-account-scope.js';
import { forGuest } from '../rest/guest-access.js';
import { makeContactsFake } from './contacts-fake.js';
import { requestOn } from './test-utils.js';

import type { ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const AUDIENCE = 'aud-under-test';
const access = createAccessJwtFixture({ audience: AUDIENCE });

const OPERATOR = 'owner@pops.test';
/** Holds `view` on the shared account only. */
const ROSANE = 'rosane@example.test';
/** Holds `edit` on the shared account and on their own. */
const CARLOS = 'carlos@example.test';
/** A verified email with no grant at all. */
const STRANGER = 'stranger@example.test';
const API_KEY = 'pops_sa_abcdefgh.a-secret-that-never-leaves-this-file';

const RAW_ROW = '{"Description":"PRIVATE BANK ROW 4821"}';
const CHECKSUM = 'chk-private-4821';
const NO_SUCH_ID = 'no-such-id';

const financeWideKey: ServiceAccountVerifier = () =>
  Promise.resolve({
    outcome: 'authenticated',
    principal: { id: 'sa_bfm', name: 'bfm', scopes: ['finance'] },
  });

let tmpDir: string;
let financeDb: OpenedFinanceDb;
/** Granted to Rosane (`view`) and Carlos (`edit`). */
let shared: string;
/** Granted to Carlos (`edit`) only. */
let carlosOwn: string;
/** Granted to nobody. */
let privateAccount: string;
let onShared: string;
let onCarlosOwn: string;
let onPrivate: string;

function enforceAccess(): void {
  vi.stubEnv('POPS_OPERATOR_EMAILS', OPERATOR);
  vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', access.teamName);
  vi.stubEnv('CLOUDFLARE_ACCESS_AUD', AUDIENCE);
}

function anEntry(accountId: string, description: string, date: string): string {
  return transactionsService.createTransaction(
    financeDb.db,
    {
      description,
      accountId,
      amountCents: -4200,
      date,
      type: 'purchase',
      rawRow: RAW_ROW,
      checksum: `${CHECKSUM}-${description}`,
    },
    { kind: 'operator', email: OPERATOR }
  ).id;
}

function grant(email: string, accountId: string, role: 'view' | 'edit'): string {
  return accountGrantsService.upsertGrant(financeDb.db, { accountId, email, role, actor: OPERATOR })
    .id;
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-guest-access-reads-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', access.fetchImpl);
  vi.stubEnv('POPS_OPERATOR_EMAILS', '');
  vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', '');
  vi.stubEnv('CLOUDFLARE_ACCESS_AUD', '');

  const account = (name: string) =>
    createAccount(financeDb.db, { name, kind: 'checking', currency: 'AUD' }).id;
  shared = account('Shared');
  carlosOwn = account('Carlos');
  privateAccount = account('Private');

  onShared = anEntry(shared, 'Groceries', '2026-03-01');
  anEntry(shared, 'Pharmacy', '2026-03-02');
  onCarlosOwn = anEntry(carlosOwn, 'Fuel', '2026-03-03');
  onPrivate = anEntry(privateAccount, 'Groceries', '2026-03-04');
  anEntry(privateAccount, 'Mortgage', '2026-03-05');
  anEntry(privateAccount, 'Salary sacrifice', '2026-03-06');

  grant(ROSANE, shared, 'view');
  grant(CARLOS, shared, 'edit');
  grant(CARLOS, carlosOwn, 'edit');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

interface Caller {
  /** Email to sign an Access token for. */
  readonly as?: string;
  /** Present an `X-API-Key` the registry resolves to a finance-wide grant. */
  readonly withKey?: boolean;
}

type Method = 'get' | 'post' | 'patch' | 'delete' | 'put';

function call(method: Method, path: string, caller: Caller = {}, body?: object) {
  const app = createFinanceApiApp({
    financeDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3004',
    contacts: makeContactsFake(),
    serviceAccountVerifier: financeWideKey,
  });
  return requestOn(app, (agent) => {
    let req = agent[method](path);
    if (caller.as !== undefined) req = req.set(ACCESS_JWT_HEADER, access.signForEmail(caller.as));
    if (caller.withKey === true) req = req.set('x-api-key', API_KEY);
    return body === undefined ? req : req.send(body);
  });
}

const get = (path: string, caller: Caller = {}) => call('get', path, caller);

interface AccountBody {
  id: string;
  viewerRole: string;
}
interface TransactionBody {
  id: string;
  accountId: string;
}
interface EventBody {
  action: string;
  accountId: string;
  transactionId: string;
}

const accountRoles = (body: { data: AccountBody[] }): Record<string, string> =>
  Object.fromEntries(body.data.map((account) => [account.id, account.viewerRole]));

/** The database seeds accounts of its own, so "every account" is counted off the table. */
function expectEveryAccountAsOwner(body: {
  data: AccountBody[];
  pagination: { total: number };
}): void {
  const stored = financeDb.raw.prepare('SELECT count(*) AS n FROM accounts').get();
  const roles = accountRoles(body);

  expect(roles).toMatchObject({
    [shared]: 'owner',
    [carlosOwn]: 'owner',
    [privateAccount]: 'owner',
  });
  expect(new Set(Object.values(roles))).toEqual(new Set(['owner']));
  expect({ n: body.pagination.total }).toEqual(stored);
  expect(body.data).toHaveLength(body.pagination.total);
}

const accountIdsOf = (body: { data: TransactionBody[] }): string[] => [
  ...new Set(body.data.map((row) => row.accountId)),
];

/** The parts of a refusal a caller could tell two ids apart by, with the id itself taken out. */
function refusal(response: { status: number; body: Record<string, unknown> }, id: string) {
  const { requestId: _requestId, ...rest } = response.body;
  return { status: response.status, body: JSON.parse(JSON.stringify(rest).replaceAll(id, ':id')) };
}

/** Every read a guest may make that names an account in its path or query. */
const ACCOUNT_READS: readonly (readonly [string, (id: string) => string])[] = [
  ['GET /accounts/:id', (id) => `/accounts/${id}`],
  ['GET /accounts/:id/balance', (id) => `/accounts/${id}/balance`],
  ['GET /accounts/:id/balance-history', (id) => `/accounts/${id}/balance-history`],
  ['GET /accounts/:id/checkpoints', (id) => `/accounts/${id}/checkpoints`],
  ['GET /accounts/:id/history', (id) => `/accounts/${id}/history`],
  ['GET /transactions?accountId=:id', (id) => `/transactions?accountId=${id}`],
];

/** Every read a guest may make that names a transaction in its path. */
const TRANSACTION_READS: readonly (readonly [string, (id: string) => string])[] = [
  ['GET /transactions/:id', (id) => `/transactions/${id}`],
  ['GET /transactions/:id/history', (id) => `/transactions/${id}/history`],
];

describe('the account list, with Access enforced', () => {
  beforeEach(enforceAccess);

  it('shows each guest only the accounts granted to them, with the role held on each', async () => {
    const rosane = await get('/accounts', { as: ROSANE });
    const carlos = await get('/accounts', { as: CARLOS });

    expect(rosane.status).toBe(200);
    expect(accountRoles(rosane.body)).toEqual({ [shared]: 'view' });
    expect(rosane.body.pagination).toMatchObject({ total: 1, hasMore: false });

    expect(carlos.status).toBe(200);
    expect(accountRoles(carlos.body)).toEqual({ [shared]: 'edit', [carlosOwn]: 'edit' });
    expect(carlos.body.pagination).toMatchObject({ total: 2, hasMore: false });
  });

  it('shows a verified email with no grant an empty list rather than refusing it', async () => {
    const response = await get('/accounts', { as: STRANGER });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.pagination).toMatchObject({ total: 0, hasMore: false });
  });

  it('counts only granted accounts when a page is shorter than the grant list', async () => {
    const response = await get('/accounts?limit=1', { as: CARLOS });

    expect(response.body.data).toHaveLength(1);
    expect(response.body.pagination).toMatchObject({ total: 2, hasMore: true });
  });

  it('does not let a search or kind filter reach past the grants', async () => {
    const byName = await get('/accounts?search=Private', { as: CARLOS });
    const byKind = await get('/accounts?kind=checking', { as: ROSANE });

    expect(byName.body.data).toEqual([]);
    expect(byName.body.pagination.total).toBe(0);
    expect(accountRoles(byKind.body)).toEqual({ [shared]: 'view' });
  });

  it('shows the operator every account as its owner', async () => {
    const response = await get('/accounts', { as: OPERATOR });

    expectEveryAccountAsOwner(response.body);
  });
});

describe('a read that names an account, with Access enforced', () => {
  beforeEach(enforceAccess);

  it.each(ACCOUNT_READS)('%s answers a guest for a granted account', async (_name, path) => {
    expect((await get(path(shared), { as: ROSANE })).status).toBe(200);
  });

  it.each(ACCOUNT_READS)(
    '%s 404s an ungranted account exactly as it does a missing one',
    async (_name, path) => {
      const ungranted = await get(path(privateAccount), { as: ROSANE });
      const anotherGuests = await get(path(carlosOwn), { as: ROSANE });
      const missing = await get(path(NO_SUCH_ID), { as: ROSANE });

      expect(missing.status).toBe(404);
      expect(refusal(ungranted, privateAccount)).toEqual(refusal(missing, NO_SUCH_ID));
      expect(refusal(anotherGuests, carlosOwn)).toEqual(refusal(missing, NO_SUCH_ID));
    }
  );

  it('404s a missing account for the operator on every path-addressed read', async () => {
    const pathAddressed = ACCOUNT_READS.filter(([name]) => !name.includes('?'));
    for (const [, path] of pathAddressed) {
      expect((await get(path(NO_SUCH_ID), { as: OPERATOR })).status).toBe(404);
      expect((await get(path(privateAccount), { as: OPERATOR })).status).toBe(200);
    }
  });

  it('reports the role on a single account, and the owner for the operator', async () => {
    const asRosane = await get(`/accounts/${shared}`, { as: ROSANE });
    const asCarlos = await get(`/accounts/${shared}`, { as: CARLOS });
    const asOperator = await get(`/accounts/${shared}`, { as: OPERATOR });

    expect([
      asRosane.body.data.viewerRole,
      asCarlos.body.data.viewerRole,
      asOperator.body.data.viewerRole,
    ]).toEqual(['view', 'edit', 'owner']);
  });
});

describe('a read that names a transaction, with Access enforced', () => {
  beforeEach(enforceAccess);

  it.each(TRANSACTION_READS)('%s answers a guest for a granted account', async (_name, path) => {
    expect((await get(path(onShared), { as: ROSANE })).status).toBe(200);
  });

  it.each(TRANSACTION_READS)(
    '%s 404s a transaction on an ungranted account exactly as it does a missing one',
    async (_name, path) => {
      const ungranted = await get(path(onPrivate), { as: ROSANE });
      const anotherGuests = await get(path(onCarlosOwn), { as: ROSANE });
      const missing = await get(path(NO_SUCH_ID), { as: ROSANE });

      expect(missing.status).toBe(404);
      expect(refusal(ungranted, onPrivate)).toEqual(refusal(missing, NO_SUCH_ID));
      expect(refusal(anotherGuests, onCarlosOwn)).toEqual(refusal(missing, NO_SUCH_ID));
    }
  );
});

describe('the transaction list, with Access enforced', () => {
  beforeEach(enforceAccess);

  it('lists a guest only the transactions on granted accounts when no account is named', async () => {
    const rosane = await get('/transactions', { as: ROSANE });
    const carlos = await get('/transactions', { as: CARLOS });

    expect(accountIdsOf(rosane.body)).toEqual([shared]);
    expect(rosane.body.pagination.total).toBe(2);
    expect(accountIdsOf(carlos.body).toSorted()).toEqual([shared, carlosOwn].toSorted());
    expect(carlos.body.pagination.total).toBe(3);
  });

  it('lists a guest with no grant nothing', async () => {
    const response = await get('/transactions', { as: STRANGER });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.pagination.total).toBe(0);
  });

  it('does not count transactions a filter matches on an ungranted account', async () => {
    const shownOnBoth = await get('/transactions?search=Groceries', { as: ROSANE });
    const onlyElsewhere = await get('/transactions?search=Mortgage', { as: ROSANE });
    const byDate = await get('/transactions?startDate=2026-03-04', { as: ROSANE });

    expect(shownOnBoth.body.data.map((row: TransactionBody) => row.id)).toEqual([onShared]);
    expect(shownOnBoth.body.pagination.total).toBe(1);
    expect(onlyElsewhere.body.data).toEqual([]);
    expect(onlyElsewhere.body.pagination.total).toBe(0);
    expect(byDate.body.pagination.total).toBe(0);
  });

  it('drops ungranted transactions asked for by id instead of returning them', async () => {
    const response = await get(
      `/transactions?ids=${onShared}&ids=${onPrivate}&ids=${onCarlosOwn}`,
      {
        as: ROSANE,
      }
    );

    expect(response.body.data.map((row: TransactionBody) => row.id)).toEqual([onShared]);
    expect(response.body.pagination.total).toBe(1);
  });

  it('pages by offset and by keyset over the granted rows only', async () => {
    const first = await get('/transactions?limit=1', { as: ROSANE });
    const [newest] = first.body.data as { id: string; date: string }[];
    const byOffset = await get('/transactions?limit=1&offset=1', { as: ROSANE });
    const byKeyset = await get(
      `/transactions?limit=5&beforeDate=${newest?.date}&beforeId=${newest?.id}`,
      { as: ROSANE }
    );

    expect(first.body.pagination).toMatchObject({ total: 2, hasMore: true });
    expect(byOffset.body.data.map((row: TransactionBody) => row.id)).toEqual([onShared]);
    expect(byOffset.body.pagination).toMatchObject({ total: 2, hasMore: false });
    expect(byKeyset.body.data.map((row: TransactionBody) => row.id)).toEqual([onShared]);
    expect(byKeyset.body.pagination.total).toBe(1);
  });
});

describe('what a guest response carries, with Access enforced', () => {
  beforeEach(enforceAccess);

  it('never includes the import raw row or the dedup checksum, by key or by value', async () => {
    const paths = [
      '/accounts',
      '/transactions',
      ...ACCOUNT_READS.map(([, path]) => path(shared)),
      ...TRANSACTION_READS.map(([, path]) => path(onShared)),
    ];

    for (const path of paths) {
      const response = await get(path, { as: CARLOS });
      expect(response.status).toBe(200);
      expect(response.text).not.toMatch(/rawRow|checksum|PRIVATE BANK ROW|chk-private/u);
    }
  });

  it('strips both fields from a row and leaves the rest and the original untouched', () => {
    const row = { id: 't1', description: 'Groceries', rawRow: RAW_ROW, checksum: CHECKSUM };

    expect(forGuest(row)).toEqual({
      id: 't1',
      description: 'Groceries',
      rawRow: null,
      checksum: null,
    });
    expect(row).toMatchObject({ rawRow: RAW_ROW, checksum: CHECKSUM });
  });
});

describe('history, with Access enforced', () => {
  beforeEach(enforceAccess);

  const eventsOf = (body: { data: EventBody[] }): string[] =>
    body.data.map((event) => `${event.action}:${event.transactionId}`);

  it('leaves a move to an ungranted account out of the account history and its total', async () => {
    const moved = await call(
      'patch',
      `/transactions/${onShared}`,
      { as: OPERATOR },
      { accountId: privateAccount }
    );
    expect(moved.status).toBe(200);

    const asGuest = await get(`/accounts/${shared}/history`, { as: ROSANE });
    const asOperator = await get(`/accounts/${shared}/history`, { as: OPERATOR });

    expect(eventsOf(asOperator.body)).toContain(`update:${onShared}`);
    expect(asOperator.body.pagination.total).toBe(3);
    expect(eventsOf(asGuest.body)).not.toContain(`update:${onShared}`);
    expect(asGuest.body.pagination.total).toBe(2);
    expect(asGuest.text).not.toContain(privateAccount);
  });

  it('keeps answering for a moved transaction with only the events on granted accounts', async () => {
    await call(
      'patch',
      `/transactions/${onShared}`,
      { as: OPERATOR },
      { accountId: privateAccount }
    );

    const history = await get(`/transactions/${onShared}/history`, { as: ROSANE });
    const row = await get(`/transactions/${onShared}`, { as: ROSANE });

    expect(history.status).toBe(200);
    expect(eventsOf(history.body)).toEqual([`create:${onShared}`]);
    expect(history.text).not.toContain(privateAccount);
    expect(row.status).toBe(404);
  });

  it('hides everything a transaction did before it arrived on a granted account', async () => {
    await call('patch', `/transactions/${onPrivate}`, { as: OPERATOR }, { accountId: shared });
    await call('patch', `/transactions/${onPrivate}`, { as: OPERATOR }, { notes: 'now shared' });

    const history = await get(`/transactions/${onPrivate}/history`, { as: ROSANE });

    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0]).toMatchObject({ action: 'update', changed: ['notes'] });
    expect(history.text).not.toContain(privateAccount);
  });

  it('shows a move between two granted accounts whole, and hides it from a guest holding one', async () => {
    await call('patch', `/transactions/${onShared}`, { as: OPERATOR }, { accountId: carlosOwn });

    const asCarlos = await get(`/accounts/${shared}/history`, { as: CARLOS });
    const asRosane = await get(`/accounts/${shared}/history`, { as: ROSANE });

    expect(eventsOf(asCarlos.body)).toContain(`update:${onShared}`);
    expect(eventsOf(asRosane.body)).not.toContain(`update:${onShared}`);
    expect(asRosane.text).not.toContain(carlosOwn);
  });

  it('still shows a guest the events of a transaction deleted from a granted account', async () => {
    await call('delete', `/transactions/${onShared}`, { as: OPERATOR });

    const history = await get(`/transactions/${onShared}/history`, { as: ROSANE });

    expect(history.status).toBe(200);
    expect(eventsOf(history.body)).toEqual([`delete:${onShared}`, `create:${onShared}`]);
  });
});

describe('a grant that changes, with Access enforced', () => {
  beforeEach(enforceAccess);

  it('denies the very next request once the grant is revoked', async () => {
    const grantId = grant(ROSANE, shared, 'view');
    expect((await get(`/accounts/${shared}`, { as: ROSANE })).status).toBe(200);

    const revoked = await call('delete', `/accounts/${shared}/grants/${grantId}`, { as: OPERATOR });
    expect(revoked.status).toBe(204);

    const statuses = [];
    for (const [, path] of ACCOUNT_READS) {
      statuses.push((await get(path(shared), { as: ROSANE })).status);
    }
    for (const [, path] of TRANSACTION_READS) {
      statuses.push((await get(path(onShared), { as: ROSANE })).status);
    }
    expect(statuses).toEqual(Array.from({ length: statuses.length }, () => 404));

    const list = await get('/accounts', { as: ROSANE });
    const transactions = await get('/transactions', { as: ROSANE });
    expect(list.body.data).toEqual([]);
    expect(transactions.body.pagination.total).toBe(0);
  });

  it('reports a changed role on the next request', async () => {
    await call(
      'put',
      `/accounts/${shared}/grants`,
      { as: OPERATOR },
      { email: ROSANE, role: 'edit' }
    );

    expect((await get(`/accounts/${shared}`, { as: ROSANE })).body.data.viewerRole).toBe('edit');
  });
});

/**
 * The routes a guest may reach. Opening another one means adding it here, so a
 * route cannot open to guests through a stray `guestRoute()` unnoticed.
 */
const GUEST_ROUTES = new Set([
  'GET /accounts',
  'GET /accounts/:id',
  'GET /accounts/:id/balance',
  'GET /accounts/:id/balance-history',
  'GET /accounts/:id/checkpoints',
  'GET /accounts/:id/history',
  'GET /transactions',
  'GET /transactions/:id',
  'GET /transactions/:id/history',
  'POST /transactions',
  'PATCH /transactions/:id',
  'DELETE /transactions/:id',
  'POST /transactions/restore',
  'POST /transactions/:id/attachments',
  'GET /transactions/:id/attachments',
  'GET /transactions/:id/attachments/:attachmentId',
  'GET /transactions/:id/attachments/:attachmentId/thumbnail',
  'DELETE /transactions/:id/attachments/:attachmentId',
]);

const routeKey = (route: { method: string; path: string }): string =>
  `${route.method} ${route.path}`;

const isMethod = (value: string): value is Method =>
  value === 'get' || value === 'post' || value === 'patch' || value === 'delete' || value === 'put';

describe('every route in the finance contract, called by a guest', () => {
  beforeEach(enforceAccess);

  it('names only routes the contract has, so the allowlist cannot outlive a rename', () => {
    const inContract = new Set(financeScopeMap.routes.map(routeKey));

    expect([...GUEST_ROUTES].filter((route) => !inContract.has(route))).toEqual([]);
    expect(financeScopeMap.routes.length).toBeGreaterThan(GUEST_ROUTES.size);
  });

  it('marks exactly the allowlisted routes as guest-capable', () => {
    const marked = financeScopeMap.routes.filter((route) => route.guest === true).map(routeKey);

    expect(marked.toSorted()).toEqual([...GUEST_ROUTES].toSorted());
  });

  it.each(financeScopeMap.routes.map((route) => [routeKey(route), route] as const))(
    '%s is refused unless allowlisted',
    async (key, route) => {
      const method = route.method.toLowerCase();
      if (!isMethod(method)) throw new Error(`unexpected method ${route.method}`);
      const path = route.path.replaceAll(/:[A-Za-z0-9_]+/gu, shared);

      const response = await call(method, path, { as: CARLOS });

      if (GUEST_ROUTES.has(key)) {
        expect([401, 403]).not.toContain(response.status);
      } else {
        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({
          code: 'finance.auth.forbidden',
          details: { principal: 'guest' },
        });
      }
    }
  );
});

describe('callers that are not guests', () => {
  const seesEverything = async (caller: Caller): Promise<void> => {
    const accounts = await get('/accounts', caller);
    const transactions = await get('/transactions', caller);
    const single = await get(`/transactions/${onPrivate}`, caller);
    const balance = await get(`/accounts/${privateAccount}/balance`, caller);
    const history = await get(`/accounts/${privateAccount}/history`, caller);
    const budgets = await get('/budgets', caller);

    expectEveryAccountAsOwner(accounts.body);
    expect(transactions.body.pagination.total).toBe(6);
    expect([single.status, balance.status, history.status, budgets.status]).toEqual([
      200, 200, 200, 200,
    ]);
    expect(history.body.pagination.total).toBe(3);
  };

  it('shows an API-key caller unfiltered data with Access enforced', async () => {
    enforceAccess();
    await seesEverything({ withKey: true });
  });

  it('shows a request with no credential unfiltered data with Access enforced', async () => {
    enforceAccess();
    await seesEverything({});
  });

  it('shows an API-key caller unfiltered data even beside a guest token', async () => {
    enforceAccess();
    await seesEverything({ withKey: true, as: ROSANE });
  });

  it('filters nobody while the operator list is unset, a would-be guest token included', async () => {
    await seesEverything({ as: ROSANE });
    await seesEverything({ as: STRANGER });
    await seesEverything({});
    await seesEverything({ withKey: true });
  });

  it('filters nobody with the operator list set but no Access team to verify against', async () => {
    vi.stubEnv('POPS_OPERATOR_EMAILS', OPERATOR);

    await seesEverything({ as: ROSANE });
  });
});
