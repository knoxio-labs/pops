import { describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

import { handleDragEndCore } from './useDragHandlers';

import type { DragEndEvent } from '@dnd-kit/core';

import type { LocationTreeNode } from './utils';

function node(
  id: string,
  parentId: string | null,
  sortOrder: number,
  children: LocationTreeNode[] = []
): LocationTreeNode {
  return { id, name: id, parentId, sortOrder, children };
}

function dragEndEvent(activeId: string, overId: string): DragEndEvent {
  return {
    active: {
      id: activeId,
      data: { current: undefined },
      rect: { current: { initial: null, translated: null } },
    },
    over: { id: overId, rect: {} as never, disabled: false, data: { current: undefined } },
    activatorEvent: {} as Event,
    collisions: null,
    delta: { x: 0, y: 0 },
  } as unknown as DragEndEvent;
}

describe('handleDragEndCore — reparent onto a new parent', () => {
  it("appends the moved node after the new parent's existing children, not sortOrder 0", () => {
    const shelfA = node('shelf-a', 'living-room', 0);
    const shelfB = node('shelf-b', 'living-room', 1);
    const livingRoom = node('living-room', null, 0, [shelfA, shelfB]);
    const box = node('box', 'garage', 0);
    const garage = node('garage', null, 1, [box]);

    const treeNodes = [livingRoom, garage];
    const nodeMap = new Map(treeNodes.flatMap((n) => [n, ...n.children]).map((n) => [n.id, n]));

    const mutate = vi.fn();
    handleDragEndCore({
      event: dragEndEvent('shelf-a', 'garage'),
      nodeMap,
      treeNodes,
      updateMutation: { mutate },
    });

    expect(mutate).toHaveBeenCalledWith({
      id: 'shelf-a',
      data: { parentId: 'garage', sortOrder: 1 },
    });
  });

  it('lands the first child of an empty parent at sortOrder 0', () => {
    const shelfA = node('shelf-a', 'living-room', 0);
    const livingRoom = node('living-room', null, 0, [shelfA]);
    const garage = node('garage', null, 1, []);

    const treeNodes = [livingRoom, garage];
    const nodeMap = new Map(treeNodes.flatMap((n) => [n, ...n.children]).map((n) => [n.id, n]));

    const mutate = vi.fn();
    handleDragEndCore({
      event: dragEndEvent('shelf-a', 'garage'),
      nodeMap,
      treeNodes,
      updateMutation: { mutate },
    });

    expect(mutate).toHaveBeenCalledWith({
      id: 'shelf-a',
      data: { parentId: 'garage', sortOrder: 0 },
    });
  });
});
