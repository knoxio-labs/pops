import { describe, expect, it } from 'vitest';

import { buildWorld } from '../model/placement-model.js';
import { at, box, inBox, item } from '../test-fixtures/core-factory.js';
import {
  applyDelete,
  deleteButtonLabel,
  deleteOutcome,
  isEmptyPlace,
  planDelete,
} from './delete-plan.js';

import type { LocationModel } from '../model/model.js';

const place = (
  id: string,
  name: string,
  parentId: string | null = null,
  kind: LocationModel['kind'] = parentId === null ? 'property' : 'room'
): LocationModel => ({ id, name, parentId, kind });

function currentWorld() {
  return buildWorld(
    [
      box(['box', 'Blue box', 'box-type'], at('garage'), 'open'),
      item(['lamp', 'Lamp', null], inBox('box')),
      item(['hammer', 'Hammer', null], at('garage')),
      item(['chair', 'Chair', null], at('shed')),
    ],
    [place('home', 'House'), place('garage', 'Garage', 'home'), place('shed', 'Shed', 'garage')]
  );
}

describe('delete plan', () => {
  it('is empty only when there are no child places or direct things', () => {
    const current = currentWorld();
    expect(isEmptyPlace(current, 'garage')).toBe(false);
    expect(isEmptyPlace(current, 'shed')).toBe(false);
    expect(isEmptyPlace(current, 'home')).toBe(false);
    expect(isEmptyPlace(buildWorld([], [place('empty', 'Empty')]), 'empty')).toBe(true);
  });

  it('moves child places and direct things to the parent while boxes keep contents', () => {
    const plan = planDelete(currentWorld(), 'garage', 'reparent');
    expect(plan.movedPlaces.map(({ id }) => id)).toEqual(['shed']);
    expect(plan.things.map(({ id }) => id)).toEqual(['box', 'hammer']);
    expect(plan.carried).toBe(1);
    expect(deleteOutcome(plan)).toBe(
      '1 place and 2 things move up to House. Boxes keep the 1 thing inside them.'
    );
    expect(deleteButtonLabel(plan)).toBe('Delete and move 3 to House');
    const next = applyDelete(currentWorld(), plan);
    expect(next.locations.has('garage')).toBe(false);
    expect(next.locations.get('shed')?.parentId).toBe('home');
    expect(next.items.get('box')?.placement).toEqual({ kind: 'location', locationId: 'home' });
    expect(next.items.get('lamp')?.placement).toEqual({ kind: 'container', containerId: 'box' });
  });

  it('refuses top-level reparenting and leaves the world unchanged', () => {
    const current = currentWorld();
    const plan = planDelete(current, 'home', 'reparent');
    expect(plan.refusal).toBe(
      'House is a top-level place, so there is nowhere above it to move things to.'
    );
    expect(applyDelete(current, plan)).toBe(current);
  });

  it('deletes a subtree to hand and remembers each direct place name', () => {
    const current = currentWorld();
    const plan = planDelete(current, 'garage', 'to-hand');
    expect(plan.deletedPlaces.map(({ id }) => id)).toEqual(['shed']);
    expect(deleteButtonLabel(plan)).toBe('Delete and put 3 in hand');
    const next = applyDelete(current, plan);
    expect(next.locations.has('garage')).toBe(false);
    expect(next.locations.has('shed')).toBe(false);
    expect(next.items.get('box')?.previous).toEqual({ kind: 'deleted', name: 'Garage' });
    expect(next.items.get('hammer')?.previous).toEqual({ kind: 'deleted', name: 'Garage' });
    expect(next.items.get('chair')?.previous).toEqual({ kind: 'deleted', name: 'Shed' });
    expect(next.items.get('lamp')?.placement).toEqual({ kind: 'container', containerId: 'box' });
  });

  it('allows a top-level to-hand plan and throws for unknown places', () => {
    const current = buildWorld([], [place('home', 'House')]);
    expect(planDelete(current, 'home', 'to-hand').refusal).toBeNull();
    expect(() => planDelete(current, 'missing', 'to-hand')).toThrow('No place missing');
  });
});
