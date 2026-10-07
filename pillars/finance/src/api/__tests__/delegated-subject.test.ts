/**
 * Integration tests for a guest identity delegated to finance by a service
 * account (POPS-5881): bfm calls with its own key and names the guest whose
 * phone it is serving. Real Express app, real SQLite file, real signed Access
 * tokens.
 *
 * The route tier is the cheapest one that sees this, because the answer
 * depends on the scope gate, the grants table and the audit log together.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ACCESS_JWT_HEADER, DELEGATED_SUBJECT_HEADER } from '@pops/pillar-express';
import { createAccessJwtFixture } from '@pops/pillar-sdk/testing';

import {
  accountGrantsService,
  openFinanceDb,
  transactionsService,
  type OpenedFinanceDb,
} from '../../db/index.js';
import { createAccount } from '../../db/services/accounts.js';
import { createFinanceApiApp } from '../app.js';
import { FINANCE_DELEGATED_SUBJECT_SCOPE } from '../middleware/service-account-scope.js';
import { makeContactsFake } from './contacts-fake.js';
import { requestOn } from './test-utils.js';

import type { ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const AUDIENCE = 'aud-under-test';
const access = createAccessJwtFixture({ audience: AUDIENCE });

const OPERATOR = 'owner@pops.test';
/** Holds `view` on the shared account only. */
const ROSANE = 'rosane@example.test';
/** Holds `edit` on the shared account. */
const CARLOS = 'carlos@example.test';
const API_KEY = 'pops_sa_abcdefgh.a-secret-that-never-leaves-this-file';

const RAW_ROW = '{"Description":"PRIVATE BANK ROW 4821"}';

/** What bfm holds once it may speak for a guest: its existing grant plus the delegation scope. */
const DELEGATING = ['finance.transactions', 'finance.accounts', FINANCE_DELEGATED_SUBJECT_SCOPE];
/** What bfm holds today. */
const NOT_DELEGATING = ['finance.transactions', 'finance.accounts'];

const keyHolding =
  (scopes: readonly string[]): ServiceAccountVerifier =>
  () =>
    Promise.resolve({ outcome: 'authenticated', principal: { id: 'sa_bfm', name: 'bfm', scopes } });

let tmpDir: string;
let financeDb: OpenedFinanceDb;
/** Granted to Rosane (`view`) and Carlos (`edit`). */
let shared: string;
/** Granted to nobody. */
let privateAccount: string;
let onShared: string;
let onPrivate: string;

function enforceAccess(): void {
  vi.stubEnv('POPS_OPERATOR_EMAILS', OPERATOR);
  vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', access.teamName);
  vi.stubEnv('CLOUDFLARE_ACCESS_AUD', AUDIENCE);
}

