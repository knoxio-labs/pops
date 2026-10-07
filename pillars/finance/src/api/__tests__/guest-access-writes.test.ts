/**
 * Integration tests for what a guest may change in finance (POPS-5867): create,
 * update, delete and restore a transaction on an account they hold `edit` on,
 * and nothing anywhere else. Real Express app, real SQLite file, real signed
 * Access tokens.
 *
 * The route tier is the cheapest one that sees this, because the answer
 * depends on who the scope gate resolved the request to, on the grants table
 * and on the audit log together.
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
import { makeContactsFake } from './contacts-fake.js';
import { requestOn } from './test-utils.js';

import type { ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const AUDIENCE = 'aud-under-test';
const access = createAccessJwtFixture({ audience: AUDIENCE });

const OPERATOR = 'owner@pops.test';
/** Holds `view` on the shared account only. */
const ROSANE = 'rosane@example.test';
/** Holds `edit` on the shared account and their own, and `view` on the read-only one. */
const CARLOS = 'carlos@example.test';
const API_KEY = 'pops_sa_abcdefgh.a-secret-that-never-leaves-this-file';

const RAW_ROW = '{"Description":"PRIVATE BANK ROW 4821"}';
const CHECKSUM = 'chk-private-4821';
const NO_SUCH_ID = 'no-such-id';
const PRIVATE_DATA = /PRIVATE BANK ROW|chk-private/u;

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
/** Granted to Carlos (`view`) only. */
let readOnly: string;
/** Granted to nobody. */
let privateAccount: string;
let onShared: string;
let onReadOnly: string;
let onPrivate: string;

function enforceAccess(): void {
  vi.stubEnv('POPS_OPERATOR_EMAILS', OPERATOR);
  vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', access.teamName);
  vi.stubEnv('CLOUDFLARE_ACCESS_AUD', AUDIENCE);
}

/** Written without an actor, as an import writes: it leaves no event behind. */
function anEntry(accountId: string, description: string): string {
  return transactionsService.createTransaction(financeDb.db, {
    description,
    accountId,
    amountCents: -4200,
    date: '2026-03-01',
    type: 'purchase',
    tags: ['groceries'],
    rawRow: RAW_ROW,
    checksum: `${CHECKSUM}-${description}`,
  }).id;
}

