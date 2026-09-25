import { coreWorld } from '@/fixtures/inventory/core';
import { describe, expect, it } from 'vitest';

import {
  applyDelete,
  deleteButtonLabel,
  deleteOutcome,
  isEmptyPlace,
  planDelete,
} from './delete-plan';
import { createPlace } from './tree-model';

const ids = (entries: readonly { id: string }[]): string[] => entries.map((e) => e.id).toSorted();

describe('isEmptyPlace', () => {
  it('is true only with no sub-places and nothing directly in it', () => {
    const withEmpty = createPlace(coreWorld, {
      id: 'loc-e',
      name: 'Pegboard',
      parentId: 'loc-garage',
    });
    expect(isEmptyPlace(withEmpty, 'loc-e')).toBe(true);
    expect(isEmptyPlace(coreWorld, 'loc-hall')).toBe(false);
    expect(isEmptyPlace(coreWorld, 'loc-tv-drawer')).toBe(false);
    expect(isEmptyPlace(coreWorld, 'loc-storage')).toBe(false);
  });
});

describe('reparent', () => {
  const plan = planDelete(coreWorld, 'loc-garage', 'reparent');

  it('moves sub-places and direct things up to the parent; boxes keep contents', () => {
    expect(plan.parent?.id).toBe('loc-house');
    expect(ids(plan.movedPlaces)).toEqual(['loc-shelving', 'loc-workbench']);
    expect(ids(plan.things)).toEqual(['box-k12', 'box-o04', 'itm-ladder']);
    expect(plan.carried).toBe(5);
    expect(plan.refusal).toBeNull();
  });

  it('applies: the place is gone, children and things sit in the parent', () => {
    const next = applyDelete(coreWorld, plan);
    expect(next.locations.has('loc-garage')).toBe(false);
    expect(next.locations.get('loc-shelving')?.parentId).toBe('loc-house');
    expect(next.items.get('itm-ladder')?.placement).toEqual({
      kind: 'location',
      locationId: 'loc-house',
    });
    expect(next.items.get('itm-plates')?.placement).toEqual({
      kind: 'container',
      containerId: 'box-k12',
    });
  });

  it('refuses a top-level place and changes nothing', () => {
    const top = planDelete(coreWorld, 'loc-storage', 'reparent');
    expect(top.refusal).toMatch(/top-level place/);
    expect(applyDelete(coreWorld, top)).toBe(coreWorld);
  });

  it('labels the button with the real count and destination', () => {
    expect(deleteButtonLabel(plan)).toBe('Delete and move 5 to Wattle Street house');
    expect(deleteOutcome(plan)).toBe(
      '2 places and 3 things move up to Wattle Street house. Boxes keep the 5 things inside them.'
    );
  });
});

describe('to-hand (delete with contents)', () => {
  const plan = planDelete(coreWorld, 'loc-garage', 'to-hand');

  it('deletes every sub-place and puts everything directly in them in hand', () => {
    expect(ids(plan.deletedPlaces)).toEqual(['loc-shelving', 'loc-toolbox', 'loc-workbench']);
    expect(ids(plan.things)).toEqual([
      'box-cables',
      'box-k12',
      'box-o04',
      'itm-bits',
      'itm-drill',
      'itm-ladder',
      'itm-pots',
    ]);
    expect(plan.carried).toBe(8);
  });

  it('remembers the exact deleted place each thing came from', () => {
    const next = applyDelete(coreWorld, plan);
    expect([...next.locations.keys()].some((id) => id.startsWith('loc-work'))).toBe(false);
    expect(next.items.get('itm-bits')).toMatchObject({
      placement: { kind: 'in-hand' },
      previous: { kind: 'deleted', name: 'Red toolbox' },
    });
    expect(next.items.get('box-k12')?.previous).toEqual({ kind: 'deleted', name: 'Garage' });
    expect(next.items.get('itm-charger')?.placement).toEqual({
      kind: 'container',
      containerId: 'box-cables',
    });
  });

  it('leaves things outside the subtree alone', () => {
    const next = applyDelete(coreWorld, plan);
    expect(next.items.get('itm-tv')).toBe(coreWorld.items.get('itm-tv'));
  });

  it('is never refused, even at the top level, and says what goes', () => {
    expect(planDelete(coreWorld, 'loc-storage', 'to-hand').refusal).toBeNull();
    expect(deleteButtonLabel(plan)).toBe('Delete and put 7 in hand');
    expect(deleteOutcome(plan)).toBe(
      'Garage and 3 places under it are deleted. 7 things go in hand, marked Previous place deleted. Boxes keep the 8 things inside them.'
    );
  });

  it('throws for an unknown place', () => {
    expect(() => planDelete(coreWorld, 'loc-gone', 'to-hand')).toThrow(/loc-gone/);
  });
});
