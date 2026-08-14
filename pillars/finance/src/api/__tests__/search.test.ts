/**
 * Integration tests for the `search.*` REST surface — finance's slice of
 * unified search, aggregating the transactions / budgets / wishlist adapters.
 *
 * The suite seeds rows through the pillar's own CRUD endpoints, then asserts
 * each adapter's ranking: exact (1.0) > prefix (0.8) > contains (0.5),
 * per-adapter descending sort, the wishlist not-yet-purchased filter, the `uri`
 * shapes, and the canonical transaction-type passthrough. An empty / whitespace
 * query short-circuits to an empty hit list.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import { makeContactsFake } from './contacts-fake.js';
import { makeClient, type SearchHit } from './test-utils.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-search-test-'));
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

function withScheme(hits: SearchHit[], scheme: string): SearchHit[] {
  return hits.filter((h) => h.uri.startsWith(scheme));
}

function firstHit(hits: SearchHit[]): SearchHit {
  const [hit] = hits;
  if (!hit) throw new Error(`expected at least one hit, got ${hits.length}`);
  return hit;
}

describe('search — transactions adapter', () => {
  it('returns a transaction hit carrying the canonical type and the legacy uri shape', async () => {
    const created = await client().transactions.create({
      description: 'Coffee',
      account: 'cash',
      amount: -5,
      date: '2026-01-01',
      type: 'purchase',
    });

    const { hits } = await client().search.run({ query: { text: 'coffee' } });
    const txHits = withScheme(hits, 'pops:finance/transaction/');
    expect(txHits).toHaveLength(1);
    const hit = firstHit(txHits);
    expect(hit.uri).toBe(`pops:finance/transaction/${created.data.id}`);
    expect(hit.score).toBe(1.0);
    expect(hit.matchType).toBe('exact');
    expect(hit.matchField).toBe('description');
    expect(hit.data).toMatchObject({ description: 'Coffee', type: 'purchase', amount: -5 });
  });

  it('passes the new types through the wire instead of collapsing them to expense (#3757)', async () => {
    await client().transactions.create({
      description: 'Refunded jacket',
      account: 'cash',
      amount: 80,
      date: '2026-01-01',
      type: 'refund',
    });

    const { hits } = await client().search.run({ query: { text: 'refunded jacket' } });
    const hit = firstHit(withScheme(hits, 'pops:finance/transaction/'));
    expect(hit.data).toMatchObject({ type: 'refund', amount: 80 });
  });

  it('ranks exact > prefix > contains across transaction descriptions', async () => {
    await client().transactions.create({
      description: 'Pay',
      account: 'a',
      amount: 1,
      date: '2026-01-01',
      type: 'income',
    });
    await client().transactions.create({
      description: 'Payment',
      account: 'a',
      amount: 1,
      date: '2026-01-01',
      type: 'income',
    });
    await client().transactions.create({
      description: 'Repayment',
      account: 'a',
      amount: 1,
      date: '2026-01-01',
      type: 'income',
    });

    const { hits } = await client().search.run({ query: { text: 'pay' } });
    const txHits = withScheme(hits, 'pops:finance/transaction/');
    expect(txHits.map((h) => h.data['description'])).toEqual(['Pay', 'Payment', 'Repayment']);
    expect(txHits.map((h) => h.score)).toEqual([1.0, 0.8, 0.5]);
  });
});

describe('search — budgets adapter', () => {
  it('returns a budget hit scored by category match', async () => {
    const created = await client().budgets.create({ category: 'Groceries', period: 'Monthly' });

    const { hits } = await client().search.run({ query: { text: 'groceries' } });
    const budgetHits = hits.filter((h) => h.uri.startsWith('/budgets/'));
    expect(budgetHits).toHaveLength(1);
    const budgetHit = firstHit(budgetHits);
    expect(budgetHit.uri).toBe(`/budgets/${created.data.id}`);
    expect(budgetHit.score).toBe(1.0);
    expect(budgetHit.data).toMatchObject({ category: 'Groceries', period: 'Monthly' });
  });
});

describe('search — wishlist adapter', () => {
  it('returns a wishlist hit and excludes already-purchased items', async () => {
    const open = await client().wishlist.create({ item: 'Bike', targetAmount: 1000, saved: 200 });
    // saved >= targetAmount => purchased, must be excluded from search.
    await client().wishlist.create({ item: 'Bike helmet', targetAmount: 100, saved: 100 });

    const { hits } = await client().search.run({ query: { text: 'bike' } });
    const wishHits = hits.filter((h) => h.uri === '/finance/wishlist');
    expect(wishHits).toHaveLength(1);
    expect(firstHit(wishHits).data).toMatchObject({ item: 'Bike', targetAmount: 1000 });
    expect(open.data.item).toBe('Bike');
  });

  it('keeps items with no target amount searchable', async () => {
    await client().wishlist.create({ item: 'Notebook' });
    const { hits } = await client().search.run({ query: { text: 'notebook' } });
    expect(hits.filter((h) => h.uri === '/finance/wishlist')).toHaveLength(1);
  });
});

describe('search — aggregation & empty query', () => {
  it('aggregates hits from all three finance adapters under one endpoint', async () => {
    await client().transactions.create({
      description: 'Travel fund',
      account: 'a',
      amount: 1,
      date: '2026-01-01',
      type: 'purchase',
    });
    await client().budgets.create({ category: 'Travel', period: 'Yearly' });
    await client().wishlist.create({ item: 'Travel backpack' });

    const { hits } = await client().search.run({ query: { text: 'travel' } });
    expect(withScheme(hits, 'pops:finance/transaction/')).toHaveLength(1);
    expect(hits.filter((h) => h.uri.startsWith('/budgets/'))).toHaveLength(1);
    expect(hits.filter((h) => h.uri === '/finance/wishlist')).toHaveLength(1);
  });

  it('returns an empty list for an empty or whitespace query', async () => {
    await client().transactions.create({
      description: 'Anything',
      account: 'a',
      amount: 1,
      date: '2026-01-01',
      type: 'purchase',
    });
    expect((await client().search.run({ query: { text: '' } })).hits).toEqual([]);
    expect((await client().search.run({ query: { text: '   ' } })).hits).toEqual([]);
  });
});

/**
 * `query.filters`: the contract advertises structured filters and the
 * handler must apply them, not silently drop them. Each case below plants
 * a row a naive text match would return, then proves a filter that should
 * exclude it actually does — the shape of failure this suite is written
 * against is a filter that arrives and changes nothing.
 */
