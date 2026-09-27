import { toast } from 'sonner';

import { showUndoToast } from '../feedback/undo-toast.js';
import { runTakeOut, type TrackedWrites } from '../list-page/take-out.js';
import { planMove } from '../move-plan/move-plan-model.js';

import type { BulkItemVerbs } from '../../inventory-web/item-verbs-bulk.js';
import type { PlacementTarget } from '../model/model.js';
import type { PlacementWorld } from '../model/placement-model.js';

type BulkPlacementVerbs = Pick<BulkItemVerbs, 'move' | 'pickUp'>;
type BulkLifecycleVerbs = Pick<BulkItemVerbs, 'setLifecycle'>;

function things(count: number): string {
  return `${count} ${count === 1 ? 'thing' : 'things'}`;
}

function fixedTarget(target: PlacementTarget) {
  if (target.kind === 'location') return target;
  if (target.kind === 'container') return target;
  throw new Error('in-hand is not a fixed placement');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The inventory service did not answer.';
}

/** Writes one planned placement and exposes its compensating Undo operation. */
export async function performPlacement({
  ids,
  target,
  world,
  bulk,
  tracked,
  concept,
  verb,
}: {
  ids: readonly string[];
  target: PlacementTarget;
  world: PlacementWorld;
  bulk: BulkPlacementVerbs;
  tracked: TrackedWrites;
  concept: 'move' | 'pickUp';
  verb: 'Moved' | 'Picked up';
}): Promise<void> {
  const plan = planMove({ world, selectedIds: ids, target });
  if (plan.moving.length === 0) return;
  const movingIds = plan.moving.map((item) => item.id);
  try {
    const result = await tracked.track(movingIds, () =>
      target.kind === 'in-hand' ? bulk.pickUp(movingIds) : bulk.move(movingIds, fixedTarget(target))
    );
    if (result.applied.length > 0 && result.undo !== null) {
      showUndoToast({
        concept,
        message:
          target.kind === 'in-hand'
            ? `${verb} ${things(plan.moving.length + plan.carried.length)}`
            : `${verb} ${things(plan.moving.length + plan.carried.length)} to ${plan.targetName}`,
        onUndo: result.undo,
      });
    }
  } catch (error: unknown) {
    toast.error(`Not saved. ${errorMessage(error)}`);
  }
}

/** Runs Take out grouped by each item's effective fixed destination. */
export async function performTakeOut({
  world,
  ids,
  bulk,
  tracked,
}: {
  world: PlacementWorld;
  ids: readonly string[];
  bulk: BulkPlacementVerbs;
  tracked: TrackedWrites;
}): Promise<void> {
  try {
    const result = await runTakeOut({ world, ids, bulk, track: tracked.track });
    if (result.applied.length > 0 && result.undo !== null) {
      showUndoToast({
        concept: 'takeOut',
        message: `Took ${things(result.applied.length)} out`,
        onUndo: result.undo,
      });
    }
  } catch (error: unknown) {
    toast.error(`Not saved. ${errorMessage(error)}`);
  }
}

/** Runs one lifecycle action and exposes its compensating Undo operation. */
export async function performLifecycle({
  ids,
  act,
  reason,
  bulk,
  tracked,
}: {
  ids: readonly string[];
  act: 'retire' | 'discard';
  reason: string | null;
  bulk: BulkLifecycleVerbs;
  tracked: TrackedWrites;
}): Promise<void> {
  try {
    const result = await tracked.track(currentIds(ids), () =>
      bulk.setLifecycle(currentIds(ids), act === 'retire' ? 'retired' : 'discarded', reason)
    );
    if (result.applied.length > 0 && result.undo !== null) {
      const past = act === 'retire' ? 'Retired' : 'Discarded';
      showUndoToast({
        concept: act === 'retire' ? 'retired' : 'discarded',
        message: `${past} ${things(result.applied.length)}`,
        onUndo: result.undo,
      });
    }
  } catch (error: unknown) {
    toast.error(`Not saved. ${errorMessage(error)}`);
  }
}

function currentIds(ids: readonly string[]): string[] {
  return [...ids];
}
