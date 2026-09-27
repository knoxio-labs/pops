import { useCallback, useState } from 'react';

import { performPlacement, performTakeOut } from './contents-verb-actions.js';

import type { useBulkItemVerbs } from '../../inventory-web/item-verbs-bulk.js';
import type { useTrackedWrites } from '../list-page/take-out.js';
import type { PlacementTarget } from '../model/model.js';
import type { PlacementWorld } from '../model/placement-model.js';
import type { ContentsVerbs } from './contents-verb-types.js';

type BulkVerbs = ReturnType<typeof useBulkItemVerbs>;
type Tracked = ReturnType<typeof useTrackedWrites>;
type PlacementVerbs = Pick<
  ContentsVerbs,
  'moving' | 'startMove' | 'cancelMove' | 'moveIds' | 'moveTo' | 'pickUp' | 'takeOut'
>;

function useMoveVerbs({
  offline,
  bulk,
  tracked,
}: {
  offline: boolean;
  bulk: BulkVerbs;
  tracked: Tracked;
}): Pick<PlacementVerbs, 'moving' | 'startMove' | 'cancelMove' | 'moveIds' | 'moveTo'> {
  const [moving, setMoving] = useState<readonly string[] | null>(null);
  const startMove = useCallback(
    (ids: readonly string[]): void => {
      if (!offline && ids.length > 0) setMoving([...ids]);
    },
    [offline]
  );
  const moveTo = useCallback(
    (target: PlacementTarget, world: PlacementWorld): void => {
      if (offline || moving === null) return;
      const ids = moving;
      setMoving(null);
      void performPlacement({
        ids,
        target,
        world,
        bulk,
        tracked,
        concept: 'move',
        verb: 'Moved',
      });
    },
    [bulk, moving, offline, tracked]
  );
  const moveIds = useCallback(
    (ids: readonly string[], target: PlacementTarget, world: PlacementWorld): void => {
      if (offline || ids.length === 0) return;
      void performPlacement({
        ids,
        target,
        world,
        bulk,
        tracked,
        concept: 'move',
        verb: 'Moved',
      });
    },
    [bulk, offline, tracked]
  );
  const cancelMove = useCallback((): void => setMoving(null), []);
  return { moving, startMove, cancelMove, moveIds, moveTo };
}

function useItemPlacementVerbs({
  world,
  offline,
  bulk,
  tracked,
}: {
  world: PlacementWorld;
  offline: boolean;
  bulk: BulkVerbs;
  tracked: Tracked;
}): Pick<PlacementVerbs, 'pickUp' | 'takeOut'> {
  const pickUp = useCallback(
    (ids: readonly string[]): void => {
      if (offline || ids.length === 0) return;
      void performPlacement({
        ids,
        target: { kind: 'in-hand' },
        world,
        bulk,
        tracked,
        concept: 'pickUp',
        verb: 'Picked up',
      });
    },
    [bulk, offline, tracked, world]
  );
  const takeOut = useCallback(
    (ids: readonly string[]): void => {
      if (offline || ids.length === 0) return;
      void performTakeOut({ world, ids, bulk, tracked });
    },
    [bulk, offline, tracked, world]
  );
  return { pickUp, takeOut };
}

/** Binds move, pick-up, and take-out commands to tracked inventory writes. */
export function usePlacementVerbs({
  world,
  offline,
  bulk,
  tracked,
}: {
  world: PlacementWorld;
  offline: boolean;
  bulk: BulkVerbs;
  tracked: Tracked;
}): PlacementVerbs {
  return {
    ...useMoveVerbs({ offline, bulk, tracked }),
    ...useItemPlacementVerbs({ world, offline, bulk, tracked }),
  };
}
