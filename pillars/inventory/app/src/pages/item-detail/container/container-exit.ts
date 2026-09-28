import { useCallback } from 'react';

import {
  runTakeOut,
  type TakeOutRun,
  type TrackedWrites,
} from '../../../foundation/list-page/take-out.js';
import { showBulkUndo, restoreUnapplied } from './workspace-model.js';

import type { PlacementWorld } from '../../../foundation/model/placement-model.js';
import type { BulkItemVerbs, BulkResult } from '../../../inventory-web/item-verbs-bulk.js';
import type { UnpackAction, UnpackState, ExitKind } from './unpack-model.js';

/** Inputs for one guarded container exit operation. */
export interface ExitRequestInput {
  ids: readonly string[];
  how: ExitKind;
  state: UnpackState;
  world: PlacementWorld;
  bulk: Pick<BulkItemVerbs, 'move' | 'pickUp'>;
  tracked: TrackedWrites;
  dispatch: (action: UnpackAction) => void;
  openMove: (ids: readonly string[]) => void;
}

/** Applies a take-out or pick-up operation with optimistic rollback and refusals. */
export async function executeExit(input: ExitRequestInput): Promise<void> {
  const selected = [...new Set(input.ids)].filter((id) => input.state.inside.includes(id));
  if (input.how === 'move') {
    input.openMove(selected);
    return;
  }
  if (selected.length === 0 || input.state.access === 'closed') return;
  input.dispatch({ type: 'exit', ids: selected, how: input.how });
  try {
    let result: BulkResult | TakeOutRun;
    if (input.how === 'take-out') {
      result = await runTakeOut({
        world: input.world,
        ids: selected,
        bulk: input.bulk,
        track: input.tracked.track,
      });
    } else {
      result = await input.tracked.track(selected, () => input.bulk.pickUp(selected));
    }
    restoreUnapplied(input.dispatch, selected, result.applied);
    const verb = input.how === 'take-out' ? 'Took out' : 'Picked up';
    const concept = input.how === 'take-out' ? 'takeOut' : 'pickUp';
    showBulkUndo(
      result,
      concept,
      `${verb} ${result.applied.length} ${result.applied.length === 1 ? 'item' : 'items'}`,
      input.dispatch
    );
  } catch {
    input.dispatch({ type: 'restore', ids: selected });
    for (const id of selected)
      input.tracked.setRejection(id, 'The inventory service did not answer.');
  }
}

/** Returns optimistic take-out, move-picker, and pick-up actions for a container. */
export function useContainerExitActions({
  state,
  world,
  bulk,
  tracked,
  dispatch,
  openMove,
}: Omit<ExitRequestInput, 'ids' | 'how'>): {
  runExit: (ids: readonly string[], how: ExitKind) => Promise<void>;
  handleExit: (ids: readonly string[], how: ExitKind) => void;
} {
  const runExit = useCallback(
    (ids: readonly string[], how: ExitKind): Promise<void> =>
      executeExit({ ids, how, state, world, bulk, tracked, dispatch, openMove }),
    [bulk, dispatch, openMove, state, tracked, world]
  );
  const handleExit = useCallback(
    (ids: readonly string[], how: ExitKind): void => {
      void runExit(ids, how);
    },
    [runExit]
  );
  return { runExit, handleExit };
}
