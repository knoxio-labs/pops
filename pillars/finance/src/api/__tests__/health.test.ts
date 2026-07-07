/**
 * `GET /health` tests, including the `import` staleness fields backing the
 * "days since last import" ops signal.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  openFinanceDb,
  transactions,
  transactionsService,
  type OpenedFinanceDb,
} from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import { makeContactsFake } from './contacts-fake.js';
import { requestOn } from './test-utils.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-health-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
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

describe('GET /health', () => {
  it('reports no import staleness data against an empty table', async () => {
    const res = await requestOn(app(), (r) => r.get('/health'));

    expect(res.status).toBe(200);
    expect(res.body.import).toEqual({
      lastEditedTime: null,
      daysSinceLastImport: null,
      stale: false,
    });
  });

  it('reports a fresh, non-stale import right after a transaction is created', async () => {
    transactionsService.createTransaction(financeDb.db, {
      description: 'Groceries',
      account: 'Up Everyday',
      amountCents: 4200,
      date: '2026-07-01',
    });

    const res = await requestOn(app(), (r) => r.get('/health'));

    expect(res.status).toBe(200);
    expect(res.body.import.daysSinceLastImport).toBe(0);
    expect(res.body.import.stale).toBe(false);
    expect(typeof res.body.import.lastEditedTime).toBe('string');
  });

  it('flags stale once the last edit is past the threshold', async () => {
    const stale = transactionsService.createTransaction(financeDb.db, {
      description: 'Old import',
      account: 'Amex',
      amountCents: 1000,
      date: '2026-01-01',
    });
    const staleDays = 30;
    const staleEdit = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).toISOString();
    financeDb.db
      .update(transactions)
      .set({ lastEditedTime: staleEdit })
      .where(eq(transactions.id, stale.id))
      .run();

    const res = await requestOn(app(), (r) => r.get('/health'));

    expect(res.status).toBe(200);
    expect(res.body.import.stale).toBe(true);
    expect(res.body.import.daysSinceLastImport).toBeGreaterThanOrEqual(staleDays - 1);
  });

  it('treats a present-but-unparseable lastEditedTime as stale with unknown days', async () => {
    const row = transactionsService.createTransaction(financeDb.db, {
      description: 'Corrupt import',
      account: 'Amex',
      amountCents: 1000,
      date: '2026-01-01',
    });
    financeDb.db
      .update(transactions)
      .set({ lastEditedTime: 'not-a-timestamp' })
      .where(eq(transactions.id, row.id))
      .run();

    const res = await requestOn(app(), (r) => r.get('/health'));

    expect(res.status).toBe(200);
    expect(res.body.import.lastEditedTime).toBe('not-a-timestamp');
    expect(res.body.import.daysSinceLastImport).toBeNull();
    expect(res.body.import.stale).toBe(true);
  });
});
