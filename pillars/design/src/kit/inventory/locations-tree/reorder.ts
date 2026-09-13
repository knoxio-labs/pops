import { arrayMove } from '@dnd-kit/sortable';

import { getSiblings, isDescendant } from './utils';

import type { DragEndEvent } from '@dnd-kit/core';

import type { LocationTreeNode } from './utils';

export interface LocationPatch {
  id: string;
  sortOrder?: number;
  parentId?: string | null;
}

/**
 * Ported from `reorderSiblings` in the app's `useDragHandlers.ts`, with the
 * mutation call replaced by the patch list the caller applies locally.
 */
export function reorderSiblings(
  activeId: string,
  overId: string,
  nodeMap: Map<string, LocationTreeNode>,
  treeNodes: LocationTreeNode[]
): LocationPatch[] {
  const siblings = getSiblings(activeId, treeNodes, nodeMap);
  const oldIndex = siblings.findIndex((s) => s.id === activeId);
  const newIndex = siblings.findIndex((s) => s.id === overId);
  if (oldIndex < 0 || newIndex < 0) return [];
  const reordered = arrayMove(siblings, oldIndex, newIndex);
  const patches: LocationPatch[] = [];
  reordered.forEach((n, index) => {
    if (n.sortOrder !== index) patches.push({ id: n.id, sortOrder: index });
  });
  return patches;
}

export type DragEndOutcome =
  | { kind: 'noop' }
  | { kind: 'blocked-descendant' }
  | { kind: 'reorder'; patches: LocationPatch[] }
  | { kind: 'reparent'; patches: LocationPatch[] };

/**
 * Ported from `handleDragEndCore` in the app's `useDragHandlers.ts`.
 *
 * Faithfully reproduces POPS-230 defect 1 / POPS-3603: the reparent branch
 * sends only `{ id, parentId }`, no `sortOrder`, so the moved node keeps
 * whatever sibling index it had under its old parent and lands wherever that
 * number falls among the new siblings rather than where it was dropped. Do
 * not fix this here; the canvas exists to show it.
 */
export function computeDragEnd(
  event: DragEndEvent,
  nodeMap: Map<string, LocationTreeNode>,
  treeNodes: LocationTreeNode[]
): DragEndOutcome {
  const { active, over } = event;
  if (!over || active.id === over.id) return { kind: 'noop' };
  const activeId = active.id as string;
  const overId = over.id as string;
  const activeNode = nodeMap.get(activeId);
  const overNode = nodeMap.get(overId);
  if (!activeNode || !overNode) return { kind: 'noop' };
  if (isDescendant(activeId, overId, nodeMap)) return { kind: 'blocked-descendant' };
  if (activeNode.parentId === overNode.parentId) {
    return { kind: 'reorder', patches: reorderSiblings(activeId, overId, nodeMap, treeNodes) };
  }
  return { kind: 'reparent', patches: [{ id: activeNode.id, parentId: overNode.id }] };
}

/** Ported from `handleReorder` in the app's `useDragHandlers.ts` (the touch-friendly arrow buttons). */
export function computeArrowReorder(
  id: string,
  direction: 'up' | 'down',
  nodeMap: Map<string, LocationTreeNode>,
  treeNodes: LocationTreeNode[]
): LocationPatch[] {
  const siblings = getSiblings(id, treeNodes, nodeMap);
  const idx = siblings.findIndex((s) => s.id === id);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= siblings.length) return [];
  const current = siblings[idx];
  const swap = siblings[swapIdx];
  if (!current || !swap) return [];
  return [
    { id: current.id, sortOrder: swap.sortOrder },
    { id: swap.id, sortOrder: current.sortOrder },
  ];
}