function grant(email: string, accountId: string, role: 'view' | 'edit'): void {
  accountGrantsService.upsertGrant(financeDb.db, { accountId, email, role, actor: OPERATOR });
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-guest-access-writes-test-'));
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
  readOnly = account('Read only');
  privateAccount = account('Private');

  onShared = anEntry(shared, 'Groceries');
  onReadOnly = anEntry(readOnly, 'Pharmacy');
  onPrivate = anEntry(privateAccount, 'Mortgage');

  grant(ROSANE, shared, 'view');
  grant(CARLOS, shared, 'edit');
  grant(CARLOS, carlosOwn, 'edit');
  grant(CARLOS, readOnly, 'view');
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

type Method = 'get' | 'post' | 'patch' | 'delete';

function call(method: Method, path: string, caller: Caller, body?: object) {
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

const entryOn = (accountId: string, extra: object = {}) => ({
  description: 'Bakery',
  accountId,
  amount: -12.5,
  date: '2026-03-09',
  type: 'purchase',
  ...extra,
});

const create = (caller: Caller, accountId: string, extra: object = {}) =>
  call('post', '/transactions', caller, entryOn(accountId, extra));
const update = (caller: Caller, id: string, patch: object) =>
  call('patch', `/transactions/${id}`, caller, patch);
const remove = (caller: Caller, id: string) => call('delete', `/transactions/${id}`, caller);
const restore = (caller: Caller, snapshot: object) =>
  call('post', '/transactions/restore', caller, snapshot);

/** Every transaction row and every event, so "nothing was written" is one comparison. */
function ledger(): unknown {
  return {
    transactions: financeDb.raw.prepare('SELECT * FROM transactions ORDER BY id').all(),
    events: financeDb.raw.prepare('SELECT * FROM transaction_events ORDER BY rowid').all(),
  };
}

interface StoredRow {
  id: string;
  account_id: string;
  description: string;
  amount_cents: number;
  tags: string;
  raw_row: string | null;
  checksum: string | null;
  entity_id: string | null;
}

function stored(id: string): StoredRow | undefined {
  // The driver types a row as unknown; the columns are the schema's.
  const row: unknown = financeDb.raw.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  return isStoredRow(row) ? row : undefined;
}

function isStoredRow(row: unknown): row is StoredRow {
  return typeof row === 'object' && row !== null && 'account_id' in row && 'raw_row' in row;
}

function eventsOf(id: string): unknown[] {
  return financeDb.raw
    .prepare(
      'SELECT action, actor_kind, actor_email, account_id FROM transaction_events ' +
        'WHERE transaction_id = ? ORDER BY rowid'
    )
    .all(id);
}

/** A complete restore body for `id`, with every field the caller chooses to forge. */
const snapshotFor = (id: string, forged: object = {}) => ({
  id,
  notionId: null,
  description: 'Groceries',
  accountId: shared,
  amount: -42,
  date: '2026-03-01',
  type: 'purchase',
  tags: '["groceries"]',
  entityId: null,
  entityName: null,
  location: null,
  country: null,
  relatedTransactionId: null,
  notes: null,
  foreignAmountMinor: null,
  foreignCurrency: null,
  fxFeeCents: null,
  fxCaptureSource: null,
  checksum: null,
  rawRow: null,
  lastEditedTime: '2026-03-01T00:00:00.000Z',
  matchType: null,
  matchRuleId: null,
  matchConfidence: null,
  ...forged,
});

/** The parts of a refusal a caller could tell two ids apart by, with the id itself taken out. */
function refusal(response: { status: number; body: Record<string, unknown> }, id: string) {
  const { requestId: _requestId, ...rest } = response.body;
  return { status: response.status, body: JSON.parse(JSON.stringify(rest).replaceAll(id, ':id')) };
}

/** Delete as the operator through the route, so the log holds a delete event to restore from. */
async function deletedByOperator(id: string): Promise<void> {
  expect((await remove({ as: OPERATOR }, id)).status).toBe(200);
}

describe('a guest holding edit, with Access enforced', () => {
  beforeEach(enforceAccess);

  it('creates an entry on the account and is recorded as its author', async () => {
    const response = await create({ as: CARLOS }, shared, { notes: 'for the weekend' });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      accountId: shared,
      amount: -12.5,
      notes: 'for the weekend',
      tags: [],
    });
    expect(stored(response.body.data.id)).toMatchObject({
      account_id: shared,
      amount_cents: -1250,
    });
    expect(eventsOf(response.body.data.id)).toEqual([
      { action: 'create', actor_kind: 'guest', actor_email: CARLOS, account_id: shared },
    ]);
  });

  it('accepts the empty tag list the create schema fills in for an absent one', async () => {
    expect((await create({ as: CARLOS }, shared, { tags: [] })).status).toBe(201);
  });

  it('changes an entry and never echoes the import row it was built from', async () => {
    const response = await update({ as: CARLOS }, onShared, { amount: -50, notes: 'corrected' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: onShared, amount: -50, notes: 'corrected' });
    expect(response.text).not.toMatch(PRIVATE_DATA);
    expect(stored(onShared)).toMatchObject({ amount_cents: -5000, raw_row: RAW_ROW });
    expect(eventsOf(onShared)).toEqual([
      { action: 'update', actor_kind: 'guest', actor_email: CARLOS, account_id: shared },
    ]);
  });

  it('moves an entry between two accounts it holds edit on', async () => {
    const response = await update({ as: CARLOS }, onShared, { accountId: carlosOwn });

    expect(response.status).toBe(200);
    expect(stored(onShared)?.account_id).toBe(carlosOwn);
  });

  it('deletes an entry and is handed a snapshot without the raw row or checksum', async () => {
    const asGuest = await remove({ as: CARLOS }, onShared);

    expect(asGuest.status).toBe(200);
    expect(asGuest.body.snapshot).toMatchObject({ id: onShared, rawRow: null, checksum: null });
    expect(asGuest.text).not.toMatch(PRIVATE_DATA);
    expect(stored(onShared)).toBeUndefined();
    expect(eventsOf(onShared)).toEqual([
      { action: 'delete', actor_kind: 'guest', actor_email: CARLOS, account_id: shared },
    ]);
  });

  it('restores its own delete with the raw row and checksum the snapshot left out', async () => {
    const deleted = await remove({ as: CARLOS }, onShared);

    const response = await restore({ as: CARLOS }, deleted.body.snapshot);

    expect(response.status).toBe(201);
    expect(response.text).not.toMatch(PRIVATE_DATA);
    expect(stored(onShared)).toMatchObject({
      account_id: shared,
      raw_row: RAW_ROW,
      checksum: `${CHECKSUM}-Groceries`,
      tags: '["groceries"]',
    });
    expect(eventsOf(onShared).at(-1)).toEqual({
      action: 'restore',
      actor_kind: 'guest',
      actor_email: CARLOS,
      account_id: shared,
    });
  });

  it('still refuses a positive purchase', async () => {
    const before = ledger();

    const response = await create({ as: CARLOS }, shared, { amount: 12.5 });

    expect(response.status).toBe(400);
    expect(ledger()).toEqual(before);
  });
});

