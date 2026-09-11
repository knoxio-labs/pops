/**
 * POPS-15 — `previewTagRuleChangeSet`'s full-history mode.
 *
 * Each test here fails against the pre-POPS-15 implementation: there was no
 * `previewTagRuleChangeSetFullHistory`, and `previewTagRuleChangeSet` only
 * ever saw the caller-supplied `transactions` array, so a ChangeSet impact on
 * a transaction outside that array was invisible however large the caller's
 * list was.
 */
import { describe, expect, it } from 'vitest';

import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import {
  resolveAccountIdByName,
  transactionsService,
  transactionTagRulesService,
  type FinanceDb,
} from '../../../../db/index.js';
import { previewTagRuleChangeSetFullHistory } from '../preview.js';

import type { TagRuleChangeSet } from '../../../../contract/rest-tag-rules.js';

function withDb<T>(fn: (db: FinanceDb) => T): T {
  const { db, raw } = freshMigratedFinanceDb();
  try {
    return fn(db);
  } finally {
    raw.close();
  }
}

function seedTransaction(db: FinanceDb, description: string): string {
  const accountId = resolveAccountIdByName(db, 'Amex');
  return transactionsService.createTransaction(db, {
    description,
    accountId,
    amountCents: -1000,
    date: '2026-01-01',
  }).id;
}

const addWoolworthsGroceries: TagRuleChangeSet = {
  ops: [
    {
      op: 'add',
      data: { descriptionPattern: 'WOOLWORTHS', matchType: 'contains', tags: ['Groceries'] },
    },
  ],
};

describe('previewTagRuleChangeSetFullHistory', () => {
  it('counts a match lying beyond any caller-supplied list, over the whole DB', () => {
    withDb((db) => {
      for (let i = 0; i < 5; i++) seedTransaction(db, `WOOLWORTHS METRO ${i}`);

      const result = previewTagRuleChangeSetFullHistory(db, {
        changeSet: addWoolworthsGroceries,
        limit: 2,
        offset: 0,
      });

      expect(result.counts.affected).toBe(5);
      expect(result.pagination.total).toBe(5);
      expect(result.affected).toHaveLength(2);
    });
  });

  it('pages through every match exactly once', () => {
    withDb((db) => {
      const ids = Array.from({ length: 7 }, (_, i) => seedTransaction(db, `WOOLWORTHS ${i}`));

      const seen: string[] = [];
      for (let offset = 0; offset < 7; offset += 3) {
        const page = previewTagRuleChangeSetFullHistory(db, {
          changeSet: addWoolworthsGroceries,
          limit: 3,
          offset,
        });
        seen.push(...page.affected.map((item) => item.transactionId));
      }

      expect(seen).toHaveLength(7);
      expect(new Set(seen).size).toBe(7);
      expect(seen.toSorted()).toEqual(ids.toSorted());
    });
  });

  it('returns an empty result for an empty history', () => {
    withDb((db) => {
      const result = previewTagRuleChangeSetFullHistory(db, {
        changeSet: addWoolworthsGroceries,
        limit: 50,
        offset: 0,
      });

      expect(result.counts.affected).toBe(0);
      expect(result.affected).toEqual([]);
      expect(result.pagination).toEqual({ total: 0, limit: 50, offset: 0, hasMore: false });
    });
  });

  it('reports zero impact for a transaction unaffected by the ChangeSet, without excluding it via userTags', () => {
    withDb((db) => {
      seedTransaction(db, 'COLES 1234');

      const result = previewTagRuleChangeSetFullHistory(db, {
        changeSet: addWoolworthsGroceries,
        limit: 50,
        offset: 0,
      });

      expect(result.counts.affected).toBe(0);
      expect(result.affected).toEqual([]);
    });
  });

  it('leaves rule telemetry untouched — a full-history preview is not a use', () => {
    withDb((db) => {
      const rule = transactionTagRulesService.createTransactionTagRule(db, {
        descriptionPattern: 'WOOLWORTHS',
        matchType: 'contains',
        tags: ['Groceries'],
      });
      seedTransaction(db, 'WOOLWORTHS METRO');

      previewTagRuleChangeSetFullHistory(db, {
        changeSet: addWoolworthsGroceries,
        limit: 50,
        offset: 0,
      });

      const after = transactionTagRulesService.getTransactionTagRule(db, rule.id);
      expect(after.timesApplied).toBe(rule.timesApplied);
      expect(after.lastUsedAt).toBe(rule.lastUsedAt);
    });
  });
});
