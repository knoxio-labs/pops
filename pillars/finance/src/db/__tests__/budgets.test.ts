/**
 * Invariant tests for the budgets service against an in-memory SQLite
 * carrying the migrated finance schema — DB + service layer only.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { BudgetConflictError, BudgetNotFoundError } from '../errors.js';
import {
  computeSpent,
  createBudget,
  deleteBudget,
  getBudget,
  listBudgets,
  periodWindowEnd,
  periodWindowStart,
  updateBudget,
  withSpend,
} from '../services/budgets.js';
import { freshMigratedFinanceDb } from './migrated-db.js';
import { seededAccountId } from './seeded-account.js';

import type Database from 'better-sqlite3';

import type { FinanceDb } from '../services/internal.js';

type FinanceTestDb = FinanceDb & { $client: Database.Database };

function freshDb(): FinanceTestDb {
  const { db, raw } = freshMigratedFinanceDb();
  return Object.assign(db, { $client: raw });
}

interface SeedTransactionInput {
  description: string;
  amountCents: number;
  date: string;
  type: string;
  tags: string[];
  account?: string;
}

function seedTransaction(db: FinanceTestDb, input: SeedTransactionInput): void {
  const raw = db.$client;
  raw
    .prepare(
      `INSERT INTO transactions (id, description, account, account_id, amount_cents, date, type, tags, last_edited_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      crypto.randomUUID(),
      input.description,
      input.account ?? 'Test Account',
      seededAccountId(db, 'Amex'),
      input.amountCents,
      input.date,
      input.type,
      JSON.stringify(input.tags),
      new Date().toISOString()
    );
}

describe('createBudget', () => {
  let db: FinanceTestDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('inserts a row with the supplied fields and a generated UUID', () => {
    const created = createBudget(db, {
      category: 'Groceries',
      period: 'Monthly',
      amountCents: 50000,
      active: true,
      notes: 'Monthly grocery budget',
    });

    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(created.category).toBe('Groceries');
    expect(created.period).toBe('Monthly');
    expect(created.amountCents).toBe(50000);
    expect(created.active).toBe(1);
    expect(created.notes).toBe('Monthly grocery budget');
    expect(created.lastEditedTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('defaults optional fields to null and active to 0', () => {
    const created = createBudget(db, { category: 'Just the category' });
    expect(created.period).toBeNull();
    expect(created.amountCents).toBeNull();
    expect(created.active).toBe(0);
    expect(created.notes).toBeNull();
  });

  it('throws BudgetConflictError on duplicate (category, period)', () => {
    createBudget(db, { category: 'Groceries', period: 'Monthly' });

    let thrown: unknown;
    try {
      createBudget(db, { category: 'Groceries', period: 'Monthly' });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(BudgetConflictError);
    if (thrown instanceof BudgetConflictError) {
      expect(thrown.category).toBe('Groceries');
      expect(thrown.period).toBe('Monthly');
      expect(thrown.message).toContain("'Groceries'");
      expect(thrown.message).toContain("'Monthly'");
    }
  });

  it('throws BudgetConflictError on duplicate category with null period', () => {
    createBudget(db, { category: 'Groceries' });

    let thrown: unknown;
    try {
      createBudget(db, { category: 'Groceries' });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(BudgetConflictError);
    if (thrown instanceof BudgetConflictError) {
      expect(thrown.period).toBeNull();
      expect(thrown.message).toContain('null');
    }
  });

  it('allows the same category for different periods', () => {
    createBudget(db, { category: 'Groceries', period: 'Monthly' });
    const yearly = createBudget(db, { category: 'Groceries', period: 'Yearly' });
    expect(yearly.period).toBe('Yearly');
  });
});

describe('getBudget', () => {
  let db: FinanceTestDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns the persisted row by id', () => {
    const created = createBudget(db, { category: 'Books' });
    const fetched = getBudget(db, created.id);
    expect(fetched).toEqual(created);
  });

  it('throws BudgetNotFoundError for an unknown id', () => {
    expect(() => getBudget(db, 'missing')).toThrow(BudgetNotFoundError);
  });
});

describe('listBudgets', () => {
  let db: FinanceTestDb;
  beforeEach(() => {
    db = freshDb();
    createBudget(db, { category: 'Apple monitor', period: 'Monthly', active: true });
    createBudget(db, { category: 'Apple keyboard', period: 'Yearly', active: false });
    createBudget(db, { category: 'Couch', active: true });
  });

  it('returns all rows sorted by category with a total count', () => {
    const result = listBudgets(db, { limit: 50, offset: 0 });
    expect(result.total).toBe(3);
    expect(result.rows.map((r) => r.category)).toEqual([
      'Apple keyboard',
      'Apple monitor',
      'Couch',
    ]);
  });

  it('filters by LIKE on category (ASCII case-insensitive per SQLite default)', () => {
    const result = listBudgets(db, { search: 'apple', limit: 50, offset: 0 });
    expect(result.total).toBe(2);
    expect(result.rows.every((r) => r.category.startsWith('Apple'))).toBe(true);
  });

  it('filters by period equality', () => {
    const result = listBudgets(db, { period: 'Monthly', limit: 50, offset: 0 });
    expect(result.total).toBe(1);
    expect(result.rows[0]?.period).toBe('Monthly');
  });

  it('filters by active=true', () => {
    const result = listBudgets(db, { active: true, limit: 50, offset: 0 });
    expect(result.total).toBe(2);
    expect(result.rows.every((r) => r.active === 1)).toBe(true);
  });

  it('filters by active=false', () => {
    const result = listBudgets(db, { active: false, limit: 50, offset: 0 });
    expect(result.total).toBe(1);
    expect(result.rows[0]?.active).toBe(0);
  });

  it('paginates via limit + offset and reports the unpaginated total', () => {
    const page1 = listBudgets(db, { limit: 2, offset: 0 });
    const page2 = listBudgets(db, { limit: 2, offset: 2 });
    expect(page1.total).toBe(3);
    expect(page1.rows).toHaveLength(2);
    expect(page2.total).toBe(3);
    expect(page2.rows).toHaveLength(1);
  });

  it('enriches each row with `spentCents` (0 by default) and `remainingCents`', () => {
    const result = listBudgets(db, { limit: 50, offset: 0 });
    for (const row of result.rows) {
      expect(row.spentCents).toBe(0);
      if (row.amountCents === null) {
        expect(row.remainingCents).toBeNull();
      } else {
        expect(row.remainingCents).toBe(row.amountCents);
      }
    }
  });
});

describe('updateBudget', () => {
  let db: FinanceTestDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('patches only the supplied fields and bumps lastEditedTime', async () => {
    const created = createBudget(db, { category: 'Tent', amountCents: 10000 });
    const original = created.lastEditedTime;
    await new Promise((r) => setTimeout(r, 5));

    const updated = updateBudget(db, created.id, { amountCents: 25000, active: true });
    expect(updated.id).toBe(created.id);
    expect(updated.category).toBe('Tent');
    expect(updated.amountCents).toBe(25000);
    expect(updated.active).toBe(1);
    expect(updated.lastEditedTime).not.toBe(original);
  });

  it('treats explicit null as a value (clears the field)', () => {
    const created = createBudget(db, { category: 'Helmet', notes: 'Black, matte' });
    const updated = updateBudget(db, created.id, { notes: null });
    expect(updated.notes).toBeNull();
  });

  it('toggles active true → false', () => {
    const created = createBudget(db, { category: 'Mug', active: true });
    const updated = updateBudget(db, created.id, { active: false });
    expect(updated.active).toBe(0);
  });

  it('is a no-op when the patch is empty (but still returns the row)', () => {
    const created = createBudget(db, { category: 'Empty' });
    const updated = updateBudget(db, created.id, {});
    expect(updated.lastEditedTime).toBe(created.lastEditedTime);
    expect(updated.category).toBe('Empty');
  });

  it('throws BudgetNotFoundError for an unknown id', () => {
    expect(() => updateBudget(db, 'missing', { category: 'x' })).toThrow(BudgetNotFoundError);
  });

  it('throws BudgetConflictError when an update would collide with an existing budget', () => {
    createBudget(db, { category: 'Food', period: 'Monthly', amountCents: 10000 });
    const second = createBudget(db, {
      category: 'Groceries',
      period: 'Monthly',
      amountCents: 5000,
    });

    let thrown: unknown;
    try {
      updateBudget(db, second.id, { category: 'Food' });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(BudgetConflictError);
    if (thrown instanceof BudgetConflictError) {
      expect(thrown.category).toBe('Food');
      expect(thrown.period).toBe('Monthly');
    }
  });

  it('uses post-patch (category, period) in the conflict error when period also changes', () => {
    createBudget(db, { category: 'Food', period: 'Yearly', amountCents: 100000 });
    const second = createBudget(db, {
      category: 'Groceries',
      period: 'Monthly',
      amountCents: 5000,
    });

    let thrown: unknown;
    try {
      updateBudget(db, second.id, { category: 'Food', period: 'Yearly' });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(BudgetConflictError);
    if (thrown instanceof BudgetConflictError) {
      expect(thrown.category).toBe('Food');
      expect(thrown.period).toBe('Yearly');
    }
  });
});

describe('createBudget — UNIQUE constraint mapping (race-survivor)', () => {
  let db: FinanceTestDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('maps a UNIQUE violation on INSERT to BudgetConflictError when the pre-check is bypassed', () => {
    createBudget(db, { category: 'Groceries', period: 'Monthly', amountCents: 10000 });

    const raw = db.$client;
    raw.exec(`
      CREATE TRIGGER inject_duplicate
      BEFORE INSERT ON budgets
      WHEN NEW.category = 'RaceCategory' AND NEW.period = 'Monthly'
      BEGIN
        UPDATE budgets SET category = 'RaceCategory' WHERE category = 'Groceries' AND period = 'Monthly';
      END;
    `);

    let thrown: unknown;
    try {
      createBudget(db, { category: 'RaceCategory', period: 'Monthly', amountCents: 20000 });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(BudgetConflictError);
    if (thrown instanceof BudgetConflictError) {
      expect(thrown.category).toBe('RaceCategory');
      expect(thrown.period).toBe('Monthly');
    }
  });
});

describe('deleteBudget', () => {
  let db: FinanceTestDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('removes the row and subsequent get throws', () => {
    const created = createBudget(db, { category: 'Backpack' });
    deleteBudget(db, created.id);
    expect(() => getBudget(db, created.id)).toThrow(BudgetNotFoundError);
  });

  it('throws BudgetNotFoundError when the row is already gone', () => {
    expect(() => deleteBudget(db, 'missing')).toThrow(BudgetNotFoundError);
  });
});

describe('withSpend', () => {
  let db: FinanceTestDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns spent=0 and remaining=amount when no transactions match', () => {
    const created = createBudget(db, {
      category: 'Groceries',
      amountCents: 80000,
      period: 'Monthly',
    });
    const enriched = withSpend(db, created, new Date('2026-02-15T12:00:00.000Z'));
    expect(enriched.spentCents).toBe(0);
    expect(enriched.remainingCents).toBe(80000);
  });

  it('returns remaining=null when the budget has no amount', () => {
    const created = createBudget(db, { category: 'Groceries', amountCents: null });
    const enriched = withSpend(db, created);
    expect(enriched.remainingCents).toBeNull();
  });
});

describe('listBudgets — spend aggregation', () => {
  let db: FinanceTestDb;
  const NOW = new Date('2026-02-15T12:00:00.000Z');

  beforeEach(() => {
    db = freshDb();
  });

  function seedGroceriesBudget(amountCents: number, period: string | null = 'Monthly'): void {
    createBudget(db, { category: 'Groceries', period, amountCents, active: true });
  }

  it('reports zero spend when no matching transactions exist', () => {
    seedGroceriesBudget(80000);

    const { rows } = listBudgets(db, { limit: 10, offset: 0, now: NOW });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.spentCents).toBe(0);
    expect(rows[0]?.remainingCents).toBe(80000);
  });

  it('sums month-to-date outflows that match the budget category', () => {
    seedGroceriesBudget(80000);
    seedTransaction(db, {
      description: 'Woolworths',
      amountCents: -10000,
      date: '2026-02-03',
      type: 'purchase',
      tags: ['Groceries'],
    });
    seedTransaction(db, {
      description: 'Coles',
      amountCents: -5050,
      date: '2026-02-10',
      type: 'purchase',
      tags: ['Groceries'],
    });

    const { rows } = listBudgets(db, { limit: 10, offset: 0, now: NOW });
    expect(rows[0]?.spentCents).toBe(15050);
    expect(rows[0]?.remainingCents).toBe(64950);
  });

  it('ignores income (positive amounts) when summing spend', () => {
    seedGroceriesBudget(80000);
    seedTransaction(db, {
      description: 'Refund',
      amountCents: 2500,
      date: '2026-02-05',
      type: 'income',
      tags: ['Groceries'],
    });

    const { rows } = listBudgets(db, { limit: 10, offset: 0, now: NOW });
    expect(rows[0]?.spentCents).toBe(0);
    expect(rows[0]?.remainingCents).toBe(80000);
  });

  it('ignores transactions with type=Transfer', () => {
    seedGroceriesBudget(80000);
    seedTransaction(db, {
      description: 'Transfer to Savings',
      amountCents: -50000,
      date: '2026-02-05',
      type: 'transfer',
      tags: ['Groceries', 'Transfer'],
    });

    const { rows } = listBudgets(db, { limit: 10, offset: 0, now: NOW });
    expect(rows[0]?.spentCents).toBe(0);
    expect(rows[0]?.remainingCents).toBe(80000);
  });

  it('ignores transactions tagged with other categories', () => {
    seedGroceriesBudget(80000);
    seedTransaction(db, {
      description: 'Netflix',
      amountCents: -2299,
      date: '2026-02-05',
      type: 'purchase',
      tags: ['Entertainment'],
    });

    const { rows } = listBudgets(db, { limit: 10, offset: 0, now: NOW });
    expect(rows[0]?.spentCents).toBe(0);
  });

  it('yearly window includes prior months in the same year but excludes prior year', () => {
    seedGroceriesBudget(500000, 'Yearly');
    seedTransaction(db, {
      description: 'January spend',
      amountCents: -20000,
      date: '2026-01-15',
      type: 'purchase',
      tags: ['Groceries'],
    });
    seedTransaction(db, {
      description: 'February spend',
      amountCents: -10000,
      date: '2026-02-10',
      type: 'purchase',
      tags: ['Groceries'],
    });
    seedTransaction(db, {
      description: 'Last year December',
      amountCents: -99900,
      date: '2025-12-28',
      type: 'purchase',
      tags: ['Groceries'],
    });

    const { rows } = listBudgets(db, { limit: 10, offset: 0, now: NOW });
    expect(rows[0]?.spentCents).toBe(30000);
    expect(rows[0]?.remainingCents).toBe(470000);
  });

  it('clamps the upper bound of MTD/YTD to today (no future-dated counts)', () => {
    seedGroceriesBudget(80000);
    seedTransaction(db, {
      description: 'Future outflow',
      amountCents: -100000,
      date: '2026-02-28',
      type: 'purchase',
      tags: ['Groceries'],
    });

    const { rows } = listBudgets(db, { limit: 10, offset: 0, now: NOW });
    expect(rows[0]?.spentCents).toBe(0);
  });

  it('honours the custom `now` override for the period window', () => {
    seedGroceriesBudget(80000);
    seedTransaction(db, {
      description: 'March spend',
      amountCents: -12000,
      date: '2026-03-04',
      type: 'purchase',
      tags: ['Groceries'],
    });

    const febNow = new Date('2026-02-20T12:00:00.000Z');
    const marchNow = new Date('2026-03-20T12:00:00.000Z');

    const feb = listBudgets(db, { limit: 10, offset: 0, now: febNow });
    const march = listBudgets(db, { limit: 10, offset: 0, now: marchNow });

    expect(feb.rows[0]?.spentCents).toBe(0);
    expect(march.rows[0]?.spentCents).toBe(12000);
  });

  it('counts a multi-tag transaction once when it carries the budget category', () => {
    seedGroceriesBudget(80000);
    seedTransaction(db, {
      description: 'Groceries + bonus',
      amountCents: -7500,
      date: '2026-02-04',
      type: 'purchase',
      tags: ['Groceries', 'Shopping', 'Essentials'],
    });

    const { rows } = listBudgets(db, { limit: 10, offset: 0, now: NOW });
    expect(rows[0]?.spentCents).toBe(7500);
  });

  it('produces a negative `remaining` when spend exceeds the budget amount', () => {
    seedGroceriesBudget(10000);
    seedTransaction(db, {
      description: 'Big shop',
      amountCents: -25000,
      date: '2026-02-05',
      type: 'purchase',
      tags: ['Groceries'],
    });

    const { rows } = listBudgets(db, { limit: 10, offset: 0, now: NOW });
    expect(rows[0]?.spentCents).toBe(25000);
    expect(rows[0]?.remainingCents).toBe(-15000);
  });

  it('null-period budgets aggregate spend across all time', () => {
    createBudget(db, { category: 'Groceries', period: null, amountCents: 100000, active: true });
    seedTransaction(db, {
      description: 'Last year',
      amountCents: -20000,
      date: '2024-06-01',
      type: 'purchase',
      tags: ['Groceries'],
    });
    seedTransaction(db, {
      description: 'This year',
      amountCents: -30000,
      date: '2026-02-10',
      type: 'purchase',
      tags: ['Groceries'],
    });

    const { rows } = listBudgets(db, { limit: 10, offset: 0, now: NOW });
    expect(rows[0]?.spentCents).toBe(50000);
    expect(rows[0]?.remainingCents).toBe(50000);
  });
});

describe('computeSpent', () => {
  let db: FinanceTestDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns 0 against an empty transactions table', () => {
    expect(computeSpent(db, 'Groceries', 'Monthly', new Date('2026-02-15T12:00:00.000Z'))).toBe(0);
  });

  it('aggregates only the targeted category', () => {
    seedTransaction(db, {
      description: 'Groceries',
      amountCents: -5000,
      date: '2026-02-10',
      type: 'purchase',
      tags: ['Groceries'],
    });
    seedTransaction(db, {
      description: 'Coffee',
      amountCents: -1000,
      date: '2026-02-10',
      type: 'purchase',
      tags: ['Coffee'],
    });

    expect(computeSpent(db, 'Groceries', 'Monthly', new Date('2026-02-15T12:00:00.000Z'))).toBe(
      5000
    );
  });
});

describe('periodWindowStart', () => {
  it('returns the first day of the current month for "Monthly"', () => {
    expect(periodWindowStart('Monthly', new Date('2026-02-15T12:00:00.000Z'))).toBe('2026-02-01');
    expect(periodWindowStart('Monthly', new Date('2026-12-31T23:59:59.000Z'))).toBe('2026-12-01');
    expect(periodWindowStart('Monthly', new Date('2026-03-04T00:00:00.000Z'))).toBe('2026-03-01');
  });

  it('returns the first day of the current year for "Yearly"', () => {
    expect(periodWindowStart('Yearly', new Date('2026-06-15T12:00:00.000Z'))).toBe('2026-01-01');
    expect(periodWindowStart('Yearly', new Date('2026-01-02T00:00:00.000Z'))).toBe('2026-01-01');
  });

  it('returns null for null/undefined/unknown periods (all-time)', () => {
    expect(periodWindowStart(null)).toBeNull();
    expect(periodWindowStart(undefined)).toBeNull();
    expect(periodWindowStart('')).toBeNull();
    expect(periodWindowStart('weekly')).toBeNull();
    expect(periodWindowStart('Quarterly')).toBeNull();
  });
});

describe('periodWindowEnd', () => {
  it('returns the zero-padded YYYY-MM-DD of `now`', () => {
    expect(periodWindowEnd(new Date('2026-02-05T12:00:00.000Z'))).toBe('2026-02-05');
    expect(periodWindowEnd(new Date('2026-12-31T23:59:59.000Z'))).toBe('2026-12-31');
  });
});