describe('a guest holding view, with Access enforced', () => {
  beforeEach(enforceAccess);

  it.each([
    ['create', () => create({ as: ROSANE }, shared)],
    ['update', () => update({ as: ROSANE }, onShared, { notes: 'mine now' })],
    ['delete', () => remove({ as: ROSANE }, onShared)],
  ] as const)('is forbidden to %s and changes nothing', async (_action, attempt) => {
    const before = ledger();

    const response = await attempt();

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'finance.resource.forbidden' });
    expect(ledger()).toEqual(before);
  });

  it('is forbidden to restore an entry deleted from the account', async () => {
    await deletedByOperator(onShared);
    const before = ledger();

    const response = await restore({ as: ROSANE }, snapshotFor(onShared));

    expect(response.status).toBe(403);
    expect(ledger()).toEqual(before);
  });
});

describe('a guest with no grant on the account, with Access enforced', () => {
  beforeEach(enforceAccess);

  it('is told an ungranted account is missing when creating on it', async () => {
    const before = ledger();

    const ungranted = await create({ as: ROSANE }, privateAccount);
    const anotherGuests = await create({ as: ROSANE }, carlosOwn);
    const missing = await create({ as: ROSANE }, NO_SUCH_ID);

    expect(missing.status).toBe(404);
    expect(refusal(ungranted, privateAccount)).toEqual(refusal(missing, NO_SUCH_ID));
    expect(refusal(anotherGuests, carlosOwn)).toEqual(refusal(missing, NO_SUCH_ID));
    expect(ledger()).toEqual(before);
  });

  it.each([
    ['update', (id: string) => update({ as: ROSANE }, id, { notes: 'mine now' })],
    ['delete', (id: string) => remove({ as: ROSANE }, id)],
  ] as const)(
    'is told the entry is missing on %s, exactly as for an id that never existed',
    async (_action, attempt) => {
      const before = ledger();

      const ungranted = await attempt(onPrivate);
      const missing = await attempt(NO_SUCH_ID);

      expect(missing.status).toBe(404);
      expect(refusal(ungranted, onPrivate)).toEqual(refusal(missing, NO_SUCH_ID));
      expect(ledger()).toEqual(before);
    }
  );

  it('is told a deleted entry is missing on restore, even when the body claims a granted account', async () => {
    await deletedByOperator(onPrivate);
    const before = ledger();

    const ungranted = await restore({ as: CARLOS }, snapshotFor(onPrivate, { accountId: shared }));
    const missing = await restore({ as: CARLOS }, snapshotFor(NO_SUCH_ID));

    expect(missing.status).toBe(404);
    expect(refusal(ungranted, onPrivate)).toEqual(refusal(missing, NO_SUCH_ID));
    expect(ledger()).toEqual(before);
  });
});

