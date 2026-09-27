import { describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../model/placement-model.js';
import { at, inBox, item, wasAt } from '../test-fixtures/core-factory.js';
import { coreWorld } from '../test-fixtures/core.js';
import {
  carriedCount,
  hasPreviousPlace,
  itemSelectionActions,
  refusalReason,
  takeOutTarget,
} from './selection-actions.js';

describe('itemSelectionActions', () => {
  it('keeps the design order and puts the four overflow actions last', () => {
    const handlers = {
      'pick-up': vi.fn(),
      move: vi.fn(),
      'take-out': vi.fn(),
      label: vi.fn(),
      'set-type': vi.fn(),
      'set-field': vi.fn(),
      retire: vi.fn(),
      discard: vi.fn(),
      export: vi.fn(),
      'copy-codes': vi.fn(),
    };

    expect(
      itemSelectionActions(coreWorld, ['itm-lamp'], handlers).map((action) => action.id)
    ).toEqual([
      'pick-up',
      'move',
      'take-out',
      'label',
      'set-type',
      'set-field',
      'retire',
      'discard',
      'export',
      'copy-codes',
    ]);
    expect(
      itemSelectionActions(coreWorld, ['itm-lamp'], handlers)
        .slice(-4)
        .every((action) => action.overflow === true)
    ).toBe(true);
  });

  it('keeps optional actions and reports placement and label guards', () => {
    const allInHand = itemSelectionActions(coreWorld, ['itm-tape'], { 'pick-up': vi.fn() });
    expect(allInHand[0]?.disabledReason).toBe('Already in hand');
    expect(
      itemSelectionActions(coreWorld, ['itm-lamp'], { 'take-out': vi.fn() }).find(
        (action) => action.id === 'take-out'
      )?.disabledReason
    ).toBe('None of these is inside a container');
    expect(
      itemSelectionActions(
        coreWorld,
        Array.from({ length: 201 }, (_, index) => `missing-${index}`),
        { label: vi.fn() }
      ).find((action) => action.id === 'label')?.disabledReason
    ).toBe('Print labels takes at most 200 items');
    expect(
      itemSelectionActions(coreWorld, ['itm-lamp'], { move: vi.fn() }).map((action) => action.id)
    ).toEqual([
      'pick-up',
      'move',
      'take-out',
      'label',
      'set-type',
      'set-field',
      'retire',
      'discard',
      'export',
      'copy-codes',
    ]);
  });
});

describe('carriedCount', () => {
  it('counts deep unselected contents only once for nested selected containers', () => {
    expect(
      carriedCount(
        ['box-cables', 'box-parts'],
        { 'box-cables': { direct: 2, deep: 3 }, 'box-parts': { direct: 1, deep: 1 } },
        coreWorld
      )
    ).toBe(2);
  });

  it('subtracts selected descendants from a selected container total', () => {
    expect(
      carriedCount(
        ['box-cables', 'itm-charger'],
        { 'box-cables': { direct: 2, deep: 3 } },
        coreWorld
      )
    ).toBe(2);
  });
});

describe('placement and refusal helpers', () => {
  it('returns the containing placement for Take out', () => {
    expect(takeOutTarget(coreWorld, 'itm-charger')).toEqual({
      kind: 'location',
      locationId: 'loc-shelving',
    });
    expect(takeOutTarget(coreWorld, 'itm-sheets')).toEqual({ kind: 'in-hand' });
    expect(takeOutTarget(coreWorld, 'itm-lamp')).toBeNull();
  });

  it('returns null when the containing item is missing', () => {
    const stranded = item(['stranded', 'Stranded', null], inBox('missing'));
    expect(takeOutTarget(buildWorld([stranded], []), 'stranded')).toBeNull();
  });

  it('recognises fixed previous places but not deleted ones', () => {
    const fixed = item(['fixed', 'Fixed', null], at('loc-desk'), { previous: wasAt('loc-garage') });
    const deleted = item(['deleted', 'Deleted', null], at('loc-desk'), {
      previous: { kind: 'deleted', name: 'Old place' },
    });
    expect(hasPreviousPlace(fixed)).toBe(true);
    expect(hasPreviousPlace(deleted)).toBe(false);
  });

  it('maps every refusal family to stable inline copy', () => {
    expect(refusalReason({ kind: 'no-previous-place' })).toBe('It has no place to go back to.');
    expect(
      refusalReason({
        kind: 'outcome',
        outcome: {
          status: 'rejected',
          mutationId: 'm',
          reason: 'closed',
          message: 'Box is closed.',
        },
      })
    ).toBe('Box is closed.');
    expect(
      refusalReason({
        kind: 'outcome',
        outcome: { status: 'deferred', mutationId: 'm', waitingOn: 'x' },
      })
    ).toBe('Waiting on another change.');
  });
});