describe('search — query.filters', () => {
  it('narrows transactions by type, excluding a same-text match of a different type', async () => {
    await client().transactions.create({
      description: 'Widget purchase',
      account: 'a',
      amount: -10,
      date: '2026-01-01',
      type: 'purchase',
    });
    await client().transactions.create({
      description: 'Widget refund',
      account: 'a',
      amount: 10,
      date: '2026-01-02',
      type: 'refund',
    });

    const { hits } = await client().search.run({
      query: { text: 'widget', filters: [{ field: 'type', operator: 'eq', value: 'refund' }] },
    });
    const txHits = withScheme(hits, 'pops:finance/transaction/');
    expect(txHits).toHaveLength(1);
    expect(firstHit(txHits).data).toMatchObject({ description: 'Widget refund' });
  });

  it('narrows transactions by entityId', async () => {
    await client().transactions.create({
      description: 'Coffee run',
      account: 'a',
      amount: -5,
      date: '2026-01-01',
      type: 'purchase',
      entityId: 'ent-cafe',
    });
    await client().transactions.create({
      description: 'Coffee beans',
      account: 'a',
      amount: -12,
      date: '2026-01-02',
      type: 'purchase',
      entityId: 'ent-grocer',
    });

    const { hits } = await client().search.run({
      query: {
        text: 'coffee',
        filters: [{ field: 'entityId', operator: 'eq', value: 'ent-cafe' }],
      },
    });
    const txHits = withScheme(hits, 'pops:finance/transaction/');
    expect(txHits).toHaveLength(1);
    expect(firstHit(txHits).data).toMatchObject({ description: 'Coffee run' });
  });

  it('narrows transactions by a date lower bound', async () => {
    await client().transactions.create({
      description: 'Rent January',
      account: 'a',
      amount: -100,
      date: '2026-01-01',
      type: 'purchase',
    });
    await client().transactions.create({
      description: 'Rent February',
      account: 'a',
      amount: -100,
      date: '2026-02-01',
      type: 'purchase',
    });

    const { hits } = await client().search.run({
      query: { text: 'rent', filters: [{ field: 'date', operator: 'gte', value: '2026-02-01' }] },
    });
    const txHits = withScheme(hits, 'pops:finance/transaction/');
    expect(txHits).toHaveLength(1);
    expect(firstHit(txHits).data).toMatchObject({ description: 'Rent February' });
  });

  it('narrows transactions by a date upper bound', async () => {
    await client().transactions.create({
      description: 'Rent January',
      account: 'a',
      amount: -100,
      date: '2026-01-01',
      type: 'purchase',
    });
    await client().transactions.create({
      description: 'Rent February',
      account: 'a',
      amount: -100,
      date: '2026-02-01',
      type: 'purchase',
    });

    const { hits } = await client().search.run({
      query: { text: 'rent', filters: [{ field: 'date', operator: 'lte', value: '2026-01-31' }] },
    });
    const txHits = withScheme(hits, 'pops:finance/transaction/');
    expect(txHits).toHaveLength(1);
    expect(firstHit(txHits).data).toMatchObject({ description: 'Rent January' });
  });

  it('narrows budgets by period, without constraining transactions or wishlist', async () => {
    await client().budgets.create({ category: 'Travel fund', period: 'Monthly' });
    await client().budgets.create({ category: 'Travel savings', period: 'Yearly' });
    await client().transactions.create({
      description: 'Travel gear',
      account: 'a',
      amount: -10,
      date: '2026-01-01',
      type: 'purchase',
    });
    await client().wishlist.create({ item: 'Travel backpack' });

    const { hits } = await client().search.run({
      query: { text: 'travel', filters: [{ field: 'period', operator: 'eq', value: 'Yearly' }] },
    });
    const budgetHits = hits.filter((h) => h.uri.startsWith('/budgets/'));
    expect(budgetHits).toHaveLength(1);
    expect(firstHit(budgetHits).data).toMatchObject({ category: 'Travel savings' });
    expect(withScheme(hits, 'pops:finance/transaction/')).toHaveLength(1);
    expect(hits.filter((h) => h.uri === '/finance/wishlist')).toHaveLength(1);
  });

  it('narrows budgets by active', async () => {
    await client().budgets.create({ category: 'Groceries active', active: true });
    await client().budgets.create({ category: 'Groceries inactive', active: false });

    const { hits } = await client().search.run({
      query: {
        text: 'groceries',
        filters: [{ field: 'active', operator: 'eq', value: 'true' }],
      },
    });
    const budgetHits = hits.filter((h) => h.uri.startsWith('/budgets/'));
    expect(budgetHits).toHaveLength(1);
    expect(firstHit(budgetHits).data).toMatchObject({ category: 'Groceries active' });
  });

  it('narrows wishlist by priority', async () => {
    await client().wishlist.create({ item: 'Camera lens', priority: 'Soon' });
    await client().wishlist.create({ item: 'Camera bag', priority: 'Dreaming' });

    const { hits } = await client().search.run({
      query: {
        text: 'camera',
        filters: [{ field: 'priority', operator: 'eq', value: 'Dreaming' }],
      },
    });
    const wishHits = hits.filter((h) => h.uri === '/finance/wishlist');
    expect(wishHits).toHaveLength(1);
    expect(firstHit(wishHits).data).toMatchObject({ item: 'Camera bag' });
  });

  it('rejects an unknown filter field at the schema before any handler runs', async () => {
    await expect(
      client().search.run({
        query: { text: 'x', filters: [{ field: 'notAField', operator: 'eq', value: 'x' }] },
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a field/operator pairing the field does not support, naming both halves', async () => {
    await expect(
      client().search.run({
        query: { text: 'x', filters: [{ field: 'type', operator: 'gte', value: 'purchase' }] },
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a value the field cannot hold', async () => {
    await expect(
      client().search.run({
        query: { text: 'x', filters: [{ field: 'type', operator: 'eq', value: 'shipped' }] },
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects two conflicting equality filters on the same field rather than picking one', async () => {
    await expect(
      client().search.run({
        query: {
          text: 'x',
          filters: [
            { field: 'type', operator: 'eq', value: 'purchase' },
            { field: 'type', operator: 'eq', value: 'refund' },
          ],
        },
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('an empty filter list behaves exactly like no filters', async () => {
    await client().transactions.create({
      description: 'Unfiltered widget',
      account: 'a',
      amount: -1,
      date: '2026-01-01',
      type: 'purchase',
    });

    const { hits } = await client().search.run({ query: { text: 'widget', filters: [] } });
    expect(withScheme(hits, 'pops:finance/transaction/')).toHaveLength(1);
  });
});
