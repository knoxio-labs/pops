import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo, useSyncExternalStore } from 'react';

import { InventoryApiError } from '../inventory-api-helpers.js';
import { sendInventoryMutation, type InventoryMutationOutcome } from './mutation-client.js';
import { optimisticItemsFor, type ItemPatch, type OptimisticItems } from './optimistic-items.js';
import { recordPlacement } from './recents.js';

import type { FixedPlacement } from '../foundation/model/model.js';
import type { InventoryCommand, InventoryPlacementTarget } from './commands.js';
import type { WebItem } from './item-row-model.js';

/** A mutation outcome or transport failure that refused a verb. */
export type VerbRefusal =
  | { kind: 'outcome'; outcome: Exclude<InventoryMutationOutcome, { status: 'applied' }> }
  | { kind: 'failed'; error: InventoryApiError };

/** The result of one optimistic item verb. */
export type VerbResult =
  | { status: 'applied'; seq: number; undo: (() => Promise<void>) | null }
  | { status: 'refused'; refusal: VerbRefusal };

/** Thrown by an undo function when the compensating event is not applied. */
export class UndoRefusedError extends Error {
  constructor(readonly refusal: VerbRefusal) {
    super('inventory undo was refused');
    this.name = 'UndoRefusedError';
  }
}

type Result = Promise<VerbResult>;
type Lifecycle = 'retired' | 'discarded' | 'lost' | 'destroyed';
type EditChanges = { name?: string; note?: string | null };
/** Converts a model placement into the wire placement accepted by `item.move`. */
export function wirePlacement(to: FixedPlacement): InventoryPlacementTarget {
  return to.kind === 'location'
    ? { kind: 'location', locationId: to.locationId }
    : { kind: 'container', itemId: to.containerId };
}

type PreviousPlacement = WebItem['previousPlacement'];

function previousPlacementFor(item: WebItem, to: InventoryPlacementTarget): PreviousPlacement {
  if (to.kind !== 'hand') return null;
  return item.placement.kind === 'hand' ? item.previousPlacement : item.placement;
}

/** The shared optimistic patches used by item placement and state verbs. */
export const VERB_PATCHES = {
  place: (to: InventoryPlacementTarget) => (item: WebItem) =>
    Object.assign(
      { ...item },
      { placement: to, previousPlacement: previousPlacementFor(item, to) }
    ),
  access: (access: 'open' | 'closed') => (item: WebItem) => ({ ...item, access }),
  lifecycle: (lifecycle: 'active' | Lifecycle) => (item: WebItem) => ({ ...item, lifecycle }),
};

const WEB_QUERY_ROOT = ['inventory', 'web'] as const;
type RunOptions = { id: string; patch: ItemPatch; command: InventoryCommand } & Completion;
type RunVerb = (options: RunOptions) => Result;
type Completion = { canUndo: boolean; after?: () => void };

function runState(
  [run, id]: [RunVerb, string],
  patch: ItemPatch,
  command: InventoryCommand,
  completion: Completion
): Result {
  return run({ id, patch, command, ...completion });
}

function toFixedPlacement(placement: PreviousPlacement): FixedPlacement | null {
  if (placement === null) return null;
  if (placement.kind === 'location') return { kind: 'location', locationId: placement.locationId };
  return { kind: 'container', containerId: placement.itemId };
}

const normalizedNote = (note?: string | null) => (note?.trim() ? note : null);

const revertMutation = (id: string, seq: number): Promise<InventoryMutationOutcome> =>
  sendInventoryMutation({ command: { op: 'event.revert', args: { seq } }, entityId: id });

function throwUndoFailure(error: unknown): never {
  if (error instanceof UndoRefusedError) throw error;
  if (error instanceof InventoryApiError) throw new UndoRefusedError({ kind: 'failed', error });
  throw error;
}

function createUndo(
  queryClient: QueryClient,
  optimistic: OptimisticItems,
  id: string,
  seq: number
) {
  return async () => {
    await optimistic.settled(id);
    try {
      const outcome = await revertMutation(id, seq);
      if (outcome.status !== 'applied') throw new UndoRefusedError({ kind: 'outcome', outcome });
    } catch (error: unknown) {
      throwUndoFailure(error);
    } finally {
      void queryClient.invalidateQueries({ queryKey: WEB_QUERY_ROOT });
    }
  };
}

function createRunner(queryClient: QueryClient, optimistic: OptimisticItems): RunVerb {
  return async ({ id, patch, command, canUndo, after }) => {
    const ready = optimistic.settled(id);
    const token = optimistic.begin(id, patch);
    await ready;
    try {
      const outcome = await sendInventoryMutation({
        command,
        entityId: id,
        baseRevision: optimistic.baseRevision(id),
      });
      if (outcome.status !== 'applied') {
        optimistic.refuse(id, token);
        return { status: 'refused', refusal: { kind: 'outcome', outcome } };
      }
      optimistic.acknowledge(id, token, outcome);
      after?.();
      const undo = canUndo ? createUndo(queryClient, optimistic, id, outcome.seq) : null;
      return { status: 'applied', seq: outcome.seq, undo };
    } catch (error: unknown) {
      optimistic.refuse(id, token);
      if (error instanceof InventoryApiError)
        return { status: 'refused', refusal: { kind: 'failed', error } };
      throw error;
    }
  };
}

