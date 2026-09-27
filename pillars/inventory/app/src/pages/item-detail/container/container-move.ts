import { useCallback, useState } from 'react';

import { planIsApplicable, type MovePlan } from '../../../foundation/move-plan/move-plan-model.js';
import { fixedTarget, restoreUnapplied, showBulkUndo } from './workspace-model.js';

import type { TrackedWrites } from '../../../foundation/list-page/take-out.js';
import type { BulkItemVerbs } from '../../../inventory-web/item-verbs-bulk.js';
import type { UnpackAction } from './unpack-model.js';

interface MoveRequestInput {
  plan: MovePlan;
  bulk: BulkItemVerbs;
  tracked: TrackedWrites;
  dispatch: (action: UnpackAction) => void;
}

async function executeMove(input: MoveRequestInput): Promise<void> {
  const ids = input.plan.moving.map((item) => item.id);
  const target = fixedTarget(input.plan.target);
  if (ids.length === 0) return;
  input.dispatch({ type: 'exit', ids, how: 'move' });
  try {
    const result =
      target === null
        ? await input.tracked.track(ids, () => input.bulk.pickUp(ids))
        : await input.tracked.track(ids, () => input.bulk.move(ids, target));
    restoreUnapplied(input.dispatch, ids, result.applied);
    showBulkUndo(
      result,
      target === null ? 'pickUp' : 'move',
      `Moved ${result.applied.length} ${result.applied.length === 1 ? 'item' : 'items'} to ${input.plan.targetName}`,
      input.dispatch
    );
  } catch {
    input.dispatch({ type: 'restore', ids });
    for (const id of ids) input.tracked.setRejection(id, 'The inventory service did not answer.');
  }
}

/** Returns the guarded optimistic mutation for an applicable move plan. */
export function useContainerMoveAction({
  plan,
  readOnly,
  bulk,
  tracked,
  dispatch,
  clearMove,
}: {
  plan: MovePlan | null;
  readOnly: boolean;
  bulk: BulkItemVerbs;
  tracked: TrackedWrites;
  dispatch: (action: UnpackAction) => void;
  clearMove: () => void;
}): { moveBusy: boolean; runMove: () => Promise<void> } {
  const [moveBusy, setMoveBusy] = useState(false);
  const runMove = useCallback(async (): Promise<void> => {
    if (plan === null || !planIsApplicable(plan) || readOnly) return;
    setMoveBusy(true);
    await executeMove({ plan, bulk, tracked, dispatch });
    setMoveBusy(false);
    clearMove();
  }, [bulk, clearMove, dispatch, plan, readOnly, tracked]);
  return { moveBusy, runMove };
}
