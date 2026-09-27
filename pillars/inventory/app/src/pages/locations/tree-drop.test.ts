import { describe, expect, it } from 'vitest';

import { dragSet } from '../../foundation/drag/use-drag-placement.js';
import { buildWorld } from '../../foundation/model/placement-model.js';
import { rowDropState, treeDragHint, isLifted } from './tree-drop.js';

import type { DragPlacementApi } from '../../foundation/drag/use-drag-placement.js';
import type { PlaceDragApi } from './use-place-drag.js';

const world = buildWorld(
  [],
  [
    { id: 'home', name: 'Home', parentId: null, kind: 'property' },
    { id: 'garage', name: 'Garage', parentId: 'home', kind: 'room' },
    { id: 'toolbox', name: 'Red toolbox', parentId: 'garage', kind: 'storage' },
    { id: 'shelf', name: 'Shelf', parentId: 'home', kind: 'storage' },
  ]
);

function idleItems(): DragPlacementApi {
  return {
    dragging: [],
    over: null,
    begin: () => undefined,
    hover: () => undefined,
    verdictFor: () => ({ ok: false, reason: 'Nothing is being dragged.' }),
    stateFor: () => 'idle',
    drop: () => ({ ok: false, reason: 'Nothing is being dragged.' }),
    cancel: () => undefined,
  };
}

describe('tree drop model', () => {
  it('marks a refused place row and includes the reason in the footer hint', () => {
    const placeDrag: PlaceDragApi = {
      state: { placeId: 'garage', targetId: 'toolbox', position: 'inside' },
      begin: () => undefined,
      hover: () => undefined,
      verdict: () => ({ ok: false, reason: 'Red toolbox is inside Garage.' }),
      drop: () => undefined,
      cancel: () => undefined,
    };
    const drag = { world, placeDrag, itemDrag: idleItems() };
    expect(rowDropState(drag, 'toolbox')).toEqual({ state: 'refused', position: 'inside' });
    expect(treeDragHint(drag)).toMatchObject({
      props: { text: 'Red toolbox is inside Garage.' },
    });
  });

  it('draws a reorder line and lifts the dragged subtree', () => {
    const placeDrag: PlaceDragApi = {
      state: { placeId: 'garage', targetId: 'shelf', position: 'before' },
      begin: () => undefined,
      hover: () => undefined,
      verdict: () => ({ ok: true }),
      drop: () => undefined,
      cancel: () => undefined,
    };
    const drag = { world, placeDrag, itemDrag: idleItems() };
    expect(rowDropState(drag, 'shelf')).toEqual({ state: 'over', position: 'before' });
    expect(isLifted(drag, 'toolbox')).toBe(true);
    expect(isLifted(drag, 'shelf')).toBe(false);
  });

  it('keeps the item selection as the drag set', () => {
    expect(dragSet('b', ['a', 'b'])).toEqual(['a', 'b']);
    expect(dragSet('c', ['a', 'b'])).toEqual(['c']);
  });
});
