/**
 * The write half of `repair-unmatchable-tag-rules.ts`, against a migrated
 * database.
 *
 * The verdict is covered next door at the pure tier. This covers what the
 * verdict is then used to do, which is the part that cannot be undone: which
 * columns are written, which rows are left untouched, and the `matchType`
 * coercion that decides whether a repaired rule can fire at all.
 */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  freshMigratedFinanceDb,
  type MigratedFinanceDb,
} from '../../src/db/__tests__/migrated-db.js';
import { transactionTagRules } from '../../src/db/index.js';
import {
  applyRepairs,
  type RepairPlan,
  type RuleUnderRepair,
} from '../repair-unmatchable-tag-rules.js';

let opened: MigratedFinanceDb;

function seedRule(
  id: string,
  overrides: Partial<typeof transactionTagRules.$inferInsert> = {}
): void {
  opened.db
    .insert(transactionTagRules)
    .values({
      id,
      descriptionPattern: 'IMPERIAL HOTEL ERSKINEVILLE',
      matchType: 'exact',
      tags: '["pub"]',
      ...overrides,
    })
    .run();
}

function readRule(id: string) {
  return opened.db.select().from(transactionTagRules).where(eq(transactionTagRules.id, id)).get();
}

function subject(id: string, plan: RepairPlan): { rule: RuleUnderRepair; plan: RepairPlan } {
  return {
    rule: {
      id,
      pattern: 'IMPERIAL HOTEL ERSKINEVILLE',
      matchType: 'exact',
      entityId: 'entity-1',
      descriptions: [],
    },
    plan,
  };
}

beforeEach(() => {
  opened = freshMigratedFinanceDb();
});

afterEach(() => {
  opened.raw.close();
});

describe('applyRepairs', () => {
  it('rewrites the pattern and forces contains, so the repaired rule can actually fire', () => {
    seedRule('rule-1');

    const written = applyRepairs(opened.db, [
      subject('rule-1', {
        action: 'repair',
        from: 'IMPERIAL HOTEL ERSKINEVILLE',
        to: 'IMPERIAL HOTEL ERSKIN',
      }),
    ]);

    expect(written).toEqual({ repaired: 1, disabled: 0 });
    expect(readRule('rule-1')).toMatchObject({
      descriptionPattern: 'IMPERIAL HOTEL ERSKIN',
      matchType: 'contains',
      isActive: true,
    });
  });

  it('disables without touching the pattern, so the original is still readable', () => {
    seedRule('rule-2', { descriptionPattern: 'TRANSPORT FOR NSW' });

    const written = applyRepairs(opened.db, [
      subject('rule-2', { action: 'disable', from: 'TRANSPORT FOR NSW', reason: 'too broad' }),
    ]);

    expect(written).toEqual({ repaired: 0, disabled: 1 });
    expect(readRule('rule-2')).toMatchObject({
      descriptionPattern: 'TRANSPORT FOR NSW',
      isActive: false,
    });
  });

  it.each(['ok', 'unscoped', 'unused', 'review'] as const)(
    'writes nothing for a %s verdict',
    (action) => {
      seedRule('rule-3', { descriptionPattern: 'ANZ', confidence: 0.9 });
      const plan: RepairPlan =
        action === 'review' ? { action, reason: 'mis-assigned' } : { action };

      expect(applyRepairs(opened.db, [subject('rule-3', plan)])).toEqual({
        repaired: 0,
        disabled: 0,
      });
      expect(readRule('rule-3')).toMatchObject({
        descriptionPattern: 'ANZ',
        matchType: 'exact',
        isActive: true,
        confidence: 0.9,
      });
    }
  );

  it('leaves every other column of a repaired rule alone', () => {
    seedRule('rule-4', {
      tags: '["coffee","brunch"]',
      confidence: 0.8,
      priority: 3,
      timesApplied: 0,
    });

    applyRepairs(opened.db, [
      subject('rule-4', { action: 'repair', from: 'IMPERIAL HOTEL ERSKINEVILLE', to: 'IMPERIAL' }),
    ]);

    expect(readRule('rule-4')).toMatchObject({
      tags: '["coffee","brunch"]',
      confidence: 0.8,
      priority: 3,
      timesApplied: 0,
    });
  });

  it('applies a mixed batch in one pass', () => {
    seedRule('rule-5');
    seedRule('rule-6', { descriptionPattern: 'TRANSPORT FOR NSW' });
    seedRule('rule-7', { descriptionPattern: 'WOOLWORTHS' });

    const written = applyRepairs(opened.db, [
      subject('rule-5', { action: 'repair', from: 'IMPERIAL HOTEL ERSKINEVILLE', to: 'IMPERIAL' }),
      subject('rule-6', { action: 'disable', from: 'TRANSPORT FOR NSW', reason: 'too broad' }),
      subject('rule-7', { action: 'ok' }),
    ]);

    expect(written).toEqual({ repaired: 1, disabled: 1 });
    expect(readRule('rule-7')).toMatchObject({
      descriptionPattern: 'WOOLWORTHS',
      matchType: 'exact',
      isActive: true,
    });
  });
});