describe('moving an entry with edit on one side only, with Access enforced', () => {
  beforeEach(enforceAccess);

  it.each([
    ['to a view-only account', () => [onShared, readOnly, 403] as const],
    ['to an ungranted account', () => [onShared, privateAccount, 404] as const],
    ['to an account that does not exist', () => [onShared, NO_SUCH_ID, 404] as const],
    ['from a view-only account', () => [onReadOnly, shared, 403] as const],
    ['from an ungranted account', () => [onPrivate, shared, 404] as const],
  ])('refuses a move %s and leaves the entry where it was', async (_name, scenario) => {
    const [id, target, status] = scenario();
    const before = ledger();

    const response = await update({ as: CARLOS }, id, { accountId: target });

    expect(response.status).toBe(status);
    expect(ledger()).toEqual(before);
  });

  it('words a move to an ungranted account as it does one to a missing account', async () => {
    const ungranted = await update({ as: CARLOS }, onShared, { accountId: privateAccount });
    const missing = await update({ as: CARLOS }, onShared, { accountId: NO_SUCH_ID });

    expect(refusal(ungranted, privateAccount)).toEqual(refusal(missing, NO_SUCH_ID));
  });
});

describe('the fields that stay the operator’s, with Access enforced', () => {
  beforeEach(enforceAccess);

  it.each([
    ['relatedTransactionId', { relatedTransactionId: 'another-entry' }],
    ['entityId', { entityId: 'contact-1' }],
    ['entityName', { entityName: 'Woolworths' }],
    ['tags', { tags: ['groceries'] }],
    ['rawRow', { rawRow: '{"forged":true}' }],
    ['checksum', { checksum: 'forged' }],
  ])('refuses %s on a guest create and writes nothing', async (field, extra) => {
    const before = ledger();

    const response = await create({ as: CARLOS }, shared, extra);

    expect(response.status).toBe(400);
    expect(response.body.message).toContain(field);
    expect(ledger()).toEqual(before);
  });

  it.each([
    ['relatedTransactionId', { relatedTransactionId: 'another-entry' }],
    ['relatedTransactionId cleared', { relatedTransactionId: null }],
    ['entityId', { entityId: 'contact-1' }],
    ['entityId cleared', { entityId: null }],
    ['entityName', { entityName: 'Woolworths' }],
    ['tags', { tags: ['dining'] }],
    ['tags cleared', { tags: [] }],
  ])('refuses %s on a guest update and writes nothing', async (name, patch) => {
    const before = ledger();

    const response = await update({ as: CARLOS }, onShared, { notes: 'allowed', ...patch });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain(name.replace(' cleared', ''));
    expect(ledger()).toEqual(before);
  });

  it('names every refused field at once', async () => {
    const response = await create({ as: CARLOS }, shared, { tags: ['dining'], checksum: 'x' });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/tags, checksum/u);
  });

  it('answers 404 rather than 400 when the account is not the guest’s to write to', async () => {
    const response = await create({ as: CARLOS }, privateAccount, { tags: ['dining'] });

    expect(response.status).toBe(404);
  });
});

