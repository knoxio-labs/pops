import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  accountsService,
  openFinanceDb,
  resolveAccountIdByName,
  transactionsService,
  transactionTagRulesService,
  transactionCorrectionsService,
  type OpenedFinanceDb,
} from '../../db/index.js';
import { accounts } from '../../db/schema.js';
import { createFinanceApiApp } from '../app.js';
import { makeContactsFake, type ContactsFake } from './contacts-fake.js';
import { makeClient } from './test-utils.js';

let financeDb: OpenedFinanceDb;
let directory: string;
let accountId: string;
const aliases = new Map([
  ['old-a', 'current'],
  ['old-b', 'current'],
  ['current', 'current'],
  ['other', 'other'],
]);

beforeEach(() => {
  const scratch = fileURLToPath(new URL('../../../../../tmp/', import.meta.url));
  mkdirSync(scratch, { recursive: true });
  directory = mkdtempSync(join(scratch, 'finance-canonical-'));
  financeDb = openFinanceDb(join(directory, 'finance.db'));
  accountId = resolveAccountIdByName(financeDb.db, 'Amex');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-12T09:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  financeDb.raw.close();
  rmSync(directory, { recursive: true, force: true });
});

function contacts(): ContactsFake {
  return makeContactsFake({
    canonicalIds: aliases,
    seed: [
      { id: 'current', name: 'Current', type: 'person' },
      { id: 'other', name: 'Other', type: 'company' },
    ],
  });
}

function client(fake: ContactsFake = contacts()) {
  return makeClient(
    createFinanceApiApp({
      financeDb,
      contacts: fake,
      version: 'test',
      selfBaseUrl: 'http://localhost:3004',
    })
  );
}

function transaction(
  entityId: string,
  amountCents = -100,
  type: 'purchase' | 'income' = 'purchase'
) {
  return transactionsService.createTransaction(financeDb.db, {
    description: 'CANONICAL CAFE',
    accountId,
    amountCents,
    date: '2026-09-02',
    entityId,
    entityName: 'Cafe',
    type,
  });
}

function historicalRule() {
  return transactionTagRulesService.createTransactionTagRule(financeDb.db, {
    descriptionPattern: 'CANONICAL CAFE',
    matchType: 'contains',
    tags: ['bar'],
    entityId: 'old-a',
  });
}

