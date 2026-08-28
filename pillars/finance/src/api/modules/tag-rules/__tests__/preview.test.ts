/**
 * POPS-2599 — the ChangeSet impact preview reports a real before/after diff.
 *
 * Each test here fails against the previous implementation, which hardcoded
 * `before` to `[]`, materialized only `add` ops, and computed its totals after
 * truncating the input.
 */
import { describe, expect, it, vi } from 'vitest';

import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import {
  tagVocabularyService,
  transactionCorrectionsService,
  transactionTagRulesService,
  type FinanceDb,
} from '../../../../db/index.js';
import { suggestTags } from '../../tag-suggester/index.js';
import { loadPersistedTagRules, mergeChangeSetOverRules } from '../merged-rules.js';
import { previewTagRuleChangeSet } from '../preview.js';

import type { TagRuleChangeSet } from '../../../../contract/rest-tag-rules.js';
import type { PreviewInputTransaction } from '../types.js';

function withDb<T>(fn: (db: FinanceDb) => T): T {
  const { db, raw } = freshMigratedFinanceDb();
  try {
    return fn(db);
  } finally {
    raw.close();
  }
}

function preview(db: FinanceDb, changeSet: TagRuleChangeSet, txs: PreviewInputTransaction[]) {
  return previewTagRuleChangeSet(db, { changeSet, transactions: txs, maxPreviewItems: 50 });
}

function row(id: string, description: string): PreviewInputTransaction {
  return { transactionId: id, description };
}

const addOp = (pattern: string, tags: string[]): TagRuleChangeSet => ({
  ops: [{ op: 'add', data: { descriptionPattern: pattern, matchType: 'contains', tags } }],
});

describe('previewTagRuleChangeSet — before is the real persisted outcome', () => {
  it('reports zero impact for a rule proposing a tag an existing rule already supplies', () => {
    withDb((db) => {
      transactionTagRulesService.createTransactionTagRule(db, {
        descriptionPattern: 'WOOLWORTHS',
        matchType: 'contains',
        tags: ['Groceries'],
      });

      const result = preview(db, addOp('WOOLWORTHS METRO', ['Groceries']), [
        row('t1', 'WOOLWORTHS METRO 1234'),
        row('t2', 'WOOLWORTHS METRO 5678'),
      ]);

      expect(result.counts.affected).toBe(0);
      expect(result.affected).toEqual([]);
    });
  });

  it('reports impact for a rule proposing a tag no existing rule supplies', () => {
    withDb((db) => {
      transactionTagRulesService.createTransactionTagRule(db, {
        descriptionPattern: 'WOOLWORTHS',
        matchType: 'contains',
        tags: ['Groceries'],
      });

      const result = preview(db, addOp('WOOLWORTHS METRO', ['Groceries', 'Weekly']), [
        row('t1', 'WOOLWORTHS METRO 1234'),
      ]);

      expect(result.counts.affected).toBe(1);
      expect(result.counts.suggestionChanges).toBe(1);
      expect(result.counts.removed).toBe(0);
      expect(result.affected[0]?.before.suggestedTags.map((s) => s.tag)).toEqual(['Groceries']);
      expect(result.affected[0]?.after.suggestedTags.map((s) => s.tag)).toEqual([
        'Groceries',
        'Weekly',
      ]);
    });
  });
});

describe('previewTagRuleChangeSet — non-add ops', () => {
  it('reports the tags a disable op would take away', () => {
    withDb((db) => {
      const rule = transactionTagRulesService.createTransactionTagRule(db, {
        descriptionPattern: 'NETFLIX',
        matchType: 'contains',
        tags: ['Subscriptions'],
      });

      const result = preview(db, { ops: [{ op: 'disable', id: rule.id }] }, [
        row('t1', 'NETFLIX.COM'),
      ]);

      expect(result.counts.affected).toBe(1);
      expect(result.counts.removed).toBe(1);
      expect(result.affected[0]?.before.suggestedTags.map((s) => s.tag)).toEqual(['Subscriptions']);
      expect(result.affected[0]?.after.suggestedTags).toEqual([]);
    });
  });

  it('reports the tags a remove op would take away', () => {
    withDb((db) => {
      const rule = transactionTagRulesService.createTransactionTagRule(db, {
        descriptionPattern: 'NETFLIX',
        matchType: 'contains',
        tags: ['Subscriptions'],
      });

      const result = preview(db, { ops: [{ op: 'remove', id: rule.id }] }, [
        row('t1', 'NETFLIX.COM'),
      ]);

      expect(result.counts.removed).toBe(1);
    });
  });

  it('reports both halves of an edit that swaps one tag for two', () => {
    withDb((db) => {
      const rule = transactionTagRulesService.createTransactionTagRule(db, {
        descriptionPattern: 'UBER',
        matchType: 'contains',
        tags: ['Transport'],
      });

      const result = preview(
        db,
        { ops: [{ op: 'edit', id: rule.id, data: { tags: ['Rideshare', 'Travel'] } }] },
        [row('t1', 'UBER TRIP SYDNEY')]
      );

      expect(result.counts.affected).toBe(1);
      expect(result.counts.suggestionChanges).toBe(3);
      expect(result.counts.removed).toBe(1);
    });
  });

  it('scopes an edit to the rule the op names', () => {
    withDb((db) => {
      const target = transactionTagRulesService.createTransactionTagRule(db, {
        descriptionPattern: 'UBER',
        matchType: 'contains',
        tags: ['Transport'],
      });
      transactionTagRulesService.createTransactionTagRule(db, {
        descriptionPattern: 'NETFLIX',
        matchType: 'contains',
        tags: ['Subscriptions'],
      });

      const result = preview(db, { ops: [{ op: 'disable', id: target.id }] }, [
        row('t1', 'UBER TRIP'),
        row('t2', 'NETFLIX.COM'),
      ]);

      expect(result.affected.map((a) => a.transactionId)).toEqual(['t1']);
    });
  });
});