describe('a guest restore, with Access enforced', () => {
  beforeEach(enforceAccess);

  it('rebuilds the entry from the delete event even when the body is forged', async () => {
    await deletedByOperator(onShared);

    const response = await restore(
      { as: CARLOS },
      snapshotFor(onShared, {
        accountId: carlosOwn,
        amount: 99_999,
        type: 'income',
        description: 'Forged windfall',
        tags: '["forged"]',
        entityId: 'contact-forged',
        rawRow: '{"forged":true}',
        checksum: 'forged',
      })
    );

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      id: onShared,
      accountId: shared,
      amount: -42,
      description: 'Groceries',
      tags: ['groceries'],
      entityId: null,
    });
    expect(stored(onShared)).toMatchObject({
      account_id: shared,
      amount_cents: -4200,
      raw_row: RAW_ROW,
      checksum: `${CHECKSUM}-Groceries`,
    });
  });

  it('404s an entry that is still there, because nothing deleted it', async () => {
    const before = ledger();

    const response = await restore({ as: CARLOS }, snapshotFor(onShared));

    expect(response.status).toBe(404);
    expect(ledger()).toEqual(before);
  });

  it('404s an entry deleted without a recorded event, which the operator may still restore', async () => {
    const row = transactionsService.deleteTransaction(financeDb.db, onShared);
    const before = ledger();

    const asGuest = await restore({ as: CARLOS }, snapshotFor(onShared));

    expect(asGuest.status).toBe(404);
    expect(ledger()).toEqual(before);
    expect((await restore({ as: OPERATOR }, snapshotFor(row.id))).status).toBe(201);
  });

  it('conflicts when the entry has already been restored', async () => {
    await deletedByOperator(onShared);
    expect((await restore({ as: CARLOS }, snapshotFor(onShared))).status).toBe(201);
    const before = ledger();

    const again = await restore({ as: CARLOS }, snapshotFor(onShared));

    expect(again.status).toBe(409);
    expect(ledger()).toEqual(before);
  });

  it('goes by the latest delete, so an entry last deleted from an ungranted account stays gone', async () => {
    await deletedByOperator(onShared);
    expect((await restore({ as: CARLOS }, snapshotFor(onShared))).status).toBe(201);
    expect((await update({ as: OPERATOR }, onShared, { accountId: privateAccount })).status).toBe(
      200
    );
    await deletedByOperator(onShared);
    const before = ledger();

    const response = await restore({ as: CARLOS }, snapshotFor(onShared));

    expect(response.status).toBe(404);
    expect(ledger()).toEqual(before);
  });
});

describe('a guest saving a repayment, with Access enforced (POPS-5868)', () => {
  beforeEach(enforceAccess);

  /** The bank leg of a repayment, on an account the guest was never granted. */
  function bankCredit(): string {
    return transactionsService.createTransaction(financeDb.db, {
      description: 'OSKO FROM CARLOS',
      accountId: privateAccount,
      amountCents: 1250,
      date: '2026-03-09',
      type: 'transfer',
      rawRow: RAW_ROW,
      checksum: CHECKSUM,
    }).id;
  }

  const relatedOf = (id: string) =>
    financeDb.raw.prepare('SELECT related_transaction_id FROM transactions WHERE id = ?').get(id);

  it('pairs the entry with the bank leg, names it, and still cannot read it', async () => {
    vi.stubEnv('FINANCE_TRANSFER_PAIR_ENABLED', 'true');
    const bank = bankCredit();

    const response = await create({ as: CARLOS }, shared, { type: 'transfer' });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ accountId: shared, relatedTransactionId: bank });
    expect(JSON.stringify(response.body)).not.toMatch(PRIVATE_DATA);
    expect(relatedOf(bank)).toEqual({ related_transaction_id: response.body.data.id });

    const counterpart = await call('get', `/transactions/${bank}`, { as: CARLOS });
    expect(counterpart.status).toBe(404);
    expect(JSON.stringify(counterpart.body)).not.toMatch(PRIVATE_DATA);
  });

  it('pairs when the guest retypes their own entry to a transfer', async () => {
    vi.stubEnv('FINANCE_TRANSFER_PAIR_ENABLED', 'true');
    const bank = bankCredit();
    const created = await create({ as: CARLOS }, shared);

    const response = await update({ as: CARLOS }, created.body.data.id, { type: 'transfer' });

    expect(response.status).toBe(200);
    expect(response.body.data.relatedTransactionId).toBe(bank);
  });

  it('pairs nothing for a guest refused the write', async () => {
    vi.stubEnv('FINANCE_TRANSFER_PAIR_ENABLED', 'true');
    const bank = bankCredit();

    expect((await create({ as: ROSANE }, shared, { type: 'transfer' })).status).toBe(403);
    expect(relatedOf(bank)).toEqual({ related_transaction_id: null });
  });

  it('leaves the entry unpaired while the pairing flag is unset', async () => {
    vi.stubEnv('FINANCE_TRANSFER_PAIR_ENABLED', '');
    const bank = bankCredit();

    const response = await create({ as: CARLOS }, shared, { type: 'transfer' });

    expect(response.status).toBe(201);
    expect(response.body.data.relatedTransactionId).toBeNull();
    expect(relatedOf(bank)).toEqual({ related_transaction_id: null });
  });
});

