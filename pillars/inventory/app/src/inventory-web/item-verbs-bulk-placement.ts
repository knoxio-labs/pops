import {
  executeBulk,
  type BulkExecutionInput,
  type PreparedBulkItem,
} from './item-verbs-bulk-execution.js';
import {
  commandForMove,
  dedupeIds,
  emptyBulkResult,
  fixedPlacementPatch,
  loadedItems,
  placementKey,
  previousFixedPlacement,
} from './item-verbs-bulk-preparation.js';
import { VERB_PATCHES, wirePlacement } from './item-verbs.js';
import { recordPlacement } from './recents.js';

import type { FixedPlacement } from '../foundation/model/model.js';
import type { InventoryPlacementTarget } from './commands.js';
import type { BulkActionContext } from './item-verbs-bulk-preparation.js';
import type { BulkItemVerbs, BulkRefusal, BulkResult } from './item-verbs-bulk-types.js';

function moveInput(
  ids: readonly string[],
  to: FixedPlacement,
  verb: 'move' | 'store'
): PreparedBulkItem[] {
  const target = wirePlacement(to);
  return ids.map((id) => ({
    id,
    patch: fixedPlacementPatch(to),
    command: commandForMove(target, verb),
  }));
}

async function runPlacement(
  context: BulkActionContext,
  ids: readonly string[],
  to: FixedPlacement,
  verb: 'move' | 'store'
): Promise<BulkResult> {
  const uniqueIds = dedupeIds(ids);
  if (uniqueIds.length === 0) return emptyBulkResult();
  loadedItems(context.optimistic, uniqueIds);
  const execution = await executeBulk({
    queryClient: context.queryClient,
    optimistic: context.optimistic,
    ids: uniqueIds,
    prepared: moveInput(uniqueIds, to, verb),
    initialRefusals: [],
  });
  if (execution.result.applied.length > 0) recordPlacement(to);
  return execution.result;
}

async function pickUp(context: BulkActionContext, ids: readonly string[]): Promise<BulkResult> {
  const uniqueIds = dedupeIds(ids);
  if (uniqueIds.length === 0) return emptyBulkResult();
  loadedItems(context.optimistic, uniqueIds);
  const hand: InventoryPlacementTarget = { kind: 'hand' };
  const prepared = uniqueIds.map((id): PreparedBulkItem => ({
    id,
    patch: VERB_PATCHES.place(hand),
    command: { op: 'item.move', args: { to: hand, verb: 'pick_up' } },
  }));
  const execution = await executeBulk({
    queryClient: context.queryClient,
    optimistic: context.optimistic,
    ids: uniqueIds,
    prepared,
    initialRefusals: [],
  });
  return execution.result;
}

interface PutBackPreparation {
  readonly previousById: ReadonlyMap<string, FixedPlacement | null>;
  readonly prepared: readonly PreparedBulkItem[];
  readonly initialRefusals: readonly BulkRefusal[];
}

function preparePutBack(context: BulkActionContext, ids: readonly string[]): PutBackPreparation {
  const displayed = loadedItems(context.optimistic, ids);
  const previousById = new Map<string, FixedPlacement | null>();
  const prepared: PreparedBulkItem[] = [];
  const initialRefusals: BulkRefusal[] = [];

  ids.forEach((id) => {
    const item = displayed.get(id);
    if (item === undefined) throw new Error(`item ${id} is not loaded`);
    const previous = previousFixedPlacement(item);
    previousById.set(id, previous);
    if (previous === null) {
      initialRefusals.push({ id, refusal: { kind: 'no-previous-place' } });
      return;
    }
    const target = wirePlacement(previous);
    prepared.push({
      id,
      patch: VERB_PATCHES.place(target),
      command: commandForMove(target, 'put_back'),
    });
  });
  return { previousById, prepared, initialRefusals };
}

function recordAppliedPreviousPlaces(
  applied: readonly string[],
  previousById: ReadonlyMap<string, FixedPlacement | null>
): void {
  const recorded = new Set<string>();
  applied.forEach((id) => {
    const previous = previousById.get(id);
    if (previous === undefined || previous === null) return;
    const key = placementKey(previous);
    if (recorded.has(key)) return;
    recorded.add(key);
    recordPlacement(previous);
  });
}

async function putBack(context: BulkActionContext, ids: readonly string[]): Promise<BulkResult> {
  const uniqueIds = dedupeIds(ids);
  if (uniqueIds.length === 0) return emptyBulkResult();
  const preparation = preparePutBack(context, uniqueIds);
  const input: BulkExecutionInput = {
    queryClient: context.queryClient,
    optimistic: context.optimistic,
    ids: uniqueIds,
    prepared: preparation.prepared,
    initialRefusals: preparation.initialRefusals,
  };
  const execution = await executeBulk(input);
  recordAppliedPreviousPlaces(execution.result.applied, preparation.previousById);
  return execution.result;
}

/** Builds the placement bulk verbs. */
export function createBulkPlacementVerbs(
  context: BulkActionContext
): Pick<BulkItemVerbs, 'move' | 'store' | 'pickUp' | 'putBack'> {
  return {
    move: (ids, to) => runPlacement(context, ids, to, 'move'),
    store: (ids, to) => runPlacement(context, ids, to, 'store'),
    pickUp: (ids) => pickUp(context, ids),
    putBack: (ids) => putBack(context, ids),
  };
}