const moveVerb = (
  run: RunVerb,
  id: string,
  to: FixedPlacement,
  verb: 'move' | 'store' | 'put_back'
): Result => {
  const target = wirePlacement(to);
  const command: InventoryCommand = { op: 'item.move', args: { to: target, verb } };
  return runState([run, id], VERB_PATCHES.place(target), command, {
    canUndo: true,
    after: () => recordPlacement(to),
  });
};

async function putBackVerb(run: RunVerb, optimistic: OptimisticItems, id: string): Result {
  const previous = toFixedPlacement(optimistic.displayed(id).previousPlacement);
  if (previous === null) throw new Error(`item ${id} has no previous place`);
  return moveVerb(run, id, previous, 'put_back');
}

function editVerb(run: RunVerb, id: string, changes: EditChanges): Result {
  const args: EditChanges = {};
  if (changes.name !== undefined) args.name = changes.name;
  if (changes.note !== undefined) args.note = changes.note;
  const patch: ItemPatch = (item) => ({
    ...item,
    ...(changes.name === undefined ? {} : { name: changes.name.trim() }),
    ...(changes.note === undefined ? {} : { note: normalizedNote(changes.note) }),
  });
  return runState([run, id], patch, { op: 'item.edit', args }, { canUndo: true });
}

function createItemVerbs(queryClient: QueryClient) {
  const optimistic = optimisticItemsFor(queryClient);
  const run = createRunner(queryClient, optimistic);
  const state = (id: string, patch: ItemPatch, command: InventoryCommand): Result =>
    runState([run, id], patch, command, { canUndo: true });
  const place =
    (verb: 'move' | 'store') =>
    (id: string, to: FixedPlacement): Result =>
      moveVerb(run, id, to, verb);
  const hand: InventoryPlacementTarget = { kind: 'hand' };
  const active: InventoryCommand = { op: 'item.setLifecycle', args: { lifecycle: 'active' } };
  return {
    move: place('move'),
    store: place('store'),
    pickUp: (id: string) =>
      state(id, VERB_PATCHES.place(hand), { op: 'item.move', args: { to: hand, verb: 'pick_up' } }),
    putBack: (id: string) => putBackVerb(run, optimistic, id),
    setAccess: (id: string, access: 'open' | 'closed') =>
      state(id, VERB_PATCHES.access(access), { op: 'item.setAccess', args: { access } }),
    setFull: (id: string, full: boolean) =>
      state(id, (item) => ({ ...item, isFull: full }), { op: 'item.setFull', args: { full } }),
    setLifecycle: (id: string, lifecycle: Lifecycle, reason: string | null) =>
      runState(
        [run, id],
        VERB_PATCHES.lifecycle(lifecycle),
        { op: 'item.setLifecycle', args: reason === null ? { lifecycle } : { lifecycle, reason } },
        { canUndo: lifecycle !== 'destroyed' }
      ),
    restore: (id: string) => state(id, VERB_PATCHES.lifecycle('active'), active),
    setQuantity: (id: string, quantity: number) =>
      state(id, (item) => ({ ...item, quantity }), { op: 'item.setQuantity', args: { quantity } }),
    split: (id: string, quantity: number) =>
      runState(
        [run, id],
        (item) => ({ ...item, quantity: item.quantity - quantity }),
        { op: 'item.split', args: { newItemId: crypto.randomUUID(), quantity } },
        { canUndo: false }
      ),
    setCode: (id: string, code: string | null) =>
      runState(
        [run, id],
        (item) => ({ ...item, code: code === null ? null : code.trim() }),
        { op: 'item.setCode', args: { code: code === null ? null : code.trim() } },
        { canUndo: true }
      ),
    edit: (id: string, changes: EditChanges) => editVerb(run, id, changes),
  };
}

/** The typed single-item verbs exposed to inventory pages. */
export type ItemVerbs = ReturnType<typeof createItemVerbs>;

/** Returns the single-item verbs backed by the current React Query client. */
export const useItemVerbs = (): ItemVerbs => {
  const queryClient = useQueryClient();
  return useMemo(() => createItemVerbs(queryClient), [queryClient]);
};

/** Returns the ids whose optimistic item verb is currently in flight. */
export const usePendingItemIds = (): ReadonlySet<string> => {
  const queryClient = useQueryClient();
  const optimistic = optimisticItemsFor(queryClient);
  return useSyncExternalStore(optimistic.subscribe, optimistic.pendingIds, optimistic.pendingIds);
};
