/**
 * Integration tests for the `accounts/:id/checkpoints` and
 * `accounts/:id/balance*` REST surface (POPS-2880, ADR-051).
 *
 * These exist at the route tier because three of the rules only exist there:
 * a future `asOf` and an archived account are refusals about what a person may
 * assert, and the 409 on deleting a machine-sourced checkpoint is a status
 * code the service layer has no opinion about.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import { insertCheckpoint } from '../../db/services/account-checkpoints.js';
import { createFinanceApiApp } from '../app.js';
import { makeContactsFake } from './contacts-fake.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-checkpoints-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createFinanceApiApp({
      financeDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3004',
      contacts: makeContactsFake(),
    })
  );
}

async function anAccount(name = 'Everyday', kind = 'checking') {
  const created = await client().accounts.create({ name, kind, currency: 'AUD' });
  return created.data.id;
}

describe('POST /accounts/:id/checkpoints', () => {
  it('records a manual checkpoint and echoes it back with no delta to measure', async () => {
    const id = await anAccount();

    const created = await client().checkpoints.create(id, {
      balanceCents: 428_140,
      asOf: '2026-09-01',
      note: 'Read off the app',
    });

    expect(created.data).toMatchObject({
      accountId: id,
      balanceCents: 428_140,
      asOf: '2026-09-01',
      source: 'manual',
      sourceRef: null,
      note: 'Read off the app',
      expectedBalanceCents: null,
      deltaCents: null,
    });
  });

  it('keeps a negative balance negative — the wire never translates to amount owed', async () => {
    const id = await anAccount('Amex Platinum', 'credit-card');

    const created = await client().checkpoints.create(id, {
      balanceCents: -213_755,
      asOf: '2026-09-02',
    });

    expect(created.data.balanceCents).toBe(-213_755);
  });

  it('422s a date in the future', async () => {
    const id = await anAccount();
    await expect(
      client().checkpoints.create(id, { balanceCents: 100, asOf: '2099-01-01' })
    ).rejects.toMatchObject({ status: 422 });
  });

  it('422s an archived account, whose history is frozen', async () => {
    const id = await anAccount();
    await client().accounts.delete(id);

    await expect(
      client().checkpoints.create(id, { balanceCents: 100, asOf: '2026-01-01' })
    ).rejects.toMatchObject({ status: 422 });
  });

  it('400s a malformed date rather than storing it', async () => {
    const id = await anAccount();
    await expect(
      client().checkpoints.create(id, { balanceCents: 100, asOf: '01/01/2026' })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('404s an unknown account', async () => {
    await expect(
      client().checkpoints.create('nope', { balanceCents: 100, asOf: '2026-01-01' })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('GET /accounts/:id/checkpoints', () => {
  it('lists newest first and computes each row delta against the one before it', async () => {
    const id = await anAccount();
    await client().checkpoints.create(id, { balanceCents: 100_000, asOf: '2026-01-31' });
    await client().checkpoints.create(id, { balanceCents: 97_500, asOf: '2026-02-28' });

    const { data } = await client().checkpoints.list(id);

    expect(data.map((row) => row.asOf)).toEqual(['2026-02-28', '2026-01-31']);
    // No transactions explain the $25 drop, so the newer row disagrees.
    expect(data[0]).toMatchObject({ expectedBalanceCents: 100_000, deltaCents: -2_500 });
    // The earliest one anchors; there is nothing behind it to disagree with.
    expect(data[1]).toMatchObject({ expectedBalanceCents: null, deltaCents: null });
  });

  it('is empty for an account with none', async () => {
    expect((await client().checkpoints.list(await anAccount())).data).toEqual([]);
  });
});

describe('DELETE /accounts/:id/checkpoints/:checkpointId', () => {
  it('removes a manual checkpoint', async () => {
    const id = await anAccount();
    const created = await client().checkpoints.create(id, {
      balanceCents: 100,
      asOf: '2026-01-01',
    });

    await client().checkpoints.remove(id, created.data.id);

    expect((await client().checkpoints.list(id)).data).toEqual([]);
  });

  it('409s an import checkpoint, naming the source', async () => {
    const id = await anAccount();
    const row = insertCheckpoint(financeDb.db, {
      accountId: id,
      balanceCents: 100,
      asOf: '2026-01-01',
      source: 'import',
      sourceRef: 'commit-1',
    });

    await expect(client().checkpoints.remove(id, row.id)).rejects.toMatchObject({
      status: 409,
      body: { message: expect.stringContaining('import') },
    });
    expect((await client().checkpoints.list(id)).data).toHaveLength(1);
  });

  it('404s a checkpoint belonging to a different account', async () => {
    const mine = await anAccount('Mine');
    const theirs = await anAccount('Theirs');
    const created = await client().checkpoints.create(theirs, {
      balanceCents: 100,
      asOf: '2026-01-01',
    });

    await expect(client().checkpoints.remove(mine, created.data.id)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('GET /accounts/:id/balance', () => {
  it('anchors on the checkpoint and says so', async () => {
    const id = await anAccount();
    await client().checkpoints.create(id, { balanceCents: 100_000, asOf: '2026-01-31' });

    const { data } = await client().checkpoints.balance(id, { asOf: '2026-02-28' });

    expect(data).toMatchObject({
      balanceCents: 100_000,
      asOf: '2026-02-28',
      basis: 'checkpoint',
      anchor: { asOf: '2026-01-31', source: 'manual' },
      inconsistent: false,
    });
  });

  it('reports a transactions basis with no checkpoint, so a caller cannot mistake flow for balance', async () => {
    const { data } = await client().checkpoints.balance(await anAccount());
    expect(data).toMatchObject({ basis: 'transactions', anchor: null, balanceCents: 0 });
  });

  it('404s an unknown account', async () => {
    await expect(client().checkpoints.balance('nope')).rejects.toMatchObject({ status: 404 });
  });
});

describe('GET /accounts/:id/balance-history', () => {
  it('returns twelve month-end points by default, oldest first', async () => {
    const { data } = await client().checkpoints.history(await anAccount());
    expect(data).toHaveLength(12);
    expect(data.map((p) => p.month).toSorted()).toEqual(data.map((p) => p.month));
  });

  it('honours an explicit months window', async () => {
    expect(
      (await client().checkpoints.history(await anAccount(), { months: 3 })).data
    ).toHaveLength(3);
  });

  it('400s a months value beyond the cap', async () => {
    await expect(
      client().checkpoints.history(await anAccount(), { months: 999 })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('balance on the accounts wire shape', () => {
  it('carries a balance for every row in the list', async () => {
    await anAccount('Everyday');
    await anAccount('Wallet', 'cash');

    const { data } = await client().accounts.list();

    expect(data.length).toBeGreaterThanOrEqual(2);
    for (const account of data) {
      expect(account.balance).toMatchObject({ basis: expect.any(String) });
    }
  });

  it('serves a liability as negative, anchored on its checkpoint', async () => {
    const id = await anAccount('Amex Platinum', 'credit-card');
    await client().checkpoints.create(id, { balanceCents: -213_755, asOf: '2026-09-02' });

    const listed = (await client().accounts.list()).data.find((row) => row.id === id);
    expect(listed?.balance).toMatchObject({ balanceCents: -213_755, basis: 'checkpoint' });
    expect((await client().accounts.get(id)).data.balance.balanceCents).toBe(-213_755);
  });
});
