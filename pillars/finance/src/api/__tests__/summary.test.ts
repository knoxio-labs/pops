/**
 * Integration tests for `GET /summary` (POPS-3589, POPS-250 decision 2).
 *
 * Only `Date` is faked (`toFake: ['Date']`), never the timers the HTTP
 * transport runs on — the window is what has to be deterministic, and a test
 * server whose timers are frozen never answers.
 *
 * Fixture rows go in through drizzle rather than `POST /transactions`, because
 * the wire's create body has no way to set `foreignCurrency`/`fxFeeCents` —
 * only an importer writes those — and the foreign-spend panel is one of the
 * things under test.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import { transactions } from '../../db/schema.js';
import { createFinanceApiApp } from '../app.js';
import { makeContactsFake } from './contacts-fake.js';
import { makeClient } from './test-utils.js';

const TODAY = '2026-09-12';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T09:00:00.000Z`));
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-summary-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  vi.useRealTimers();
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

async function anAccount(name: string, currency = 'AUD') {
  const created = await client().accounts.create({ name, kind: 'checking', currency });
  return created.data.id;
}

interface Row {
  accountId: string;
  date: string;
  amountCents: number;
  type?: 'purchase' | 'transfer' | 'fee' | 'refund';
  description?: string;
  tags?: string[];
  entityId?: string | null;
  entityName?: string | null;
  foreignCurrency?: string | null;
  fxFeeCents?: number | null;
}

function ledger(...rows: Row[]) {
  financeDb.db
    .insert(transactions)
    .values(
      rows.map((row) => ({
        description: row.description ?? 'Row',
        accountId: row.accountId,
        amountCents: row.amountCents,
        date: row.date,
        type: row.type ?? ('purchase' as const),
        tags: JSON.stringify(row.tags ?? []),
        entityId: row.entityId ?? null,
        entityName: row.entityName ?? null,
        foreignCurrency: row.foreignCurrency ?? null,
        fxFeeCents: row.fxFeeCents ?? null,
        lastEditedTime: `${TODAY}T00:00:00.000Z`,
      }))
    )
    .run();
}

describe('GET /summary — windows and the previous period', () => {
  it('defaults to rolling 30 days and states both ranges', async () => {
    const { data } = await client().summary.get();

    expect(data.window).toEqual({
      key: '30d',
      start: '2026-08-14',
      end: TODAY,
      previous: { start: '2026-07-15', end: '2026-08-13' },
    });
  });

  it('compares month-to-date against the same elapsed days of the previous month', async () => {
    const accountId = await anAccount('Everyday');
    ledger(
      // Inside September 1–12.
      { accountId, date: '2026-09-03', amountCents: -10_000 },
      // Inside August 1–12 — the comparison window.
      { accountId, date: '2026-08-02', amountCents: -4_000 },
      // August 20 is in neither: past the elapsed length of the previous
      // month, which a naive "whole previous calendar month" would swallow.
      { accountId, date: '2026-08-20', amountCents: -90_000 }
    );

    const { data } = await client().summary.get({ window: 'month' });

    expect(data.window.previous).toEqual({ start: '2026-08-01', end: '2026-08-12' });
    expect(data.total).toEqual({ cents: 10_000, transactionCount: 1 });
    expect(data.previousTotal).toEqual({ cents: 4_000, transactionCount: 1 });
    expect(data.deltaCents).toBe(6_000);
    expect(data.deltaRatio).toBe(1.5);
  });

  it('offers no comparison at all for the all-time window', async () => {
    const { data } = await client().summary.get({ window: 'all' });

    expect(data.window.start).toBeNull();
    expect(data.window.previous).toBeNull();
    expect(data.previousTotal).toBeNull();
    expect(data.deltaCents).toBeNull();
    expect(data.deltaRatio).toBeNull();
  });

  it('rejects a window it does not offer', async () => {
    await expect(client().summary.get({ window: 'fortnight' })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('GET /summary — measuring nothing', () => {
  it('marks an empty ledger empty rather than answering a measured zero', async () => {
    const { data } = await client().summary.get();

    expect(data.empty).toBe(true);
    expect(data.total).toEqual({ cents: 0, transactionCount: 0 });
    expect(data.byAccount).toEqual([]);
    // The axis still exists — a 30-day window spans two months whether or not
    // anything happened in them — but every bar is explicitly unmeasured.
    expect(data.byMonth.map((month) => month.month)).toEqual(['2026-08', '2026-09']);
    expect(data.byMonth.every((month) => month.spend.transactionCount === 0)).toBe(true);
    expect(data.inference.largestCharge).toBeNull();
    expect(data.inference.concentration).toEqual({
      entityCount: 0,
      cents: 0,
      shareOfTotal: null,
    });
    expect(data.inference.foreign.fees).toEqual({ cents: 0, transactionCount: 0 });
    expect(data.inference.recurringSubscriptions.spend.transactionCount).toBe(0);
  });

  it('separates a window with rows but no spend from a window with no rows', async () => {
    const accountId = await anAccount('Everyday');
    ledger({ accountId, date: '2026-09-01', amountCents: -50_000, type: 'transfer' });

    const { data } = await client().summary.get();

    expect(data.empty).toBe(false);
    expect(data.total).toEqual({ cents: 0, transactionCount: 0 });
  });

  it('leaves every share null when the window total is zero', async () => {
    const accountId = await anAccount('Everyday');
    ledger({ accountId, date: '2026-09-01', amountCents: -50_000, type: 'transfer' });

    const { data } = await client().summary.get();

    expect(data.deltaRatio).toBeNull();
    expect(data.inference.concentration.shareOfTotal).toBeNull();
  });
});

describe('GET /summary — breakdowns', () => {
  it('splits spend by account with counts and shares, and names the currencies', async () => {
    const everyday = await anAccount('Everyday');
    const travel = await anAccount('Travel', 'USD');
    ledger(
      { accountId: everyday, date: '2026-09-01', amountCents: -7_500 },
      { accountId: everyday, date: '2026-09-02', amountCents: -2_500 },
      { accountId: travel, date: '2026-09-03', amountCents: -30_000 }
    );

    const { data } = await client().summary.get();

    expect(data.currencies).toEqual(['AUD', 'USD']);
    expect(data.byAccount).toEqual([
      {
        accountId: travel,
        accountName: 'Travel',
        currency: 'USD',
        archived: false,
        spend: { cents: 30_000, transactionCount: 1 },
        shareOfTotal: 0.75,
      },
      {
        accountId: everyday,
        accountName: 'Everyday',
        currency: 'AUD',
        archived: false,
        spend: { cents: 10_000, transactionCount: 2 },
        shareOfTotal: 0.25,
      },
    ]);
  });

  it('nets a refund off the spend it offsets', async () => {
    const accountId = await anAccount('Everyday');
    ledger(
      { accountId, date: '2026-09-01', amountCents: -10_000 },
      { accountId, date: '2026-09-05', amountCents: 2_500, type: 'refund' }
    );

    const { data } = await client().summary.get();

    expect(data.total).toEqual({ cents: 7_500, transactionCount: 2 });
  });

  it('keeps fees out of spend — they are a cost of the account, not of a category', async () => {
    const accountId = await anAccount('Everyday');
    ledger(
      { accountId, date: '2026-09-01', amountCents: -10_000 },
      { accountId, date: '2026-09-05', amountCents: -900, type: 'fee' }
    );

    const { data } = await client().summary.get();

    expect(data.total).toEqual({ cents: 10_000, transactionCount: 1 });
  });

  it('gives the trend a dense month axis, stacked by account', async () => {
    const accountId = await anAccount('Everyday');
    ledger(
      { accountId, date: '2026-08-20', amountCents: -1_000 },
      { accountId, date: '2026-09-02', amountCents: -3_000 }
    );

    const { data } = await client().summary.get({ window: '90d' });

    expect(data.byMonth.map((month) => month.month)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
    expect(data.byMonth[0]).toEqual({
      month: '2026-06',
      spend: { cents: 0, transactionCount: 0 },
      byAccount: [],
    });
    expect(data.byMonth[3]).toEqual({
      month: '2026-09',
      spend: { cents: 3_000, transactionCount: 1 },
      byAccount: [{ accountId, spend: { cents: 3_000, transactionCount: 1 } }],
    });
  });

  it('counts a multi-tagged row toward every tag it carries', async () => {
    const accountId = await anAccount('Everyday');
    ledger({
      accountId,
      date: '2026-09-01',
      amountCents: -6_000,
      tags: ['venue:cafe', 'occasion:work'],
    });

    const { data } = await client().summary.get();

    expect(data.byTag).toEqual([
      { tag: 'occasion:work', spend: { cents: 6_000, transactionCount: 1 }, shareOfTotal: 1 },
      { tag: 'venue:cafe', spend: { cents: 6_000, transactionCount: 1 }, shareOfTotal: 1 },
    ]);
  });

  it('collapses every unresolved row into one unattributed entity bucket', async () => {
    const accountId = await anAccount('Everyday');
    ledger(
      { accountId, date: '2026-09-01', amountCents: -9_000, entityId: 'e1', entityName: 'Amazon' },
      { accountId, date: '2026-09-02', amountCents: -600, entityName: 'a label only' },
      { accountId, date: '2026-09-03', amountCents: -400 }
    );

    const { data } = await client().summary.get();

    expect(data.byEntity).toEqual([
      {
        entityId: 'e1',
        entityName: 'Amazon',
        spend: { cents: 9_000, transactionCount: 1 },
        shareOfTotal: 0.9,
      },
      {
        entityId: null,
        entityName: null,
        spend: { cents: 1_000, transactionCount: 2 },
        shareOfTotal: 0.1,
      },
    ]);
  });

  it('honours topLimit and refuses one past the cap', async () => {
    const accountId = await anAccount('Everyday');
    ledger(
      { accountId, date: '2026-09-01', amountCents: -300, tags: ['a'] },
      { accountId, date: '2026-09-02', amountCents: -200, tags: ['b'] },
      { accountId, date: '2026-09-03', amountCents: -100, tags: ['c'] }
    );

    expect((await client().summary.get({ topLimit: 2 })).data.byTag.map((t) => t.tag)).toEqual([
      'a',
      'b',
    ]);
    await expect(client().summary.get({ topLimit: 500 })).rejects.toMatchObject({ status: 400 });
  });
});

describe('GET /summary — inference panel', () => {
  it('picks the single largest charge, with the account it landed on', async () => {
    const accountId = await anAccount('Everyday');
    ledger(
      { accountId, date: '2026-09-01', amountCents: -9_900, description: 'Flights' },
      { accountId, date: '2026-09-02', amountCents: -1_000, description: 'Coffee' }
    );

    const { data } = await client().summary.get();

    expect(data.inference.largestCharge).toMatchObject({
      description: 'Flights',
      date: '2026-09-01',
      cents: 9_900,
      accountId,
      accountName: 'Everyday',
    });
  });

  it('measures concentration over resolved entities only, against the whole total', async () => {
    const accountId = await anAccount('Everyday');
    ledger(
      { accountId, date: '2026-09-01', amountCents: -6_000, entityId: 'e1' },
      { accountId, date: '2026-09-02', amountCents: -4_000 }
    );

    const { data } = await client().summary.get();

    expect(data.inference.concentration).toEqual({
      entityCount: 1,
      cents: 6_000,
      shareOfTotal: 0.6,
    });
  });

  it('reports subscriptions with the tag it counted, and zero rows when none carry it', async () => {
    const accountId = await anAccount('Everyday');
    ledger(
      {
        accountId,
        date: '2026-09-01',
        amountCents: -2_290,
        tags: ['contains:subscription'],
        entityId: 'netflix',
        entityName: 'Netflix',
      },
      { accountId, date: '2026-09-02', amountCents: -5_000, tags: ['venue:supermarket'] }
    );

    const { data } = await client().summary.get();

    expect(data.inference.recurringSubscriptions).toEqual({
      tag: 'contains:subscription',
      spend: { cents: 2_290, transactionCount: 1 },
      byEntity: [
        {
          entityId: 'netflix',
          entityName: 'Netflix',
          spend: { cents: 2_290, transactionCount: 1 },
        },
      ],
    });
  });

  it('separates foreign spend from the FX fees charged on it', async () => {
    const accountId = await anAccount('Everyday');
    ledger(
      {
        accountId,
        date: '2026-09-01',
        amountCents: -15_000,
        foreignCurrency: 'JPY',
        fxFeeCents: 450,
      },
      { accountId, date: '2026-09-02', amountCents: -5_000 }
    );

    const { data } = await client().summary.get();

    expect(data.inference.foreign).toEqual({
      spend: { cents: 15_000, transactionCount: 1 },
      fees: { cents: 450, transactionCount: 1 },
    });
  });
});
