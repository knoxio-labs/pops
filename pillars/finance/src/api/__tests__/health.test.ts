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
  entityPrecreateOutboxService,
  openFinanceDb,
  resolveAccountIdByName,
  transactions,
  transactionsService,
  type OpenedFinanceDb,
} from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import { makeContactsFake } from './contacts-fake.js';
import { requestOn } from './test-utils.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;
let amexAccountId: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-health-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
  // 'Amex' is already seeded by 0083_accounts.sql.
  amexAccountId = resolveAccountIdByName(financeDb.db, 'Amex');
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
      accountId: amexAccountId,
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
      accountId: amexAccountId,
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
      accountId: amexAccountId,
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

/**
 * POPS-2689: a finance holding no service-account key serves every request
 * normally and silently cannot create a contact, so nothing about the pillar
 * looks wrong while imports quietly accumulate placeholder entity ids. These
 * two facts are the only signal that says so without reading container logs.
 */
describe('GET /health — the contacts seam', () => {
  const KEY_ENV = 'POPS_INTERNAL_API_KEY';
  const FILE_ENV = 'POPS_INTERNAL_API_KEY_FILE';
  let savedKey: string | undefined;
  let savedFile: string | undefined;

  beforeEach(() => {
    savedKey = process.env[KEY_ENV];
    savedFile = process.env[FILE_ENV];
    delete process.env[KEY_ENV];
    delete process.env[FILE_ENV];
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env[KEY_ENV];
    else process.env[KEY_ENV] = savedKey;
    if (savedFile === undefined) delete process.env[FILE_ENV];
    else process.env[FILE_ENV] = savedFile;
  });

  it('reports a missing service-account key without failing the probe', async () => {
    const res = await requestOn(app(), (r) => r.get('/health'));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.contacts.serviceAccountKey).toBe('missing');
  });

  it('reports the key as present once one is configured', async () => {
    process.env[KEY_ENV] = 'pops_sa_test.key';

    const res = await requestOn(app(), (r) => r.get('/health'));

    expect(res.body.contacts.serviceAccountKey).toBe('present');
  });

  it('counts outbox placeholders by whether they are still being retried', async () => {
    const pendingId = entityPrecreateOutboxService.buildPendingContactId();
    entityPrecreateOutboxService.enqueue(financeDb.db, {
      id: pendingId,
      name: 'Still Trying Co',
      type: 'company',
    });
    const deadId = entityPrecreateOutboxService.buildPendingContactId();
    entityPrecreateOutboxService.enqueue(financeDb.db, {
      id: deadId,
      name: 'Given Up Co',
      type: 'company',
    });
    entityPrecreateOutboxService.recordAttemptFailure(financeDb.db, deadId, {
      nowIso: new Date().toISOString(),
      error: 'contacts pillar unavailable during entity pre-create: unavailable',
      maxAttempts: 1,
    });

    const res = await requestOn(app(), (r) => r.get('/health'));

    expect(res.body.contacts.outbox).toEqual({ pending: 1, deadLettered: 1 });
  });
});
