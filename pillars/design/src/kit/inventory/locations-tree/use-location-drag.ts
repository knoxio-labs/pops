import { useCallback } from 'react';

import { computeDragEnd } from './reorder';
import { applyLocationPatches } from './tree-mutations';

import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';

import type { useLocationSelectionState } from './use-location-selection';
import type { LocationTreeNode } from './utils';

interface Args {
  tree: LocationTreeNode[];
  setTree: (updater: (t: LocationTreeNode[]) => LocationTreeNode[]) => void;
  nodeMap: Map<string, LocationTreeNode>;
  selection: ReturnType<typeof useLocationSelectionState>;
}

/** The drag-and-drop reorder/reparent, `dnd-kit`'s three lifecycle callbacks. */
export function useLocationDrag({ tree, setTree, nodeMap, selection }: Args) {
  const { setActiveId, setOverId } = selection;

  const handleDragStart = useCallback(
    (event: DragStartEvent) => setActiveId(event.active.id as string),
    [setActiveId]
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => setOverId(event.over ? (event.over.id as string) : null),
    [setOverId]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      setOverId(null);
      const outcome = computeDragEnd(event, nodeMap, tree);
      // `blocked-descendant` and `noop` produce no patches; the app shows a
      // toast for the blocked case, which this canvas has no channel for.
      if (outcome.kind === 'reorder' || outcome.kind === 'reparent') {
        setTree((t) => applyLocationPatches(t, outcome.patches));
      }
    },
    [nodeMap, tree, setTree, setActiveId, setOverId]
  );

  return { handleDragStart, handleDragOver, handleDragEnd };
}