describe('canonical contact identities across finance HTTP operations', () => {
  it('combines aliases in live entity usage, spend, income and concentration', async () => {
    transaction('old-a', -100);
    transaction('old-b', -200);
    transaction('other', -100);
    transaction('old-a', 500, 'income');
    transaction('old-b', 600, 'income');
    const api = client();
    const usage = await api.entityUsage.list();
    expect(usage.data.find((row) => row.id === 'current')?.transactionCount).toBe(4);
    const { data } = await api.summary.get();
    expect(data.byEntity).toMatchObject([
      { entityId: 'current', spend: { cents: 300, transactionCount: 2 } },
      { entityId: 'other', spend: { cents: 100, transactionCount: 1 } },
    ]);
    expect(data.income.byEntity).toMatchObject([
      { entityId: 'current', income: { cents: 1100, transactionCount: 2 } },
    ]);
    expect(data.inference.concentration).toEqual({ entityCount: 2, cents: 400, shareOfTotal: 1 });
  });

  it('expands canonical and historical transaction/search filters while returning historical ids', async () => {
    const a = transaction('old-a');
    const b = transaction('old-b');
    transaction('other');
    const api = client();
    for (const entityId of ['current', 'old-a']) {
      const result = await api.transactions.list({ entityId });
      expect(result.pagination.total).toBe(2);
      expect(result.data.map((row) => row.id).toSorted()).toEqual([a.id, b.id].toSorted());
      expect(result.data.map((row) => row.entityId).toSorted()).toEqual(['old-a', 'old-b']);
      const search = await api.search.run({
        query: {
          text: 'canonical cafe',
          filters: [{ field: 'entityId', operator: 'eq', value: entityId }],
        },
      });
      const rows = search.hits.filter((hit) => hit.uri.startsWith('pops:finance/transaction/'));
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.uri).toSorted()).toEqual(
        [`pops:finance/transaction/${a.id}`, `pops:finance/transaction/${b.id}`].toSorted()
      );
    }
  });

  it('suggests a historical entity-scoped rule for its canonical merchant and excludes a distinct merchant', async () => {
    historicalRule();
    const api = client();
    expect(
      (await api.transactions.suggestTags({ description: 'CANONICAL CAFE', entityId: 'current' }))
        .tags
    ).toContainEqual(expect.objectContaining({ tag: 'bar', source: 'rule' }));
    expect(
      (await api.transactions.suggestTags({ description: 'CANONICAL CAFE', entityId: 'other' }))
        .tags
    ).not.toContainEqual(expect.objectContaining({ tag: 'bar' }));
  });

  it('reinforces a historical rule when an add names its canonical equivalent', async () => {
    const rule = historicalRule();
    const result = await client().tagRules.apply({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: {
              descriptionPattern: 'CANONICAL CAFE',
              matchType: 'contains',
              tags: ['bar'],
              entityId: 'current',
            },
          },
        ],
      },
      acceptedNewTags: ['bar'],
    });
    expect(result.rules).toMatchObject([{ id: rule.id, entityId: 'old-a' }]);
    const rows = transactionTagRulesService.listTransactionTagRules(financeDb.db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.entityId).toBe('old-a');
    expect(rows[0]?.confidence).toBeGreaterThan(rule.confidence);
  });

  it('retroapplies across aliases exactly once without rewriting stored transaction identities', async () => {
    const rule = historicalRule();
    const a = transaction('old-b');
    const b = transaction('current');
    const other = transaction('other');
    const api = client();
    expect((await api.tagRules.applyExisting(rule.id)).data).toMatchObject({
      matched: 2,
      updated: 2,
    });
    expect((await api.transactions.get(a.id)).data).toMatchObject({
      entityId: 'old-b',
      tags: ['bar'],
    });
    expect((await api.transactions.get(b.id)).data).toMatchObject({
      entityId: 'current',
      tags: ['bar'],
    });
    expect((await api.transactions.get(other.id)).data.tags).toEqual([]);
    expect((await api.tagRules.applyExisting(rule.id)).data).toMatchObject({
      matched: 2,
      updated: 0,
    });
    expect(
      transactionTagRulesService.getTransactionTagRule(financeDb.db, rule.id).timesApplied
    ).toBe(2);
  });

  it('refuses a duplicate canonical person account and preserves equivalent entity edits', async () => {
    const historical = financeDb.db
      .insert(accounts)
      .values({ name: 'Historical person', kind: 'person', currency: 'AUD', entityId: 'old-a' })
      .returning()
      .all()[0];
    if (historical === undefined) throw new Error('missing fixture');
    const api = client();
    await expect(
      api.accounts.create({
        name: 'Duplicate person',
        kind: 'person',
        currency: 'AUD',
        entityId: 'current',
      })
    ).rejects.toMatchObject({ status: 409 });
    const updated = await api.accounts.update(historical.id, { entityId: 'current' });
    expect(updated.data.entityId).toBe('old-a');
    expect(accountsService.getAccount(financeDb.db, historical.id).entityId).toBe('old-a');
    const row = transaction('old-b');
    await api.transactions.update(row.id, { entityId: 'current' });
    expect((await api.transactions.get(row.id)).data.entityId).toBe('old-b');
  });

  it('keeps pre-existing historical person ledgers editable after their contacts merge', async () => {
    const first = accountsService.createAccount(financeDb.db, {
      name: 'First historical ledger',
      kind: 'person',
      currency: 'AUD',
      entityId: 'old-a',
    });
    accountsService.createAccount(financeDb.db, {
      name: 'Second historical ledger',
      kind: 'person',
      currency: 'AUD',
      entityId: 'old-b',
    });
    const updated = await client().accounts.update(first.id, {
      name: 'Renamed historical ledger',
      entityId: 'current',
    });
    expect(updated.data.entityId).toBe('old-a');
    expect(updated.data.name).toBe('Renamed historical ledger');
  });

  it('reports an incomplete identity snapshot as unavailable', async () => {
    transaction('old-a');
    const fake = contacts();
    fake.resolveEntityIds = async () => new Map();
    await expect(client(fake).transactions.list({ entityId: 'current' })).rejects.toMatchObject({
      status: 503,
    });
  });

  it('rejects ambiguous canonical tag-rule reinforcement without mutating either rule', async () => {
    const first = historicalRule();
    const second = transactionTagRulesService.createTransactionTagRule(financeDb.db, {
      descriptionPattern: first.descriptionPattern,
      matchType: first.matchType,
      tags: ['bar'],
      entityId: 'old-b',
    });
    await expect(
      client().tagRules.apply({
        changeSet: {
          source: 'tag-edit-signal',
          reason: 'Test canonical collision',
          ops: [
            {
              op: 'add',
              data: {
                descriptionPattern: first.descriptionPattern,
                matchType: first.matchType,
                entityId: 'current',
                tags: ['bar'],
              },
            },
          ],
        },
        acceptedNewTags: ['bar'],
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(transactionTagRulesService.getTransactionTagRule(financeDb.db, first.id)).toEqual(first);
    expect(transactionTagRulesService.getTransactionTagRule(financeDb.db, second.id)).toEqual(
      second
    );
  });

  it('preserves historical tag-rule scopes on equivalent direct and change-set edits', async () => {
    const rule = historicalRule();
    const api = client();
    expect((await api.tagRules.update(rule.id, { entityId: 'current' })).data.entityId).toBe(
      'old-a'
    );
    await api.tagRules.apply({
      changeSet: {
        source: 'tag-edit-signal',
        reason: 'Test equivalent edit',
        ops: [
          {
            op: 'edit',
            id: rule.id,
            data: { entityId: 'current' },
          },
        ],
      },
      acceptedNewTags: [],
    });
    expect(transactionTagRulesService.getTransactionTagRule(financeDb.db, rule.id).entityId).toBe(
      'old-a'
    );
  });

  it('preserves historical correction outcomes on equivalent patches and reinforcement', async () => {
    const rule = transactionCorrectionsService.createOrUpdateTransactionCorrection(financeDb.db, {
      descriptionPattern: 'CANONICAL CAFE',
      matchType: 'contains',
      entityId: 'old-a',
      entityName: 'Cafe',
    });
    const api = client();
    await api.corrections.update(rule.id, { entityId: 'current' });
    await api.corrections.createOrUpdate({
      descriptionPattern: rule.descriptionPattern,
      matchType: rule.matchType,
      entityId: 'current',
      entityName: 'Cafe',
    });
    await api.corrections.applyChangeSet({
      changeSet: {
        source: 'test',
        reason: 'Test equivalent edit',
        ops: [{ op: 'edit', id: rule.id, data: { entityId: 'current' } }],
      },
    });
    expect(
      transactionCorrectionsService.getTransactionCorrection(financeDb.db, rule.id).entityId
    ).toBe('old-a');
  });

  it('returns unavailable and leaves mutations untouched when identity resolution fails', async () => {
    const fake = contacts();
    const row = transaction('old-a');
    const rule = historicalRule();
    fake.setUnavailable(true);
    const api = client(fake);
    await expect(api.transactions.list({ entityId: 'current' })).rejects.toMatchObject({
      status: 503,
    });
    await expect(api.summary.get()).rejects.toMatchObject({ status: 503 });
    await expect(api.tagRules.applyExisting(rule.id)).rejects.toMatchObject({ status: 503 });
    await expect(api.transactions.update(row.id, { entityId: 'current' })).rejects.toMatchObject({
      status: 503,
    });
    const stored = transactionsService.getTransaction(financeDb.db, row.id);
    expect(stored).toMatchObject({ entityId: 'old-a', tags: '[]' });
    expect(
      transactionTagRulesService.getTransactionTagRule(financeDb.db, rule.id).timesApplied
    ).toBe(0);
  });
});
