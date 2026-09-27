import { useCallback } from 'react';

import { showUndoToast } from '../feedback/undo-toast.js';
import { targetName } from '../model/placement-model.js';
import { SelectionBar } from '../selection/selection-bar.js';
import { refusalReason } from './selection-actions.js';
import { runTakeOut, type TrackedWrites } from './take-out.js';

import type { ReactElement, Ref } from 'react';

import type { BulkResult } from '../../inventory-web/item-verbs-bulk.js';
import type { useBulkItemVerbs } from '../../inventory-web/item-verbs-bulk.js';
import type { VerbResult } from '../../inventory-web/item-verbs.js';
import type { useItemVerbs } from '../../inventory-web/item-verbs.js';
import type { SelectionBarAction } from '../model/contracts.js';
import type { PlacementTarget } from '../model/model.js';
import type { PlacementWorld } from '../model/placement-model.js';
import type { MovePlan } from '../move-plan/move-plan-model.js';
import type { SelectionApi } from '../selection/use-selection.js';

/** Props for the docked selection action bar. */
export interface SelectionDockProps {
  selection: SelectionApi;
  loadedCount: number;
  carried: number;
  actions: readonly SelectionBarAction[];
  offline: boolean;
  anchorRef: Ref<HTMLDivElement>;
}

/** Renders the selection bar and makes its root available as a picker anchor. */
export function SelectionDock({
  selection,
  loadedCount,
  carried,
  actions,
  offline,
  anchorRef,
}: SelectionDockProps): ReactElement | null {
  if (selection.count === 0) return null;
  const dockActions = offline
    ? actions.map((action) => ({ ...action, disabledReason: 'No connection' }))
    : actions;
  return (
    <div ref={anchorRef}>
      <SelectionBar
        count={selection.count}
        loadedCount={loadedCount}
        coverage={selection.coverage}
        actions={dockActions}
        carriedCount={carried}
        onSelectAll={selection.onHeaderToggle}
        onClear={selection.clearSelection}
      />
    </div>
  );
}

interface SingleWriteInput {
  id: string;
  run: () => Promise<VerbResult>;
  tracked: TrackedWrites;
  message: string;
  concept: 'pickUp' | 'putBack' | 'move';
}

async function runSingle(input: SingleWriteInput): Promise<void> {
  try {
    const result = await input.run();
    if (result.status === 'refused') {
      input.tracked.setRejection(input.id, refusalReason(result.refusal));
      return;
    }
    input.tracked.setRejection(input.id, null);
    if (result.undo !== null) {
      showUndoToast({ concept: input.concept, message: input.message, onUndo: result.undo });
    }
  } catch {
    input.tracked.setRejection(input.id, 'The inventory service did not answer.');
  }
}

type BulkWriteResult = Pick<BulkResult, 'applied' | 'undo'>;

function toastForBulk(
  result: BulkWriteResult,
  concept: 'pickUp' | 'move' | 'takeOut',
  message: string
): void {
  if (result.applied.length > 0 && result.undo !== null) {
    showUndoToast({ concept, message, onUndo: result.undo });
  }
}

function countMessage(verb: 'Picked up' | 'Took out', count: number): string {
  return `${verb} ${count} ${count === 1 ? 'item' : 'items'}`;
}

function rejectBulk(ids: readonly string[], tracked: TrackedWrites): void {
  for (const id of ids) tracked.setRejection(id, 'The inventory service did not answer.');
}

async function runBulkWrite(
  ids: readonly string[],
  tracked: TrackedWrites,
  run: () => Promise<BulkWriteResult>,
  onSuccess: (result: BulkWriteResult) => void
): Promise<void> {
  if (ids.length === 0) return;
  try {
    onSuccess(await run());
  } catch {
    rejectBulk(ids, tracked);
  }
}

function useBulkWriteActions(input: {
  bulk: ReturnType<typeof useBulkItemVerbs>;
  tracked: TrackedWrites;
  world: PlacementWorld;
}) {
  const { bulk, tracked, world } = input;
  const runBulkPickUp = useCallback(
    (ids: readonly string[]): Promise<void> =>
      runBulkWrite(
        ids,
        tracked,
        () => tracked.track(ids, () => bulk.pickUp(ids)),
        (result) => toastForBulk(result, 'pickUp', countMessage('Picked up', result.applied.length))
      ),
    [bulk, tracked]
  );
  const runTakeOutAction = useCallback(
    (ids: readonly string[]): Promise<void> =>
      runBulkWrite(
        ids,
        tracked,
        () => runTakeOut({ world, ids, bulk, track: tracked.track }),
        (result) => toastForBulk(result, 'takeOut', countMessage('Took out', result.applied.length))
      ),
    [bulk, tracked, world]
  );
  const runBulkMove = useCallback(
    (plan: MovePlan, onClose: () => void): Promise<void> => {
      if (plan.target.kind === 'in-hand') return Promise.resolve();
      const ids = plan.moving.map((item) => item.id);
      const target = plan.target;
      return runBulkWrite(
        ids,
        tracked,
        () => tracked.track(ids, () => bulk.move(ids, target)),
        (result) => {
          onClose();
          toastForBulk(
            result,
            'move',
            `Moved ${result.applied.length} ${result.applied.length === 1 ? 'item' : 'items'} to ${plan.targetName}`
          );
        }
      );
    },
    [bulk, tracked]
  );
  return { runBulkPickUp, runTakeOut: runTakeOutAction, runBulkMove };
}

function useRowWriteActions(input: {
  single: ReturnType<typeof useItemVerbs>;
  tracked: TrackedWrites;
}) {
  const { single, tracked } = input;
  type RowPlacement = (
    id: string,
    name: string,
    target: PlacementTarget,
    world: PlacementWorld
  ) => void;
  const runRowMove: RowPlacement = (id, itemName, target, moveWorld) => {
    const message =
      target.kind === 'in-hand'
        ? `Picked up ${itemName}`
        : `Moved ${itemName} to ${targetName(moveWorld, target)}`;
    void runSingle({
      id,
      run: () => (target.kind === 'in-hand' ? single.pickUp(id) : single.move(id, target)),
      tracked,
      message,
      concept: target.kind === 'in-hand' ? 'pickUp' : 'move',
    });
  };
  const runPickUp = (id: string, itemName: string): void => {
    void runSingle({
      id,
      run: () => single.pickUp(id),
      tracked,
      message: `Picked up ${itemName}`,
      concept: 'pickUp',
    });
  };
  const runPutBack: RowPlacement = (id, itemName, target, moveWorld) => {
    void runSingle({
      id,
      run: () => single.putBack(id),
      tracked,
      message: `Put ${itemName} back to ${targetName(moveWorld, target)}`,
      concept: 'putBack',
    });
  };
  return { runRowMove, runPickUp, runPutBack };
}

/** Binds optimistic single- and bulk-item writes to shared refusal and undo behavior. */
export const useListWriteActions = (input: {
  single: ReturnType<typeof useItemVerbs>;
  bulk: ReturnType<typeof useBulkItemVerbs>;
  tracked: TrackedWrites;
  world: PlacementWorld;
}) => ({ ...useBulkWriteActions(input), ...useRowWriteActions(input) });