describe('previewTagRuleChangeSet — counts are independent', () => {
  it('separates affected rows from the individual tag changes across them', () => {
    withDb((db) => {
      const rule = transactionTagRulesService.createTransactionTagRule(db, {
        descriptionPattern: 'UBER',
        matchType: 'contains',
        tags: ['Transport'],
      });

      const result = preview(
        db,
        {
          ops: [
            { op: 'edit', id: rule.id, data: { tags: ['Rideshare', 'Travel'] } },
            {
              op: 'add',
              data: { descriptionPattern: 'NETFLIX', matchType: 'contains', tags: ['Streaming'] },
            },
          ],
        },
        [row('t1', 'UBER TRIP'), row('t2', 'NETFLIX.COM')]
      );

      expect(result.counts.affected).toBe(2);
      expect(result.counts.suggestionChanges).toBe(4);
      expect(result.counts.affected).not.toBe(result.counts.suggestionChanges);
    });
  });
});

describe('previewTagRuleChangeSet — totals are computed before truncation', () => {
  it('counts every input row while capping the rendered list', () => {
    withDb((db) => {
      const txs = Array.from({ length: 120 }, (_, i) => row(`t${i}`, `WOOLWORTHS METRO ${i}`));

      const result = previewTagRuleChangeSet(db, {
        changeSet: addOp('WOOLWORTHS', ['Groceries']),
        transactions: txs,
        maxPreviewItems: 50,
      });

      expect(result.counts.affected).toBe(120);
      expect(result.affected).toHaveLength(50);
    });
  });

  it('lists every new vocabulary tag even when its row is past the cap', () => {
    withDb((db) => {
      const txs = [
        ...Array.from({ length: 60 }, (_, i) => row(`t${i}`, `WOOLWORTHS ${i}`)),
        row('late', 'NETFLIX.COM'),
      ];

      const result = previewTagRuleChangeSet(db, {
        changeSet: {
          ops: [
            {
              op: 'add',
              data: {
                descriptionPattern: 'WOOLWORTHS',
                matchType: 'contains',
                tags: ['Groceries'],
              },
            },
            {
              op: 'add',
              data: { descriptionPattern: 'NETFLIX', matchType: 'contains', tags: ['Streaming'] },
            },
          ],
        },
        transactions: txs,
        maxPreviewItems: 50,
      });

      expect(result.affected).toHaveLength(50);
      expect(result.newTags).toEqual(['Groceries', 'Streaming']);
    });
  });

  it('marks a tag already in the vocabulary as not new', () => {
    withDb((db) => {
      tagVocabularyService.upsertVocabularyTag(db, 'groceries', 'user');

      const result = preview(db, addOp('WOOLWORTHS', ['Groceries']), [row('t1', 'WOOLWORTHS 1')]);

      expect(result.newTags).toEqual([]);
      expect(result.counts.newTagProposals).toBe(0);
    });
  });
});

describe('previewTagRuleChangeSet — user-tagged rows', () => {
  it('excludes a row the user has already tagged by hand', () => {
    withDb((db) => {
      const result = preview(db, addOp('WOOLWORTHS', ['Groceries']), [
        { transactionId: 't1', description: 'WOOLWORTHS 1', userTags: ['Mine'] },
        row('t2', 'WOOLWORTHS 2'),
      ]);

      expect(result.affected.map((a) => a.transactionId)).toEqual(['t2']);
      expect(result.counts.affected).toBe(1);
    });
  });

  it('excludes a row the user edited down to no tags at all', () => {
    withDb((db) => {
      const result = preview(db, addOp('WOOLWORTHS', ['Groceries']), [
        { transactionId: 't1', description: 'WOOLWORTHS 1', userTags: [] },
      ]);

      expect(result.counts.affected).toBe(0);
    });
  });
});

