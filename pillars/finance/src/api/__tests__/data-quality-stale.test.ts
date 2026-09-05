/**
 * The stale-account member of `GET /data-quality/nudges` (POPS-2890).
 *
 * Route tier, like the inconsistency tests beside it: the rule composes the
 * account list, the import-status read (cadence from batch history, newest
 * transaction) and today's date, and the thing worth pinning is the whole
 * answer — which accounts, with which threshold, in which order, and which
 * accounts never appear.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, today, type OpenedFinanceDb } from '../../db/index.js';
import { insertBatch } from '../../db/services/import-batches.js';
import { createFinanceApiApp } from '../app.js';
import { makeContactsFake } from './contacts-fake.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-data-quality-stale-test-'));
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

function daysAgo(days: number): string {
  const stamp = new Date(`${today()}T00:00:00Z`);
  stamp.setUTCDate(stamp.getUTCDate() - days);
  return stamp.toISOString().slice(0, 10);
}

async function anAccount(name: string, kind = 'checking'): Promise<string> {
  const created = await client().accounts.create({ name, kind, currency: 'AUD' });
  return created.data.id;
}

async function transactionOn(accountId: string, date: string): Promise<void> {
  await client().transactions.create({
    description: `Row on ${date}`,
    accountId,
    amount: -5,
    date,
    type: 'purchase',
  });
}

/** A batch dated `daysAgo(days)`, so a cadence can be measured from the history. */
function batchDaysAgo(accountId: string, days: number): void {
  const row = insertBatch(
    financeDb.db,
    { accountId, sourceKind: 'csv-dialect', sourceRef: 'ANZ', rowCount: 1 },
    []
  );
  financeDb.raw
    .prepare('UPDATE import_batches SET created_at = ? WHERE id = ?')
    .run(`${daysAgo(days)}T09:00:00.000Z`, row.id);
}

async function staleNudges() {
  const { data } = await client().dataQuality.nudges();
  return data.filter((n) => n.kind === 'stale-account');
}

describe('GET /data-quality/nudges — stale accounts', () => {
  it('says nothing about an account with no transactions: unstarted is not stale', async () => {
    const id = await anAccount('Empty');
    batchDaysAgo(id, 100);
    expect(await staleNudges()).toEqual([]);
  });

  it('falls back to 45 days when the account has fewer than three batches', async () => {
    const quiet = await anAccount('Quiet 40');
    await transactionOn(quiet, daysAgo(40));
    batchDaysAgo(quiet, 40);
    batchDaysAgo(quiet, 70);

    const stale = await anAccount('Quiet 50');
    await transactionOn(stale, daysAgo(50));

    expect(await staleNudges()).toEqual([
      {
        kind: 'stale-account',
        accountId: stale,
        accountName: 'Quiet 50',
        newestTransactionDate: daysAgo(50),
        daysStale: 50,
        thresholdDays: 45,
        href: `/accounts/${stale}`,
      },
    ]);
  });

  it('uses the median gap of the account’s own batches as its threshold once it has three', async () => {
    const monthly = await anAccount('Monthly card');
    await transactionOn(monthly, daysAgo(40));
    for (const days of [40, 70, 100]) batchDaysAgo(monthly, days);

    const quarterly = await anAccount('Quarterly wallet');
    await transactionOn(quarterly, daysAgo(40));
    for (const days of [40, 130, 220]) batchDaysAgo(quarterly, days);

    expect(await staleNudges()).toEqual([
      expect.objectContaining({ accountId: monthly, daysStale: 40, thresholdDays: 30 }),
    ]);
  });

  it('measures from the newest transaction, not the last import', async () => {
    const id = await anAccount('Synced but empty');
    await transactionOn(id, daysAgo(60));
    batchDaysAgo(id, 1);

    expect(await staleNudges()).toEqual([
      expect.objectContaining({ accountId: id, newestTransactionDate: daysAgo(60), daysStale: 60 }),
    ]);
  });

  it('is exactly at the threshold not stale, one day past it stale', async () => {
    const onIt = await anAccount('On the line');
    await transactionOn(onIt, daysAgo(45));
    const past = await anAccount('Past it');
    await transactionOn(past, daysAgo(46));

    expect((await staleNudges()).map((n) => n.accountId)).toEqual([past]);
  });

  it('never flags a person ledger or an archived account', async () => {
    const person = await anAccount('Alice', 'person');
    await transactionOn(person, daysAgo(200));
    const archived = await anAccount('Old ING');
    await transactionOn(archived, daysAgo(200));
    await client().accounts.delete(archived);

    expect(await staleNudges()).toEqual([]);
  });

  it('lists inconsistencies before stale accounts, and stale accounts most overdue first', async () => {
    const inconsistent = await anAccount('Wrong', 'credit-card');
    await client().checkpoints.create(inconsistent, { balanceCents: -10_000, asOf: '2026-01-31' });
    await client().checkpoints.create(inconsistent, { balanceCents: -12_000, asOf: '2026-02-28' });

    const mildly = await anAccount('Mildly stale');
    await transactionOn(mildly, daysAgo(50));
    const very = await anAccount('Very stale');
    await transactionOn(very, daysAgo(40));
    for (const days of [40, 50, 60]) batchDaysAgo(very, days);

    const { data } = await client().dataQuality.nudges();
    expect(data.map((n) => [n.kind, n.accountId])).toEqual([
      ['checkpoint-inconsistency', inconsistent],
      ['stale-account', very],
      ['stale-account', mildly],
    ]);
  });
});
