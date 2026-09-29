import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { useBulkItemVerbs } from '../../inventory-web/item-verbs-bulk.js';
import { usePendingItemIds } from '../../inventory-web/item-verbs.js';
import { labelsHref, MAX_LABEL_IDS } from '../../pages/labels-page/label-params.js';
import { OFFLINE_REASON } from '../feedback/state-banner.js';
import { useTrackedWrites } from '../list-page/take-out.js';
import { usePlacementVerbs } from './contents-placement-verbs.js';
import { performLifecycle } from './contents-verb-actions.js';

import type { ContentsLifecycleAct, ContentsVerbs } from './contents-verb-types.js';

export type { ContentsLifecycleAct, ContentsVerbs } from './contents-verb-types.js';

import type { PlacementWorld } from '../model/placement-model.js';
import type { ShortcutHandlers } from '../shortcuts/shortcut-provider.js';

type BulkVerbs = ReturnType<typeof useBulkItemVerbs>;
type Tracked = ReturnType<typeof useTrackedWrites>;

function useLifecycleVerbs({
  offline,
  bulk,
  tracked,
}: {
  offline: boolean;
  bulk: BulkVerbs;
  tracked: Tracked;
}): Pick<ContentsVerbs, 'lifecycle' | 'startLifecycle' | 'cancelLifecycle' | 'confirmLifecycle'> {
  const [lifecycle, setLifecycle] = useState<ContentsVerbs['lifecycle']>(null);
  const startLifecycle = useCallback(
    (act: ContentsLifecycleAct, ids: readonly string[]): void => {
      if (!offline && ids.length > 0) setLifecycle({ act, ids: [...ids] });
    },
    [offline]
  );
  const cancelLifecycle = useCallback((): void => setLifecycle(null), []);
  const confirmLifecycle = useCallback(
    (reason: string | null): void => {
      if (offline || lifecycle === null) return;
      const current = lifecycle;
      setLifecycle(null);
      void performLifecycle({ ids: current.ids, act: current.act, reason, bulk, tracked });
    },
    [bulk, lifecycle, offline, tracked]
  );
  return { lifecycle, startLifecycle, cancelLifecycle, confirmLifecycle };
}

function useContentKeyHandlers({
  offline,
  world,
  pickUp,
  startMove,
  takeOut,
  label,
}: {
  offline: boolean;
  world: PlacementWorld;
  pickUp: (ids: readonly string[]) => void;
  startMove: (ids: readonly string[]) => void;
  takeOut: (ids: readonly string[]) => void;
  label: (ids: readonly string[]) => void;
}): (ids: readonly string[]) => ShortcutHandlers {
  return useCallback(
    (ids: readonly string[]): ShortcutHandlers => ({
      'pick-up': () => {
        if (offline || ids.length === 0) return false;
        pickUp(ids);
        return true;
      },
      move: () => {
        if (offline || ids.length === 0) return false;
        startMove(ids);
        return true;
      },
      'take-out': () => {
        if (
          offline ||
          ids.length === 0 ||
          !ids.every((id) => world.items.get(id)?.placement.kind === 'container')
        ) {
          return false;
        }
        takeOut(ids);
        return true;
      },
      label: () => {
        if (offline || ids.length === 0 || ids.length > MAX_LABEL_IDS) return false;
        label(ids);
        return true;
      },
    }),
    [label, offline, pickUp, startMove, takeOut, world]
  );
}

/** Binds bulk inventory writes and their single Undo offer to place contents. */
export function useContentsVerbs({
  world,
  offline,
}: {
  world: PlacementWorld;
  offline: boolean;
}): ContentsVerbs {
  const navigate = useNavigate();
  const bulk = useBulkItemVerbs();
  const pendingIds = usePendingItemIds();
  const tracked = useTrackedWrites();
  const placement = usePlacementVerbs({ world, offline, bulk, tracked });
  const lifecycle = useLifecycleVerbs({ offline, bulk, tracked });
  const label = useCallback(
    (ids: readonly string[]): void => {
      if (!offline && ids.length > 0 && ids.length <= MAX_LABEL_IDS) {
        void navigate(labelsHref(ids));
      }
    },
    [navigate, offline]
  );
  const keyHandlersFor = useContentKeyHandlers({
    offline,
    world,
    pickUp: placement.pickUp,
    startMove: placement.startMove,
    takeOut: placement.takeOut,
    label,
  });
  return useMemo(
    () => ({
      ...placement,
      ...lifecycle,
      label,
      rejections: tracked.rejections,
      pendingIds,
      disabledReason: offline ? OFFLINE_REASON : undefined,
      keyHandlersFor,
    }),
    [keyHandlersFor, label, lifecycle, offline, pendingIds, placement, tracked.rejections]
  );
}
