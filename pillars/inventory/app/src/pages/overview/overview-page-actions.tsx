import { useCallback, useState } from 'react';

import { showUndoToast } from '../../foundation/feedback/undo-toast.js';
import { refusalReason } from '../../foundation/list-page/selection-actions.js';
import { targetName } from '../../foundation/model/placement-model.js';
import { useItemVerbs, usePendingItemIds } from '../../inventory-web/item-verbs.js';
import { useRevertEvent } from '../../inventory-web/useRevertEvent.js';
import { undoEvent } from './overview-event-actions.js';

import type { Dispatch, SetStateAction } from 'react';

import type { ItemRowModel, PlacementTarget } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { VerbRefusal } from '../../inventory-web/item-verbs.js';
import type { WebEvent } from '../../inventory-web/useWebEvents.js';

interface RejectionState {
  readonly rejections: Readonly<Record<string, string>>;
  readonly clear: (id: string) => void;
  readonly refuse: (id: string, refusal: VerbRefusal) => void;
}

function useRejectionState(): RejectionState {
  const [rejections, setRejections] = useState<Readonly<Record<string, string>>>({});
  const clear = useCallback((id: string): void => {
    setRejections((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);
  const refuse = useCallback((id: string, refusal: VerbRefusal): void => {
    setRejections((current) => ({ ...current, [id]: refusalReason(refusal) }));
  }, []);
  return { rejections, clear, refuse };
}

async function closeContainer(
  item: ItemRowModel,
  verbs: ReturnType<typeof useItemVerbs>,
  rejection: RejectionState
): Promise<void> {
  rejection.clear(item.id);
  const result = await verbs.setAccess(item.id, 'closed');
  if (result.status === 'refused') {
    rejection.refuse(item.id, result.refusal);
    return;
  }
  if (result.undo !== null) {
    showUndoToast({ concept: 'closed', message: `Closed ${item.name}`, onUndo: result.undo });
  }
}

async function putBack(
  item: ItemRowModel,
  world: PlacementWorld,
  verbs: ReturnType<typeof useItemVerbs>,
  rejection: RejectionState
): Promise<void> {
  rejection.clear(item.id);
  const route = item.previous;
  if (route === null || route.kind === 'deleted') return;
  const result = await verbs.putBack(item.id);
  if (result.status === 'refused') {
    rejection.refuse(item.id, result.refusal);
    return;
  }
  if (result.undo !== null) {
    showUndoToast({
      concept: 'putBack',
      message: `Put ${item.name} back in ${targetName(world, route)}`,
      onUndo: result.undo,
    });
  }
}

async function move({
  item,
  target,
  targetWorld,
  verbs,
  rejection,
}: {
  item: ItemRowModel;
  target: PlacementTarget;
  targetWorld: PlacementWorld;
  verbs: ReturnType<typeof useItemVerbs>;
  rejection: RejectionState;
}): Promise<void> {
  if (target.kind === 'in-hand') return;
  rejection.clear(item.id);
  const result = await verbs.move(item.id, target);
  if (result.status === 'refused') {
    rejection.refuse(item.id, result.refusal);
    return;
  }
  if (result.undo !== null) {
    showUndoToast({
      concept: 'move',
      message: `Moved ${item.name} to ${targetName(targetWorld, target)}`,
      onUndo: result.undo,
    });
  }
}

interface OverviewActionInput {
  readonly world: PlacementWorld;
  readonly pickerWorld: PlacementWorld;
  readonly pickerItemId: string | null;
  readonly setPickerItemId: Dispatch<SetStateAction<string | null>>;
  readonly eventById: ReadonlyMap<string, WebEvent>;
  readonly navigate: (path: string) => void | Promise<void>;
  readonly createLocation: {
    readonly mutateAsync: (input: { name: string; parentId: string | null }) => Promise<unknown>;
  };
}

/** Wires Overview item verbs, placement-picker actions, and recent-work undo. */
export function useOverviewActions(input: OverviewActionInput) {
  const verbs = useItemVerbs();
  const pendingIds = usePendingItemIds();
  const revertEvent = useRevertEvent();
  const rejection = useRejectionState();
  const close = useCallback(
    (item: ItemRowModel) => closeContainer(item, verbs, rejection),
    [rejection, verbs]
  );
  const put = useCallback(
    (item: ItemRowModel) => putBack(item, input.world, verbs, rejection),
    [input.world, rejection, verbs]
  );
  const openMove = useCallback(
    (item: ItemRowModel): void => {
      rejection.clear(item.id);
      input.setPickerItemId(item.id);
    },
    [input, rejection]
  );
  const pick = useCallback(
    (target: PlacementTarget): void => {
      if (input.pickerItemId === null) return;
      const item = input.world.items.get(input.pickerItemId);
      input.setPickerItemId(null);
      if (item !== undefined) {
        void move({ item, target, targetWorld: input.pickerWorld, verbs, rejection });
      }
    },
    [input, rejection, verbs]
  );
  const createPlace = useCallback(
    (name: string, parentId: string | null): void => {
      void input.createLocation.mutateAsync({ name, parentId });
    },
    [input.createLocation]
  );
  const undo = useCallback(
    (model: { id: string; summary: string }): void => {
      const source = input.eventById.get(model.id);
      if (source !== undefined) void undoEvent({ model, source }, revertEvent, input.navigate);
    },
    [input.eventById, input.navigate, revertEvent]
  );
  return {
    close,
    put,
    openMove,
    pick,
    createPlace,
    undo,
    pendingIds,
    rejections: rejection.rejections,
  };
}
