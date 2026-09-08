import { describe, expect, it } from 'vitest';

import { reconcilePendingCorrectionChangeSets } from '../corrections-reconcile.js';

import type { ChangeSet } from '../rest-corrections-schemas.js';

function addCs(descriptionPattern: string): ChangeSet {
  return { ops: [{ op: 'add', data: { descriptionPattern, matchType: 'contains', tags: [] } }] };
}

describe('reconcilePendingCorrectionChangeSets (POPS-3158)', () => {
  it('folds an edit of a still-pending add into that add, across separate ChangeSets', () => {
    const changeSets: ChangeSet[] = [
      addCs('MAXXIA_EV'),
      { ops: [{ op: 'edit', id: 'temp:1', data: { descriptionPattern: 'MAXXIA', tags: ['x'] } }] },
    ];

    const reconciled = reconcilePendingCorrectionChangeSets(changeSets);

    expect(reconciled[0]!.ops).toEqual([
      { op: 'add', data: { descriptionPattern: 'MAXXIA', matchType: 'contains', tags: ['x'] } },
    ]);
    expect(reconciled[1]!.ops).toEqual([]);
  });

  it('drops a still-pending add and its remove op together', () => {
    const changeSets: ChangeSet[] = [addCs('THROWAWAY'), { ops: [{ op: 'remove', id: 'temp:1' }] }];

    const reconciled = reconcilePendingCorrectionChangeSets(changeSets);

    expect(reconciled[0]!.ops).toEqual([]);
    expect(reconciled[1]!.ops).toEqual([]);
  });

  it('folds a disable of a still-pending add into isActive: false', () => {
    const changeSets: ChangeSet[] = [
      addCs('DISABLE_ME'),
      { ops: [{ op: 'disable', id: 'temp:1' }] },
    ];

    const reconciled = reconcilePendingCorrectionChangeSets(changeSets);

    expect(reconciled[0]!.ops).toEqual([
      {
        op: 'add',
        data: {
          descriptionPattern: 'DISABLE_ME',
          matchType: 'contains',
          tags: [],
          isActive: false,
        },
      },
    ]);
    expect(reconciled[1]!.ops).toEqual([]);
  });

  it('numbers temp ids across ChangeSets exactly like the client preview (add-before-others per ChangeSet)', () => {
    const changeSets: ChangeSet[] = [
      addCs('FIRST'),
      addCs('SECOND'),
      {
        ops: [
          // temp:3 is minted by this very ChangeSet's own add, sorted before edit/remove
          // the same way applyChangeSetToRules folds a single ChangeSet.
          { op: 'add', data: { descriptionPattern: 'THIRD', matchType: 'contains', tags: [] } },
          { op: 'edit', id: 'temp:2', data: { tags: ['second-edited'] } },
          { op: 'remove', id: 'temp:3' },
        ],
      },
    ];

    const reconciled = reconcilePendingCorrectionChangeSets(changeSets);

    expect(reconciled[0]!.ops).toEqual([
      { op: 'add', data: { descriptionPattern: 'FIRST', matchType: 'contains', tags: [] } },
    ]);
    expect(reconciled[1]!.ops).toEqual([
      {
        op: 'add',
        data: { descriptionPattern: 'SECOND', matchType: 'contains', tags: ['second-edited'] },
      },
    ]);
    expect(reconciled[2]!.ops).toEqual([]);
  });

  it('leaves a temp:<n> with no known origin untouched (a genuine dangling reference stays an error elsewhere)', () => {
    const changeSets: ChangeSet[] = [
      { ops: [{ op: 'edit', id: 'temp:1', data: { tags: ['x'] } }] },
    ];

    const reconciled = reconcilePendingCorrectionChangeSets(changeSets);

    expect(reconciled).toEqual(changeSets);
  });

  it('leaves a real persisted-rule id untouched', () => {
    const changeSets: ChangeSet[] = [{ ops: [{ op: 'disable', id: 'a-real-uuid' }] }];

    expect(reconcilePendingCorrectionChangeSets(changeSets)).toEqual(changeSets);
  });
});