describe('a route that stays the operator’s, with Access enforced', () => {
  beforeEach(enforceAccess);

  it('refuses a guest unlinking a transfer on an account they hold edit on', async () => {
    const before = ledger();

    const response = await call('post', `/transactions/${onShared}/unlink-transfer`, {
      as: CARLOS,
    });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'finance.auth.forbidden' });
    expect(ledger()).toEqual(before);
  });
});

describe('callers that are not guests', () => {
  /**
   * Everything a guest is refused, done on an account nobody was granted: the
   * operator-only fields on create and update, a move, a delete whose snapshot
   * keeps the import row, and a restore that trusts the body.
   */
  const writesFreely = async (caller: Caller, actor: object): Promise<void> => {
    const created = await create(caller, privateAccount, {
      tags: ['groceries'],
      entityId: 'contact-1',
      entityName: 'Woolworths',
      relatedTransactionId: onShared,
      rawRow: RAW_ROW,
      checksum: CHECKSUM,
    });
    expect(created.status).toBe(201);
    const id: string = created.body.data.id;
    expect(stored(id)).toMatchObject({ raw_row: RAW_ROW, checksum: CHECKSUM });

    const updated = await update(caller, id, { tags: [], entityId: null, accountId: readOnly });
    expect(updated.status).toBe(200);
    expect(stored(id)).toMatchObject({ tags: '[]', entity_id: null, account_id: readOnly });

    const deleted = await remove(caller, id);
    expect(deleted.status).toBe(200);
    expect(deleted.body.snapshot).toMatchObject({ rawRow: RAW_ROW, checksum: CHECKSUM });

    const restored = await restore(caller, { ...deleted.body.snapshot, description: 'From body' });
    expect(restored.status).toBe(201);
    expect(stored(id)).toMatchObject({ description: 'From body', raw_row: RAW_ROW });

    const unlinked = await call('post', `/transactions/${id}/unlink-transfer`, caller);
    expect(unlinked.status).toBe(200);

    expect(eventsOf(id)).toEqual(
      ['create', 'update', 'delete', 'restore'].map((action) =>
        expect.objectContaining({ action, ...actor })
      )
    );
  };

  it('lets the operator write as before with Access enforced', async () => {
    enforceAccess();
    await writesFreely({ as: OPERATOR }, { actor_kind: 'operator', actor_email: OPERATOR });
  });

  it('lets an API-key caller write as before with Access enforced', async () => {
    enforceAccess();
    await writesFreely({ withKey: true }, { actor_kind: 'service', actor_email: null });
  });

  it('lets a request with no credential write as before with Access enforced', async () => {
    enforceAccess();
    await writesFreely({}, { actor_kind: 'operator', actor_email: null });
  });

  it('restricts nobody while the operator list is unset, a would-be guest token included', async () => {
    await writesFreely({ as: ROSANE }, { actor_kind: 'operator' });
    await writesFreely({}, { actor_kind: 'operator' });
    await writesFreely({ withKey: true }, { actor_kind: 'service' });
  });

  it('restricts nobody with the operator list set but no Access team to verify against', async () => {
    vi.stubEnv('POPS_OPERATOR_EMAILS', OPERATOR);

    await writesFreely({ as: ROSANE }, { actor_kind: 'operator' });
  });
});
