/**
 * Integration tests for the transaction audit log over REST (POPS-5865): the
 * four transaction writes recording who made them, and the two history routes
 * reading that back. Real Express app, real SQLite file, real signed Access
 * tokens.
 *
 * The route tier is the cheapest one that sees the actor, because the actor is
 * whatever the scope gate resolved for the request.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ACCESS_JWT_HEADER } from '@pops/pillar-express';
import { createAccessJwtFixture } from '@pops/pillar-sdk/testing';

import { openFinanceDb, transactionsService, type OpenedFinanceDb } from '../../db/index.js';
import { createAccount } from '../../db/services/accounts.js';
import { createFinanceApiApp } from '../app.js';
import { makeContactsFake } from './contacts-fake.js';
import { requestOn } from './test-utils.js';

import type { ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const AUDIENCE = 'aud-under-test';
const access = createAccessJwtFixture({ audience: AUDIENCE });

const OPERATOR = 'owner@pops.test';
const GUEST = 'rosane@example.test';
const API_KEY = 'pops_sa_abcdefgh.a-secret-that-never-leaves-this-file';

const RAW_ROW = '{"Description":"TRATTORIA CARLTON 4821"}';
const CHECKSUM = 'chk-trattoria-4821';

const financeWideKey: ServiceAccountVerifier = () =>
  Promise.resolve({
    outcome: 'authenticated',
    principal: { id: 'sa_bfm', name: 'bfm', scopes: ['finance'] },
  });

let tmpDir: string;
let financeDb: OpenedFinanceDb;
let shared: string;
let other: string;

function enforceAccess(): void {
  vi.stubEnv('POPS_OPERATOR_EMAILS', OPERATOR);
  vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', access.teamName);
  vi.stubEnv('CLOUDFLARE_ACCESS_AUD', AUDIENCE);
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-transaction-history-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', access.fetchImpl);
  vi.stubEnv('POPS_OPERATOR_EMAILS', '');
  vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', '');
  vi.stubEnv('CLOUDFLARE_ACCESS_AUD', '');
  shared = createAccount(financeDb.db, { name: 'Shared', kind: 'checking', currency: 'AUD' }).id;
  other = createAccount(financeDb.db, { name: 'Other', kind: 'savings', currency: 'AUD' }).id;
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

const dinner = (overrides: object = {}) => ({
  description: 'Dinner',
  accountId: shared,
  amount: -80,
  date: '2026-02-10',
  type: 'purchase',
  ...overrides,
});

async function createDinner(caller: Caller = {}, overrides: object = {}): Promise<string> {
  const response = await call('post', '/transactions', caller, dinner(overrides));
  expect(response.status).toBe(201);
  return response.body.data.id;
}

const transactionHistory = (id: string, caller: Caller = {}) =>
  call('get', `/transactions/${id}/history`, caller);

const accountHistory = (id: string, caller: Caller = {}, query = '') =>
  call('get', `/accounts/${id}/history${query}`, caller);

const storedEventCount = (): unknown =>
  financeDb.raw.prepare('SELECT count(*) AS n FROM transaction_events').get();

interface EventBody {
  action: string;
  actorKind: string;
  actorEmail: string | null;
  accountId: string;
  transactionId: string;
  changed: string[];
}

const actions = (body: { data: EventBody[] }): string[] => body.data.map((event) => event.action);

describe('a deployment that has not been given the operator list', () => {
  it('lets every write through as today and records each as the operator', async () => {
    const id = await createDinner();
    const updated = await call('patch', `/transactions/${id}`, {}, { amount: -95 });
    const deleted = await call('delete', `/transactions/${id}`);
    const restored = await call('post', '/transactions/restore', {}, deleted.body.snapshot);

    expect([updated.status, deleted.status, restored.status]).toEqual([200, 200, 201]);

    const history = await transactionHistory(id);
    expect(history.status).toBe(200);
    expect(actions(history.body)).toEqual(['restore', 'delete', 'update', 'create']);
    for (const event of history.body.data as EventBody[]) {
      expect(event).toMatchObject({ actorKind: 'operator', actorEmail: null, transactionId: id });
    }
    expect(storedEventCount()).toEqual({ n: 4 });
  });

  it('refuses nobody: a token for an email that would be a guest writes and reads history', async () => {
    const id = await createDinner({ as: GUEST });

    const forTransaction = await transactionHistory(id, { as: GUEST });
    const forAccount = await accountHistory(shared, { as: GUEST });

    expect([forTransaction.status, forAccount.status]).toEqual([200, 200]);
    expect(forTransaction.body.data).toMatchObject([
      { action: 'create', actorKind: 'operator', actorEmail: null },
    ]);
  });

  it('refuses nobody with the operator list set but no Access team to verify against', async () => {
    vi.stubEnv('POPS_OPERATOR_EMAILS', OPERATOR);

    const id = await createDinner({ as: GUEST });
    expect((await transactionHistory(id, { as: GUEST })).status).toBe(200);
  });
});

describe('who a write is recorded as, with Access enforced', () => {
  beforeEach(enforceAccess);

  it('records the operator’s email on each of the four actions, one event apiece', async () => {
    const caller = { as: OPERATOR };
    const id = await createDinner(caller);
    expect(storedEventCount()).toEqual({ n: 1 });
    await call('patch', `/transactions/${id}`, caller, { notes: 'split three ways' });
    expect(storedEventCount()).toEqual({ n: 2 });
    const deleted = await call('delete', `/transactions/${id}`, caller);
    expect(storedEventCount()).toEqual({ n: 3 });
    await call('post', '/transactions/restore', caller, deleted.body.snapshot);
    expect(storedEventCount()).toEqual({ n: 4 });

    const history = await transactionHistory(id, caller);
    expect(history.body.data).toMatchObject([
      { action: 'restore', actorKind: 'operator', actorEmail: OPERATOR },
      { action: 'delete', actorKind: 'operator', actorEmail: OPERATOR },
      { action: 'update', actorKind: 'operator', actorEmail: OPERATOR },
      { action: 'create', actorKind: 'operator', actorEmail: OPERATOR },
    ]);
  });

  it('records an API-key caller as a service with no email', async () => {
    const id = await createDinner({ withKey: true });
    await call('patch', `/transactions/${id}`, { withKey: true }, { amount: -95 });

    const history = await transactionHistory(id, { withKey: true });
    expect(history.status).toBe(200);
    expect(history.body.data).toMatchObject([
      { action: 'update', actorKind: 'service', actorEmail: null },
      { action: 'create', actorKind: 'service', actorEmail: null },
    ]);
  });

  it('records a request with no credential as the operator with no email', async () => {
    const id = await createDinner();

    expect((await transactionHistory(id)).body.data).toMatchObject([
      { action: 'create', actorKind: 'operator', actorEmail: null },
    ]);
  });

  it('404s a guest with no grant on both history routes and 403s its write, which records nothing', async () => {
    const id = await createDinner({ as: OPERATOR });

    const responses = [
      await transactionHistory(id, { as: GUEST }),
      await accountHistory(shared, { as: GUEST }),
      await call('patch', `/transactions/${id}`, { as: GUEST }, { amount: -1 }),
    ];

    expect(responses.map((r) => r.status)).toEqual([404, 404, 403]);
    expect(responses[2]?.body).toMatchObject({
      code: 'finance.auth.forbidden',
      details: { principal: 'guest' },
    });
    expect(storedEventCount()).toEqual({ n: 1 });
  });
});

describe('a write the service refuses', () => {
  it('records nothing for a positive purchase, on create and on update', async () => {
    const refusedCreate = await call('post', '/transactions', {}, dinner({ amount: 80 }));
    expect(refusedCreate.status).toBe(400);
    expect(storedEventCount()).toEqual({ n: 0 });

    const id = await createDinner();
    const refusedUpdate = await call('patch', `/transactions/${id}`, {}, { amount: 80 });
    expect(refusedUpdate.status).toBe(400);

    expect(actions((await transactionHistory(id)).body)).toEqual(['create']);
  });

  it('records nothing for a write to a transaction that is not there', async () => {
    expect((await call('patch', '/transactions/no-such-id', {}, { amount: -1 })).status).toBe(404);
    expect((await call('delete', '/transactions/no-such-id')).status).toBe(404);
    expect(storedEventCount()).toEqual({ n: 0 });
  });
});

describe('what a history response carries', () => {
  it('shows the business fields either side of an update and names the ones that changed', async () => {
    const id = await createDinner({}, { notes: null, tags: ['venue:restaurant'] });
    await call('patch', `/transactions/${id}`, {}, { amount: -95.5, notes: 'split three ways' });

    const history = await transactionHistory(id);
    const [update, create] = history.body.data;

    const before = {
      accountId: shared,
      date: '2026-02-10',
      amount: -80,
      description: 'Dinner',
      type: 'purchase',
      notes: null,
      entityId: null,
      entityName: null,
      tags: ['venue:restaurant'],
    };
    expect(update).toEqual({
      id: expect.any(String),
      transactionId: id,
      accountId: shared,
      action: 'update',
      actorKind: 'operator',
      actorEmail: null,
      at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      before,
      after: { ...before, amount: -95.5, notes: 'split three ways' },
      changed: ['amount', 'notes'],
    });
    expect(create).toMatchObject({ action: 'create', before: null, after: before, changed: [] });
  });

  it('reports no changed field for an update that touches only what history does not show', async () => {
    const id = await createDinner();
    await call('patch', `/transactions/${id}`, {}, { location: 'Carlton' });

    const [update] = (await transactionHistory(id)).body.data;
    expect(update).toMatchObject({ action: 'update', changed: [] });
  });

  it('never returns rawRow, checksum or the match fields, though the snapshot holds them', async () => {
    const id = await createDinner({}, { rawRow: RAW_ROW, checksum: CHECKSUM });
    await call('patch', `/transactions/${id}`, {}, { entityName: 'Trattoria' });
    await call('delete', `/transactions/${id}`);

    const stored = financeDb.raw
      .prepare('SELECT before FROM transaction_events WHERE action = ?')
      .get('delete');
    expect(JSON.stringify(stored)).toContain(CHECKSUM);

    for (const response of [await transactionHistory(id), await accountHistory(shared)]) {
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(3);
      const text = JSON.stringify(response.body);
      for (const leaked of ['rawRow', 'checksum', 'matchType', 'matchRuleId', 'matchConfidence']) {
        expect(text).not.toContain(leaked);
      }
      expect(text).not.toContain(CHECKSUM);
      expect(text).not.toContain('TRATTORIA CARLTON 4821');
    }
  });
});

describe('GET /transactions/:id/history', () => {
  it('still answers for a deleted transaction', async () => {
    const id = await createDinner();
    await call('delete', `/transactions/${id}`);
    expect((await call('get', `/transactions/${id}`)).status).toBe(404);

    const history = await transactionHistory(id);
    expect(history.status).toBe(200);
    expect(actions(history.body)).toEqual(['delete', 'create']);
    expect(history.body.data[0]).toMatchObject({ after: null, before: { description: 'Dinner' } });
  });

  it('answers an empty list for a transaction no audited write has touched', async () => {
    const imported = transactionsService.createTransaction(financeDb.db, {
      description: 'Imported',
      accountId: shared,
      amountCents: -1_000,
      date: '2026-01-05',
    });

    const history = await transactionHistory(imported.id);
    expect(history.status).toBe(200);
    expect(history.body).toEqual({ data: [] });
  });

  it('404s an id with neither a row nor an event, in the error envelope', async () => {
    const history = await transactionHistory('no-such-transaction');

    expect(history.status).toBe(404);
    expect(history.body).toMatchObject({
      code: 'finance.resource.not_found',
      requestId: expect.any(String),
      retryable: false,
    });
  });

  it('has no route that writes, changes or removes an event', async () => {
    const id = await createDinner();
    const [event] = (await transactionHistory(id)).body.data;

    const attempts = [
      await call('post', `/transactions/${id}/history`, {}, {}),
      await call('put', `/transactions/${id}/history`, {}, {}),
      await call('patch', `/transactions/${id}/history`, {}, {}),
      await call('delete', `/transactions/${id}/history`),
      await call('delete', `/transactions/${id}/history/${event.id}`),
      await call('post', `/accounts/${shared}/history`, {}, {}),
      await call('delete', `/accounts/${shared}/history`),
      await call('delete', `/accounts/${shared}/history/${event.id}`),
    ];

    expect(attempts.map((r) => r.status)).toEqual([404, 404, 404, 404, 404, 404, 404, 404]);
    expect((await transactionHistory(id)).body.data).toEqual([event]);
  });
});

describe('GET /accounts/:id/history', () => {
  it('includes the events of a transaction that has since been deleted', async () => {
    const kept = await createDinner({}, { description: 'Kept' });
    const gone = await createDinner({}, { description: 'Gone' });
    await call('delete', `/transactions/${gone}`);

    const history = await accountHistory(shared);
    expect(history.status).toBe(200);
    expect(
      (history.body.data as EventBody[]).map((event) => [event.action, event.transactionId])
    ).toEqual([
      ['delete', gone],
      ['create', gone],
      ['create', kept],
    ]);
    expect(history.body.pagination).toEqual({ total: 3, limit: 50, offset: 0, hasMore: false });
  });

  it('shows a move in both account histories, filed under the new account', async () => {
    const id = await createDinner();
    await call('patch', `/transactions/${id}`, {}, { accountId: other });

    const fromOld = await accountHistory(shared);
    const fromNew = await accountHistory(other);

    const move = {
      action: 'update',
      transactionId: id,
      accountId: other,
      before: { accountId: shared },
      after: { accountId: other },
      changed: ['accountId'],
    };
    expect(fromOld.body.data).toMatchObject([move, { action: 'create', accountId: shared }]);
    expect(fromNew.body.data).toMatchObject([move]);
    expect(fromNew.body.pagination.total).toBe(1);
  });

  it('leaves another account’s events out', async () => {
    await createDinner();
    await createDinner({}, { accountId: other, description: 'Elsewhere' });

    const history = await accountHistory(other);
    expect(history.body.data).toMatchObject([{ after: { description: 'Elsewhere' } }]);
  });

  it('pages newest first, and says truthfully whether more remain at each boundary', async () => {
    const ids = [await createDinner(), await createDinner(), await createDinner()];
    const newestFirst = ids.toReversed();
    const idsOf = (body: { data: EventBody[] }) => body.data.map((e) => e.transactionId);

    const firstPage = await accountHistory(shared, {}, '?limit=2');
    expect(idsOf(firstPage.body)).toEqual(newestFirst.slice(0, 2));
    expect(firstPage.body.pagination).toEqual({ total: 3, limit: 2, offset: 0, hasMore: true });

    const lastPage = await accountHistory(shared, {}, '?limit=2&offset=2');
    expect(idsOf(lastPage.body)).toEqual(newestFirst.slice(2));
    expect(lastPage.body.pagination).toEqual({ total: 3, limit: 2, offset: 2, hasMore: false });

    const exact = await accountHistory(shared, {}, '?limit=3');
    expect(idsOf(exact.body)).toEqual(newestFirst);
    expect(exact.body.pagination.hasMore).toBe(false);

    const past = await accountHistory(shared, {}, '?limit=2&offset=3');
    expect(past.body).toEqual({
      data: [],
      pagination: { total: 3, limit: 2, offset: 3, hasMore: false },
    });
  });

  it.each(['?limit=0', '?limit=501', '?offset=-1', '?limit=abc'])('400s %s', async (query) => {
    const response = await accountHistory(shared, {}, query);
    expect(response.status).toBe(400);
  });

  it('404s an unknown account, and answers an empty page for one with no events', async () => {
    expect((await accountHistory('no-such-account')).status).toBe(404);
    expect((await accountHistory(other)).body).toEqual({
      data: [],
      pagination: { total: 0, limit: 50, offset: 0, hasMore: false },
    });
  });
});
