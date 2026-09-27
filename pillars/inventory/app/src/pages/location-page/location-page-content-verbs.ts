import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';

import { OFFLINE_REASON } from '../../foundation/feedback/state-banner.js';
import { refusalReason } from '../../foundation/list-page/selection-actions.js';
import { useTrackedWrites } from '../../foundation/list-page/take-out.js';
import {
  effectiveLocationId,
  type PlacementWorld,
} from '../../foundation/model/placement-model.js';
import { useItemVerbs, usePendingItemIds } from '../../inventory-web/item-verbs.js';
import { inventoryErrorMessage } from './location-page-utils.js';

import type { FixedPlacement, PlacementTarget } from '../../foundation/model/model.js';
import type { ContentsVerbs } from './location-tab-content-model.js';

type ItemVerbPromise = ReturnType<ReturnType<typeof useItemVerbs>['pickUp']>;

/** The page-local item move overlay state and row verb callbacks. */
export interface ContentsVerbState {
  readonly verbs: ContentsVerbs;
  readonly movingIds: readonly string[];
  readonly setMovingIds: (ids: readonly string[]) => void;
  readonly moveIds: (ids: readonly string[], target: PlacementTarget) => void;
  readonly moveSelected: (target: PlacementTarget) => void;
}

function useVerbRunner(setRejection: (id: string, reason: string | null) => void) {
  return useCallback(
    async (id: string, operation: () => ItemVerbPromise): Promise<void> => {
      try {
        const result = await operation();
        if (result.status === 'refused') {
          setRejection(id, refusalReason(result.refusal));
          toast.error('Inventory did not accept that change.');
          return;
        }
        setRejection(id, null);
      } catch (reason: unknown) {
        setRejection(id, 'The inventory service did not answer.');
        toast.error(inventoryErrorMessage(reason));
      }
    },
    [setRejection]
  );
}

function useIdsRunner(run: (id: string, operation: () => ItemVerbPromise) => Promise<void>) {
  return useCallback(
    (ids: readonly string[], operation: (id: string) => ItemVerbPromise): void => {
      for (const id of ids) void run(id, () => operation(id));
    },
    [run]
  );
}

function useMoveIds({
  itemVerbs,
  online,
  runForIds,
  setMovingIds,
}: {
  itemVerbs: ReturnType<typeof useItemVerbs>;
  online: boolean;
  runForIds: (ids: readonly string[], operation: (id: string) => ItemVerbPromise) => void;
  setMovingIds: (ids: readonly string[]) => void;
}): (ids: readonly string[], target: PlacementTarget) => void {
  return useCallback(
    (ids: readonly string[], target: PlacementTarget) => {
      if (!online) return;
      if (target.kind === 'in-hand') {
        runForIds(ids, (id) => itemVerbs.pickUp(id));
      } else {
        const fixed: FixedPlacement =
          target.kind === 'location'
            ? { kind: 'location', locationId: target.locationId }
            : { kind: 'container', containerId: target.containerId };
        runForIds(ids, (id) => itemVerbs.move(id, fixed));
      }
      setMovingIds([]);
    },
    [itemVerbs, online, runForIds, setMovingIds]
  );
}

/** Connects item verbs to the location-page rows without changing shared hooks. */
export function useContentsVerbs(
  world: PlacementWorld,
  online: boolean,
  movingIds: readonly string[],
  setMovingIds: (ids: readonly string[]) => void
): ContentsVerbState {
  const itemVerbs = useItemVerbs();
  const pendingIds = usePendingItemIds();
  const tracked = useTrackedWrites();
  const run = useVerbRunner(tracked.setRejection);
  const runForIds = useIdsRunner(run);
  const pickUp = useCallback(
    (ids: readonly string[]) => {
      if (online) runForIds(ids, (id) => itemVerbs.pickUp(id));
    },
    [itemVerbs, online, runForIds]
  );
  const startMove = useCallback(
    (ids: readonly string[]) => {
      if (online) setMovingIds([...ids]);
    },
    [online, setMovingIds]
  );
  const takeOut = useCallback(
    (ids: readonly string[]) => {
      if (!online) return;
      for (const id of ids) {
        const locationId = effectiveLocationId(world, id);
        if (locationId !== null) {
          void run(id, () => itemVerbs.move(id, { kind: 'location', locationId }));
        }
      }
    },
    [itemVerbs, online, run, world]
  );
  const moveIds = useMoveIds({ itemVerbs, online, runForIds, setMovingIds });
  const moveSelected = useCallback(
    (target: PlacementTarget): void => moveIds(movingIds, target),
    [moveIds, movingIds]
  );
  const verbs = useMemo<ContentsVerbs>(
    () => ({
      pendingIds,
      rejections: tracked.rejections,
      disabledReason: online ? undefined : OFFLINE_REASON,
      pickUp,
      startMove,
      takeOut,
    }),
    [online, pendingIds, pickUp, startMove, takeOut, tracked.rejections]
  );
  return { verbs, movingIds, setMovingIds, moveIds, moveSelected };
}
