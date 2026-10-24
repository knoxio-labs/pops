import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { count } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  openFinanceDb,
  resolveAccountIdByName,
  transactionsService,
  type OpenedFinanceDb,
} from '../index.js';
import { transactions } from '../schema.js';
import {
  entityIdentity,
  entityIdentitySql,
  equivalentEntityIds,
  preservedEntityId,
} from '../services/entity-identity.js';
import { planEntityRepair } from '../services/entity-orphans.js';

let financeDb: OpenedFinanceDb;
let directory: string;

beforeEach(() => {
  const scratch = fileURLToPath(new URL('../../../../../tmp/', import.meta.url));
  mkdirSync(scratch, { recursive: true });
  directory = mkdtempSync(join(scratch, 'finance-identity-sql-'));
  financeDb = openFinanceDb(join(directory, 'finance.db'));
});
afterEach(() => {
  financeDb.raw.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('canonical identity comparison boundaries', () => {
  it('distinguishes missing contacts, local placeholders and an incomplete snapshot', () => {
    const identities = new Map([
      ['old', 'canonical'],
      ['gone-a', null],
      ['gone-b', null],
    ]);
    expect(entityIdentity('old', identities)).toBe('canonical');
    expect(entityIdentity('canonical', identities)).toBe('canonical');
    expect(entityIdentity('gone-a', identities)).toBe('gone-a');
    expect(entityIdentity('gone-b', identities)).toBe('gone-b');
    expect(entityIdentity('temp:receipt', identities)).toBe('temp:receipt');
    expect(entityIdentity('pending:contact:receipt', identities)).toBe('pending:contact:receipt');
    expect(entityIdentity(null, identities)).toBeNull();
    expect(() => entityIdentity('not-covered', identities)).toThrow('snapshot');
    expect(equivalentEntityIds('canonical', identities).toSorted()).toEqual(['canonical', 'old']);
    expect(equivalentEntityIds('gone-a', identities)).toEqual(['gone-a']);
  });

  it('preserves historical foreign ids only for equivalent edits', () => {
    const identities = new Map([
      ['old', 'canonical'],
      ['other', 'other'],
    ]);
    expect(preservedEntityId('old', 'canonical', identities)).toBe('old');
    expect(preservedEntityId('old', 'other', identities)).toBe('other');
    expect(preservedEntityId('old', null, identities)).toBeNull();
    expect(preservedEntityId('old', undefined, identities)).toBeUndefined();
  });

  it('does not repair valid historical aliases by rewriting their stored references', () => {
    transactionsService.createTransaction(financeDb.db, {
      accountId: resolveAccountIdByName(financeDb.db, 'Amex'),
      description: 'Historical',
      amountCents: -100,
      date: '2026-09-02',
      entityId: 'old',
      entityName: 'Canonical',
    });
    const plan = planEntityRepair(
      financeDb.db,
      [{ id: 'canonical', name: 'Canonical' }],
      new Map([['old', 'canonical']])
    );
    expect(plan.remap.size).toBe(0);
    expect(plan.unmatched).toEqual([]);
    expect(financeDb.db.select({ id: transactions.entityId }).from(transactions).get()?.id).toBe(
      'old'
    );
  });

  it('groups historical aliases in SQL while keeping missing and unassigned ids separate', () => {
    const identities = new Map([
      ['old.a', 'canonical'],
      ['old b', 'canonical'],
      ['missing-a', null],
      ['missing-b', null],
    ]);
    const accountId = resolveAccountIdByName(financeDb.db, 'Amex');
    for (const entityId of ['old.a', 'old b', 'missing-a', 'missing-b', null]) {
      transactionsService.createTransaction(financeDb.db, {
        accountId,
        description: 'Identity fixture',
        amountCents: -100,
        date: '2026-09-02',
        entityId,
      });
    }
    const identity = entityIdentitySql(transactions.entityId, identities);
    const rows = financeDb.db
      .select({ id: identity, count: count() })
      .from(transactions)
      .groupBy(identity)
      .all();
    expect(new Map(rows.map((row) => [row.id, row.count]))).toEqual(
      new Map([
        [null, 1],
        ['canonical', 2],
        ['missing-a', 1],
        ['missing-b', 1],
      ])
    );
    expect(
      financeDb.db
        .select({ id: transactions.entityId })
        .from(transactions)
        .all()
        .map((row) => row.id)
    ).toEqual(expect.arrayContaining(['old.a', 'old b', 'missing-a', 'missing-b', null]));
  });
});