function anEntry(accountId: string, description: string): string {
  return transactionsService.createTransaction(financeDb.db, {
    description,
    accountId,
    amountCents: -4200,
    date: '2026-03-01',
    type: 'purchase',
    rawRow: RAW_ROW,
    checksum: `chk-${description}`,
  }).id;
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-delegated-subject-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', access.fetchImpl);
  vi.stubEnv('POPS_OPERATOR_EMAILS', '');
  vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', '');
  vi.stubEnv('CLOUDFLARE_ACCESS_AUD', '');

  const account = (name: string) =>
    createAccount(financeDb.db, { name, kind: 'checking', currency: 'AUD' }).id;
  shared = account('Shared');
  privateAccount = account('Private');
  onShared = anEntry(shared, 'Groceries');
  onPrivate = anEntry(privateAccount, 'Mortgage');

  const grant = (email: string, role: 'view' | 'edit') =>
    accountGrantsService.upsertGrant(financeDb.db, {
      accountId: shared,
      email,
      role,
      actor: OPERATOR,
    });
  grant(ROSANE, 'view');
  grant(CARLOS, 'edit');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

interface Caller {
  /** Scopes the presented key resolves to. Omitted, no key is presented. */
  readonly key?: readonly string[];
  /** Value of the subject header. Omitted, none is sent. */
  readonly subject?: string;
  /** Email to sign an Access token for, as a browser session carries. */
  readonly session?: string;
}

type Method = 'get' | 'post' | 'patch' | 'delete';

function call(method: Method, path: string, caller: Caller, body?: object) {
  const app = createFinanceApiApp({
    financeDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3004',
    contacts: makeContactsFake(),
    serviceAccountVerifier: keyHolding(caller.key ?? []),
  });
  return requestOn(app, (agent) => {
    let req = agent[method](path);
    if (caller.key !== undefined) req = req.set('x-api-key', API_KEY);
    if (caller.subject !== undefined) req = req.set(DELEGATED_SUBJECT_HEADER, caller.subject);
    if (caller.session !== undefined) {
      req = req.set(ACCESS_JWT_HEADER, access.signForEmail(caller.session));
    }
    return body === undefined ? req : req.send(body);
  });
}

const onBehalfOf = (email: string): Caller => ({ key: DELEGATING, subject: email });

const entryOn = (accountId: string) => ({
  description: 'Bakery',
  accountId,
  amount: -12.5,
  date: '2026-03-09',
  type: 'purchase',
});

function ledger(): unknown {
  return {
    transactions: financeDb.raw.prepare('SELECT * FROM transactions ORDER BY id').all(),
    events: financeDb.raw.prepare('SELECT * FROM transaction_events ORDER BY rowid').all(),
  };
}

function eventsOf(id: string): unknown[] {
  return financeDb.raw
    .prepare(
      'SELECT action, actor_kind, actor_email FROM transaction_events ' +
        'WHERE transaction_id = ? ORDER BY rowid'
    )
    .all(id);
}

const ids = (response: { body: { data: { id: string }[] } }): string[] =>
  response.body.data.map((row) => row.id);

describe.each([
  ['while the operator list is unset', false],
  ['with Access enforced', true],
])('a call delegated by a key holding the scope, %s', (_label, enforced) => {
  beforeEach(() => {
    if (enforced) enforceAccess();
  });

  it('lists only the accounts granted to the named guest, with the role held', async () => {
    const response = await call('get', '/accounts', onBehalfOf(ROSANE));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      expect.objectContaining({ id: shared, viewerRole: 'view' }),
    ]);
  });

  it('lists only transactions on granted accounts', async () => {
    const response = await call('get', '/transactions', onBehalfOf(ROSANE));

    expect(response.status).toBe(200);
    expect(ids(response)).toEqual([onShared]);
  });

  it('withholds the import row from a delete snapshot a service caller is shown whole', async () => {
    const asGuest = await call('delete', `/transactions/${onShared}`, onBehalfOf(CARLOS));
    const asService = await call('delete', `/transactions/${onPrivate}`, { key: DELEGATING });

    expect([asGuest.status, asService.status]).toEqual([200, 200]);
    expect(asService.body.snapshot.rawRow).toBe(RAW_ROW);
    expect(asGuest.body.snapshot).toMatchObject({ id: onShared, rawRow: null, checksum: null });
    expect(asGuest.text).not.toContain('PRIVATE BANK ROW');
  });

  it('answers an ungranted transaction or account as a missing one', async () => {
    const transaction = await call('get', `/transactions/${onPrivate}`, onBehalfOf(ROSANE));
    const account = await call('get', `/accounts/${privateAccount}`, onBehalfOf(ROSANE));

    expect([transaction.status, account.status]).toEqual([404, 404]);
  });

  it('shows a guest with no grant nothing rather than everything', async () => {
    const response = await call('get', '/transactions', onBehalfOf('stranger@example.test'));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it('matches the grant whatever the case or padding of the header', async () => {
    const response = await call('get', '/transactions', onBehalfOf('  Rosane@Example.Test '));

    expect(ids(response)).toEqual([onShared]);
  });

  it.each([
    ['get', '/budgets'],
    ['get', '/wishlist'],
    ['post', '/transactions/any-id/unlink-transfer'],
    ['post', '/accounts'],
  ] as const)('is 403 on %s %s, which no guest may reach', async (method, path) => {
    const before = ledger();
    const response = await call(method, path, { key: ['finance'], subject: CARLOS });
    const asService = await call('get', '/budgets', { key: ['finance'] });

    expect(asService.status).toBe(200);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'finance.auth.forbidden',
      details: { principal: 'guest' },
    });
    expect(ledger()).toEqual(before);
  });

  it('records the delegated email as a guest actor on a write', async () => {
    const created = await call('post', '/transactions', onBehalfOf(' Carlos@Example.Test'), {
      ...entryOn(shared),
    });
    expect(created.status).toBe(201);
    const id: string = created.body.data.id;
    const updated = await call('patch', `/transactions/${id}`, onBehalfOf(CARLOS), {
      notes: 'split later',
    });
    const deleted = await call('delete', `/transactions/${id}`, onBehalfOf(CARLOS));

    expect([updated.status, deleted.status]).toEqual([200, 200]);
    expect(eventsOf(id)).toEqual(
      ['create', 'update', 'delete'].map((action) => ({
        action,
        actor_kind: 'guest',
        actor_email: CARLOS,
      }))
    );
  });

  it('holds a delegated write to the guest role: view is 403, ungranted is 404', async () => {
    const before = ledger();
    const viewOnly = await call('post', '/transactions', onBehalfOf(ROSANE), entryOn(shared));
    const ungranted = await call(
      'post',
      '/transactions',
      onBehalfOf(CARLOS),
      entryOn(privateAccount)
    );

    expect([viewOnly.status, ungranted.status]).toEqual([403, 404]);
    expect(ledger()).toEqual(before);
  });

  it('refuses a delegated write the fields a guest may not set', async () => {
    const before = ledger();
    const response = await call('post', '/transactions', onBehalfOf(CARLOS), {
      ...entryOn(shared),
      tags: ['groceries'],
    });

    expect(response.status).toBe(400);
    expect(ledger()).toEqual(before);
  });
});