describe('previewTagRuleChangeSet — parity with the import pipeline', () => {
  const CORPUS = [
    'WOOLWORTHS METRO 1234 SYDNEY',
    'uber eats 99',
    'NETFLIX.COM',
    'Coles Express 4412',
    'TRANSFER TO SAVINGS',
    'AMZN Mktp AU*1A2B3C',
  ];

  it('produces the same after-state the suggester produces on the merged rule set', () => {
    withDb((db) => {
      transactionTagRulesService.createTransactionTagRule(db, {
        descriptionPattern: 'COLES',
        matchType: 'contains',
        tags: ['Groceries'],
      });
      const disabled = transactionTagRulesService.createTransactionTagRule(db, {
        descriptionPattern: 'NETFLIX',
        matchType: 'contains',
        tags: ['Subscriptions'],
      });
      const changeSet: TagRuleChangeSet = {
        ops: [
          { op: 'disable', id: disabled.id },
          {
            op: 'add',
            data: { descriptionPattern: 'UBER EATS', matchType: 'contains', tags: ['Eat Out'] },
          },
        ],
      };

      const result = previewTagRuleChangeSet(db, {
        changeSet,
        transactions: CORPUS.map((d, i) => row(`t${i}`, d)),
        maxPreviewItems: CORPUS.length,
      });
      const merged = mergeChangeSetOverRules(loadPersistedTagRules(db), changeSet);

      for (const item of result.affected) {
        const expected = suggestTags(db, {
          description: item.description,
          entityId: null,
          recordTagRuleUsage: false,
          tagRules: merged,
        });
        expect(item.after.suggestedTags.map((s) => s.tag)).toEqual(expected.map((s) => s.tag));
      }
      expect(result.affected.length).toBeGreaterThan(0);
    });
  });

  it('produces a before-state equal to the live DB path', () => {
    withDb((db) => {
      transactionTagRulesService.createTransactionTagRule(db, {
        descriptionPattern: 'COLES',
        matchType: 'contains',
        tags: ['Groceries'],
      });

      const result = preview(db, addOp('COLES', ['Groceries', 'Weekly']), [
        row('t0', 'Coles Express 4412'),
      ]);

      const live = suggestTags(db, {
        description: 'Coles Express 4412',
        entityId: null,
        recordTagRuleUsage: false,
      });
      expect(result.affected[0]?.before.suggestedTags.map((s) => s.tag)).toEqual(
        live.map((s) => s.tag)
      );
    });
  });
});

describe('previewTagRuleChangeSet — corrections are fetched once per run (POPS-2634)', () => {
  it('issues a constant number of correction queries, independent of row count', () => {
    withDb((db) => {
      transactionTagRulesService.createTransactionTagRule(db, {
        descriptionPattern: 'WOOLWORTHS',
        matchType: 'contains',
        tags: ['Groceries'],
      });

      const listSpy = vi.spyOn(
        transactionCorrectionsService,
        'listActiveTransactionCorrectionsForMatching'
      );
      const perCallSpy = vi.spyOn(
        transactionCorrectionsService,
        'findAllMatchingTransactionCorrections'
      );

      const txs = Array.from({ length: 100 }, (_, i) => row(`t${i}`, `WOOLWORTHS METRO ${i}`));

      const result = previewTagRuleChangeSet(db, {
        changeSet: addOp('WOOLWORTHS METRO', ['Groceries', 'Weekly']),
        transactions: txs,
        maxPreviewItems: 100,
      });

      expect(result.counts.affected).toBe(100);
      expect(listSpy).toHaveBeenCalledTimes(1);
      expect(perCallSpy).not.toHaveBeenCalled();

      listSpy.mockRestore();
      perCallSpy.mockRestore();
    });
  });
});

describe('previewTagRuleChangeSet — a preview is not a use', () => {
  it('leaves timesApplied and lastUsedAt untouched on every rule it reads', () => {
    withDb((db) => {
      const rule = transactionTagRulesService.createTransactionTagRule(db, {
        descriptionPattern: 'WOOLWORTHS',
        matchType: 'contains',
        tags: ['Groceries'],
      });

      preview(db, addOp('WOOLWORTHS METRO', ['Weekly']), [
        row('t1', 'WOOLWORTHS METRO 1'),
        row('t2', 'WOOLWORTHS METRO 2'),
      ]);

      const after = transactionTagRulesService.getTransactionTagRule(db, rule.id);
      expect(after.timesApplied).toBe(rule.timesApplied);
      expect(after.lastUsedAt).toBe(rule.lastUsedAt);
    });
  });
});
