import { describe, expect, it } from 'vitest';

import { computeArrowReorder, computeDragEnd, reorderSiblings } from './reorder';

import type { Active, DragEndEvent, Over } from '@dnd-kit/core';

import type { LocationTreeNode } from './utils';

function node(
  id: string,
  parentId: string | null,
  sortOrder: number,
  children: LocationTreeNode[] = []
): LocationTreeNode {
  return { id, name: id, parentId, sortOrder, children };
}

const emptyRect = { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };

/** Minimal but fully-typed `DragEndEvent`, standing in for what dnd-kit hands `onDragEnd`. */
function dragEndEvent(activeId: string, overId: string | null): DragEndEvent {
  const active: Active = {
    id: activeId,
    data: { current: undefined },
    rect: { current: { initial: null, translated: null } },
  };
  const over: Over | null = overId
    ? { id: overId, rect: emptyRect, disabled: false, data: { current: undefined } }
    : null;
  return {
    activatorEvent: new Event('pointerup'),
    active,
    collisions: null,
    delta: { x: 0, y: 0 },
    over,
  };
}

function buildFixture() {
  const bedroom = node('bedroom', 'home', 0);
  const kitchen = node('kitchen', 'home', 1);
  const home = node('home', null, 0, [bedroom, kitchen]);
  const desk = node('desk', 'office', 0);
  const office = node('office', null, 1, [desk]);
  const treeNodes = [home, office];
  const nodeMap = new Map<string, LocationTreeNode>([
    ['home', home],
    ['bedroom', bedroom],
    ['kitchen', kitchen],
    ['office', office],
    ['desk', desk],
  ]);
  return { treeNodes, nodeMap };
}

describe('reorderSiblings', () => {
  it('produces sortOrder patches only for siblings whose index actually changed', () => {
    const { treeNodes, nodeMap } = buildFixture();
    const patches = reorderSiblings('office', 'home', nodeMap, treeNodes);
    expect(patches).toEqual(
      expect.arrayContaining([
        { id: 'office', sortOrder: 0 },
        { id: 'home', sortOrder: 1 },
      ])
    );
    expect(patches).toHaveLength(2);
  });

  it('returns no patches when either id cannot be found among siblings', () => {
    const { treeNodes, nodeMap } = buildFixture();
    expect(reorderSiblings('missing', 'home', nodeMap, treeNodes)).toEqual([]);
  });
});

describe('computeDragEnd', () => {
  it('is a no-op when dropped on itself', () => {
    const { treeNodes, nodeMap } = buildFixture();
    expect(computeDragEnd(dragEndEvent('home', 'home'), nodeMap, treeNodes)).toEqual({
      kind: 'noop',
    });
  });

  it('is a no-op when the drag is cancelled (no drop target)', () => {
    const { treeNodes, nodeMap } = buildFixture();
    expect(computeDragEnd(dragEndEvent('home', null), nodeMap, treeNodes)).toEqual({
      kind: 'noop',
    });
  });

  it('blocks dropping a node onto its own descendant', () => {
    const { treeNodes, nodeMap } = buildFixture();
    expect(computeDragEnd(dragEndEvent('home', 'bedroom'), nodeMap, treeNodes)).toEqual({
      kind: 'blocked-descendant',
    });
  });

  it('reorders when the active and target nodes share a parent', () => {
    const { treeNodes, nodeMap } = buildFixture();
    const outcome = computeDragEnd(dragEndEvent('office', 'home'), nodeMap, treeNodes);
    expect(outcome.kind).toBe('reorder');
  });

  it('reparents when the active and target nodes have different parents, and (POPS-3603) sends no sortOrder', () => {
    const { treeNodes, nodeMap } = buildFixture();
    const outcome = computeDragEnd(dragEndEvent('desk', 'home'), nodeMap, treeNodes);
    expect(outcome).toEqual({ kind: 'reparent', patches: [{ id: 'desk', parentId: 'home' }] });
  });
});

describe('computeArrowReorder', () => {
  it('swaps sortOrder with the previous sibling on "up"', () => {
    const { treeNodes, nodeMap } = buildFixture();
    expect(computeArrowReorder('kitchen', 'up', nodeMap, treeNodes)).toEqual([
      { id: 'kitchen', sortOrder: 0 },
      { id: 'bedroom', sortOrder: 1 },
    ]);
  });

  it('does nothing at the start of the sibling list moving up', () => {
    const { treeNodes, nodeMap } = buildFixture();
    expect(computeArrowReorder('bedroom', 'up', nodeMap, treeNodes)).toEqual([]);
  });

  it('does nothing at the end of the sibling list moving down', () => {
    const { treeNodes, nodeMap } = buildFixture();
    expect(computeArrowReorder('kitchen', 'down', nodeMap, treeNodes)).toEqual([]);
  });
});
