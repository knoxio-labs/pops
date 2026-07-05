/**
 * `GET /health` tests, including the `import` staleness fields backing the
 * "days since last import" ops signal.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  openFinanceDb,
  transactions,
  transactionsService,
  type OpenedFinanceDb,
} from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import { makeContactsFake } from './contacts-fake.js';

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
    const res = await supertest(app()).get('/health');

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
      amount: 42,
      date: '2026-07-01',
    });

    const res = await supertest(app()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.import.daysSinceLastImport).toBe(0);
    expect(res.body.import.stale).toBe(false);
    expect(typeof res.body.import.lastEditedTime).toBe('string');
  });

  it('flags stale once the last edit is past the threshold', async () => {
    const stale = transactionsService.createTransaction(financeDb.db, {
      description: 'Old import',
      account: 'Amex',
      amount: 10,
      date: '2026-01-01',
    });
    financeDb.db
      .update(transactions)
      .set({ lastEditedTime: '2026-01-01T00:00:00.000Z' })
      .where(eq(transactions.id, stale.id))
      .run();

    const res = await supertest(app()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.import.stale).toBe(true);
    expect(res.body.import.daysSinceLastImport).toBeGreaterThanOrEqual(14);
  });
});