describe('a subject header from a caller that may not delegate', () => {
  it('is 403 from a key without the scope, though the key reaches the route itself', async () => {
    const withHeader = await call('get', '/transactions', {
      key: NOT_DELEGATING,
      subject: ROSANE,
    });
    const without = await call('get', '/transactions', { key: NOT_DELEGATING });

    expect(without.status).toBe(200);
    expect(withHeader.status).toBe(403);
    expect(withHeader.body).toMatchObject({
      code: 'finance.auth.forbidden',
      details: { requiredScope: FINANCE_DELEGATED_SUBJECT_SCOPE },
    });
  });

  it('is 403 on a write and writes nothing', async () => {
    const before = ledger();
    const response = await call(
      'post',
      '/transactions',
      { key: NOT_DELEGATING, subject: CARLOS },
      entryOn(shared)
    );

    expect(response.status).toBe(403);
    expect(ledger()).toEqual(before);
  });

  it.each([
    ['the operator', OPERATOR],
    ['a guest naming themselves', ROSANE],
    ['a guest naming someone with more access', CARLOS],
  ])('is 403 from a browser session of %s with Access enforced', async (_label, subject) => {
    enforceAccess();
    const session = subject === OPERATOR ? OPERATOR : ROSANE;
    const response = await call('get', '/transactions', { session, subject });

    expect(response.status).toBe(403);
    expect(response.body.details).toEqual({ requiredScope: FINANCE_DELEGATED_SUBJECT_SCOPE });
  });

  it.each([
    ['while the operator list is unset', false],
    ['with Access enforced', true],
  ])('is 403 from a request with no key and no session, %s', async (_label, enforced) => {
    if (enforced) enforceAccess();
    const response = await call('get', '/transactions', { subject: ROSANE });

    expect(response.status).toBe(403);
  });
});

describe('a malformed delegated subject', () => {
  it.each([
    ['empty', ''],
    ['not an address', 'rosane'],
    ['two addresses', `${ROSANE}, ${CARLOS}`],
  ])('is 400 in the error envelope when it is %s', async (_label, subject) => {
    const before = ledger();
    const response = await call('get', '/transactions', { key: DELEGATING, subject });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'finance.auth.subject_invalid',
      message: expect.any(String),
      requestId: expect.any(String),
      retryable: false,
      details: { header: DELEGATED_SUBJECT_HEADER },
    });
    expect(ledger()).toEqual(before);
  });
});

describe('a call with no subject header', () => {
  it.each([
    ['while the operator list is unset', false],
    ['with Access enforced', true],
  ])('leaves a delegating key a service that sees every account, %s', async (_label, enforced) => {
    if (enforced) enforceAccess();
    const caller: Caller = { key: DELEGATING };
    const transactions = await call('get', '/transactions', caller);
    const accounts = await call('get', '/accounts', caller);

    expect(ids(transactions).toSorted()).toEqual([onShared, onPrivate].toSorted());
    expect(ids(accounts)).toEqual(expect.arrayContaining([shared, privateAccount]));
  });

  it('records a write by a delegating key as the service, with no email', async () => {
    const created = await call(
      'post',
      '/transactions',
      { key: DELEGATING },
      { ...entryOn(privateAccount), tags: ['groceries'] }
    );

    expect(created.status).toBe(201);
    expect(eventsOf(created.body.data.id)).toEqual([
      { action: 'create', actor_kind: 'service', actor_email: null },
    ]);
  });

  it('leaves a keyless request the operator while the operator list is unset', async () => {
    const response = await call('get', '/transactions', { session: ROSANE });

    expect(response.status).toBe(200);
    expect(ids(response).toSorted()).toEqual([onShared, onPrivate].toSorted());
  });
});
