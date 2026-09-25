/**
 * The Locations page state in one place: the world being edited (with
 * Undo), the tree's view, the place edits, dragging items onto places and
 * dragging places within the tree. Review states open it at a seed.
 */
import { useCallback, useMemo, useState } from 'react';

import { planMove, showUndoToast, targetName } from '../foundation';
import { applyMove } from './apply-move';
import { dropPlace } from './tree-model';
import { useItemDrag } from './use-item-drag';
import { usePlaceDrag } from './use-place-drag';
import { usePlaceEdits } from './use-place-edits';
import { useTreeView } from './use-tree-view';

import type { DragPlacementApi, PlacementTarget, PlacementWorld } from '../foundation';
import type { DropPosition } from './tree-model';
import type { ItemDragSeed } from './use-item-drag';
import type { PlaceDragApi, PlaceDragState } from './use-place-drag';
import type { CommitWorld, PlaceEditSeed, PlaceEditsApi } from './use-place-edits';
import type { TreeViewApi } from './use-tree-view';

/** Everything a Locations review state can open at. */
export interface LocationsSeed extends PlaceEditSeed {
  world: PlacementWorld;
  selectedId?: string | null;
  expanded?: readonly string[];
  filter?: string;
  itemDrag?: ItemDragSeed | null;
  placeDrag?: PlaceDragState | null;
}

/** What {@link useLocations} hands the page. */
export interface LocationsApi {
  world: PlacementWorld;
  commit: CommitWorld;
  tree: TreeViewApi;
  edits: PlaceEditsApi;
  itemDrag: DragPlacementApi;
  placeDrag: PlaceDragApi;
}

function things(count: number): string {
  return count === 1 ? '1 thing' : `${count} things`;
}

function useUndoableWorld(initial: PlacementWorld) {
  const [world, setWorld] = useState(initial);
  const commit: CommitWorld = useCallback(
    (next, concept, message) => {
      if (next === world) return;
      const before = world;
      setWorld(next);
      showUndoToast({ concept, message, onUndo: () => setWorld(before) });
    },
    [world]
  );
  return { world, setWorld, commit };
}

/** The page state. */
export function useLocations(seed: LocationsSeed): LocationsApi {
  const { world, setWorld, commit } = useUndoableWorld(seed.world);
  const tree = useTreeView(world, seed);
  const ctx = useMemo(
    () => ({ world, commit, setWorld, reveal: tree.reveal }),
    [world, commit, setWorld, tree.reveal]
  );
  const edits = usePlaceEdits(ctx, seed);
  const onItemsDropped = useCallback(
    (ids: readonly string[], target: PlacementTarget) => {
      const plan = planMove({ world, selectedIds: ids, target });
      const moved = plan.moving.length + plan.carried.length;
      commit(
        applyMove(world, plan),
        'move',
        `Moved ${things(moved)} to ${targetName(world, target)}`
      );
    },
    [world, commit]
  );
  const onPlaceDropped = useCallback(
    (placeId: string, targetId: string, position: DropPosition) => {
      const name = world.locations.get(placeId)?.name ?? 'Place';
      const target = world.locations.get(targetId)?.name ?? 'the place';
      const message = position === 'inside' ? `Moved ${name} into ${target}` : `Reordered ${name}`;
      commit(dropPlace(world, placeId, targetId, position), 'move', message);
    },
    [world, commit]
  );
  const itemDrag = useItemDrag(world, onItemsDropped, seed.itemDrag ?? null);
  const placeDrag = usePlaceDrag(world, onPlaceDropped, seed.placeDrag ?? null);
  return { world, commit, tree, edits, itemDrag, placeDrag };
}
