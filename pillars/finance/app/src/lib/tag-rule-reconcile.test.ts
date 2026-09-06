import { describe, expect, it } from 'vitest';

import { elementAt } from '../test-utils';
import { pendingTagRuleKey, reconcilePendingTagRule } from './tag-rule-reconcile';

import type { ConfirmedTransaction, TagRuleChangeSet } from '@pops/finance';

import type { PendingTagRuleChangeSet } from '../store/importStore';

function txn(checksum: string, tags: string[]): ConfirmedTransaction {
  return {
    date: '2026-05-19',
    description: 'SQ *PALMS ON OXFORD',
    amount: -12.66,
    dialectAccountLabel: 'Amex',
    rawRow: '{}',
    checksum,
    entityId: 'entity-palms',
    entityName: 'Palms on Oxford',
    transactionType: 'purchase',
    tags,
  };
}

function ruleFor(tags: string[], overrides: Partial<PendingTagRuleChangeSet> = {}) {
  const changeSet: TagRuleChangeSet = {
    source: 'import-batch',
    reason: 'test',
    ops: [
      {
        op: 'add',
        data: {
          descriptionPattern: 'PALMS ON OXFORD',
          matchType: 'contains',
          entityId: 'entity-palms',
          tags,
        },
      },
    ],
  };
  return {
    tempId: `temp:tagrules:${crypto.randomUUID()}`,
    changeSet,
    appliedAt: '2026-05-19T00:00:00Z',
    source: 'test',
    sourceChecksums: ['chk-1'],
    ...overrides,
  } satisfies PendingTagRuleChangeSet;
}

function opTags(entry: PendingTagRuleChangeSet): string[] {
  const op = elementAt(entry.changeSet.ops, 0);
  return op.op === 'add' || op.op === 'edit' ? (op.data.tags ?? []) : [];
}

describe('reconcilePendingTagRule', () => {
  it('drops a tag the source row no longer carries', () => {
    const rule = ruleFor(['occasion:out', 'venue:bar']);
    const result = reconcilePendingTagRule(rule, [txn('chk-1', ['occasion:out', 'venue:pub'])]);
    expect(result).not.toBeNull();
    expect(opTags(result as PendingTagRuleChangeSet)).toEqual(['occasion:out']);
  });

  it('drops the whole entry when no tag survives, since a tagless rule op is not representable', () => {
    const rule = ruleFor(['venue:bar']);
    expect(reconcilePendingTagRule(rule, [txn('chk-1', ['venue:pub'])])).toBeNull();
  });

  it('narrows acceptedNewTags with the same set, so a dropped tag cannot still enter the vocabulary', () => {
    const rule = ruleFor(['occasion:out', 'venue:bar'], {
      acceptedNewTags: ['occasion:out', 'venue:bar'],
    });
    const result = reconcilePendingTagRule(rule, [txn('chk-1', ['occasion:out'])]);
    expect(result?.acceptedNewTags).toEqual(['occasion:out']);
  });

  it('keeps a tag still carried by any one of several source rows', () => {
    const rule = ruleFor(['venue:pub'], { sourceChecksums: ['chk-1', 'chk-2'] });
    const result = reconcilePendingTagRule(rule, [
      txn('chk-1', ['occasion:out']),
      txn('chk-2', ['venue:pub']),
    ]);
    expect(opTags(result as PendingTagRuleChangeSet)).toEqual(['venue:pub']);
  });

  it('returns the entry unchanged when every tag is still live', () => {
    const rule = ruleFor(['venue:pub']);
    const result = reconcilePendingTagRule(rule, [txn('chk-1', ['venue:pub'])]);
    expect(result).toBe(rule);
  });

  it('leaves an entry with no recorded source rows untouched', () => {
    const rule = ruleFor(['venue:bar'], { sourceChecksums: undefined });
    const result = reconcilePendingTagRule(rule, [txn('chk-1', ['venue:pub'])]);
    expect(result).toBe(rule);
  });

  it('drops the entry when its source rows are gone entirely', () => {
    const rule = ruleFor(['venue:pub']);
    expect(reconcilePendingTagRule(rule, [])).toBeNull();
  });

  it('never adds a tag the rule was not staged with', () => {
    const rule = ruleFor(['venue:pub']);
    const result = reconcilePendingTagRule(rule, [
      txn('chk-1', ['venue:pub', 'contains:alcohol', 'occasion:out']),
    ]);
    expect(opTags(result as PendingTagRuleChangeSet)).toEqual(['venue:pub']);
  });

  it('passes a disable op through untouched — it carries no tags to check', () => {
    const rule = ruleFor(['venue:pub'], {
      changeSet: { source: 'test', ops: [{ op: 'disable', id: 'rule-9' }] },
    });
    expect(reconcilePendingTagRule(rule, [])).toBe(rule);
  });
});

describe('pendingTagRuleKey', () => {
  it('gives two stagings of the same rule one identity', () => {
    expect(pendingTagRuleKey(ruleFor(['venue:pub']))).toBe(
      pendingTagRuleKey(ruleFor(['occasion:out']))
    );
  });

  it('separates rules differing only by entity scope', () => {
    const unscoped = ruleFor(['venue:pub'], {
      changeSet: {
        source: 'test',
        ops: [
          {
            op: 'add',
            data: {
              descriptionPattern: 'PALMS ON OXFORD',
              matchType: 'contains',
              entityId: null,
              tags: ['venue:pub'],
            },
          },
        ],
      },
    });
    expect(pendingTagRuleKey(unscoped)).not.toBe(pendingTagRuleKey(ruleFor(['venue:pub'])));
  });

  it('has no identity for a non-add changeset, which must not be deduped away', () => {
    const disable = ruleFor(['venue:pub'], {
      changeSet: { source: 'test', ops: [{ op: 'disable', id: 'rule-9' }] },
    });
    expect(pendingTagRuleKey(disable)).toBeNull();
  });
});
