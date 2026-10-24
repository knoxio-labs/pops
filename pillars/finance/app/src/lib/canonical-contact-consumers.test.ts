import { describe, expect, it } from 'vitest';

import { type ConfirmedTransaction, type ProcessedTransaction } from '@pops/finance';

import { classifyAssignedEntity } from '../components/imports/lib/assigned-entity';
import {
  moveOneToMatched,
  overridesAutomaticMatch,
} from '../components/imports/review/useReviewActions';
import { computeProposals } from '../components/imports/rule-creation/utils';
import { groupByEntity } from '../components/imports/tag-review/tagReviewUtils';
import { pendingTagRuleKey } from './tag-rule-reconcile';
import { groupTransactionsByEntity } from './transaction-utils';

const identities = new Map([
  ['old-a', 'current'],
  ['old-b', 'current'],
  ['current', 'current'],
  ['homonym', 'homonym'],
  ['missing-a', null],
  ['missing-b', null],
]);

function confirmed(entityId: string, checksum = entityId): ConfirmedTransaction {
  return {
    date: '2026-10-01',
    description: 'STORE PAYMENT',
    amount: -10,
    dialectAccountLabel: 'Amex',
    rawRow: '{}',
    checksum,
    entityId,
    entityName: 'Alex Smith',
    tags: ['Travel'],
  };
}
function processed(entityId: string): ProcessedTransaction {
  return {
    ...confirmed(entityId),
    entity: { entityId, entityName: 'Alex Smith', matchType: 'exact' },
    status: 'matched',
  };
}

describe('canonical identity consumers in the import client', () => {
  it('combines aliases in tag and transaction groups while keeping homonyms apart', () => {
    const rows = [confirmed('old-a'), confirmed('old-b'), confirmed('homonym')];
    expect(
      groupByEntity(rows, identities).map((group) => group.transactions.map((row) => row.entityId))
    ).toEqual([['old-a', 'old-b'], ['homonym']]);
    const groups = groupTransactionsByEntity(
      rows.map((row) => processed(row.entityId ?? '')),
      'name',
      identities
    );
    expect(groups.map((group) => group.transactions.length)).toEqual([2, 1]);
    expect(rows.map((row) => row.entityId)).toEqual(['old-a', 'old-b', 'homonym']);
  });

  it('does not combine unrelated confirmed-missing identities', () => {
    expect(
      groupByEntity([confirmed('missing-a'), confirmed('missing-b')], identities)
    ).toHaveLength(2);
  });

  it('derives one proposal across aliases and preserves its originating raw scope', () => {
    const proposals = computeProposals(
      [confirmed('old-a'), confirmed('old-b'), confirmed('homonym')],
      [],
      [],
      identities
    );
    expect(proposals).toMatchObject([
      { entityId: 'old-a', affectsCount: 2 },
      { entityId: 'homonym', affectsCount: 1 },
    ]);
    const entry = (entityId: string) => ({
      changeSet: {
        source: 'test',
        reason: 'Test staging',
        ops: [
          {
            op: 'add' as const,
            data: {
              descriptionPattern: 'STORE PAYMENT',
              matchType: 'contains' as const,
              entityId,
              tags: ['Travel'],
            },
          },
        ],
      },
    });
    expect(pendingTagRuleKey(entry('old-a'), identities)).toBe(
      pendingTagRuleKey(entry('old-b'), identities)
    );
    expect(pendingTagRuleKey(entry('old-a'), identities)).not.toBe(
      pendingTagRuleKey(entry('homonym'), identities)
    );
  });

  it('recognizes a retired assignment without reporting it missing or learning a false override', () => {
    const row = processed('old-a');
    expect(classifyAssignedEntity(row, [{ id: 'current' }], identities)).toBe('resolved');
    expect(overridesAutomaticMatch(row, 'current', identities)).toBe(false);
    expect(overridesAutomaticMatch(row, 'homonym', identities)).toBe(true);
    const next = moveOneToMatched(
      { matched: [row], uncertain: [], failed: [], skipped: [] },
      {
        transaction: row,
        entityId: 'current',
        entityName: 'Alex Smith',
        matchType: 'manual',
        identities,
      }
    );
    expect(next.matched[0]?.entity.entityId).toBe('old-a');
  });
});
