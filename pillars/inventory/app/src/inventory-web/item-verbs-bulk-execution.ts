import { MAX_MUTATION_BATCH } from '@pops/inventory';

import { InventoryApiError } from '../inventory-api-helpers.js';
import {
  BulkUndoRefusedError,
  type BulkItemRefusal,
  type BulkRefusal,
  type BulkResult,
} from './item-verbs-bulk-types.js';
import {
  sendInventoryMutations,
  type InventoryCommandInput,
  type InventoryMutationOutcome,
} from './mutation-client.js';
import { type ItemPatch, type OptimisticItems } from './optimistic-items.js';

import type { QueryClient } from '@tanstack/react-query';

import type { InventoryCommand } from './commands.js';

const WEB_QUERY_ROOT = ['inventory', 'web'] as const;

/** One prepared item command and its optimistic patch. */
export interface PreparedBulkItem {
  readonly id: string;
  readonly patch: ItemPatch;
  readonly command: InventoryCommand;
  readonly catalogueRevision?: number;
}

/** Inputs required to execute one validated bulk operation. */
export interface BulkExecutionInput {
  readonly queryClient: QueryClient;
  readonly optimistic: OptimisticItems;
  readonly ids: readonly string[];
  readonly prepared: readonly PreparedBulkItem[];
  readonly initialRefusals: readonly BulkRefusal[];
}

interface StartedBulkItem extends PreparedBulkItem {
  readonly ready: Promise<void>;
  readonly token: number;
}

interface AppliedBulkItem {
  readonly id: string;
  readonly seq: number;
}

type BulkExecution = { applied: readonly AppliedBulkItem[]; result: BulkResult };

interface BatchState {
  readonly optimistic: OptimisticItems;
  readonly refusedById: Map<string, BulkItemRefusal>;
  readonly appliedById: Map<string, number>;
}

function beginItems(
  optimistic: OptimisticItems,
  prepared: readonly PreparedBulkItem[],
  started: StartedBulkItem[]
): void {
  prepared.forEach((item) => {
    const ready = optimistic.settled(item.id);
    const token = optimistic.begin(item.id, item.patch);
    started.push({ ...item, ready, token });
  });
}

function mutationInputs(items: readonly PreparedBulkItem[], optimistic: OptimisticItems) {
  return items.map((item): InventoryCommandInput => ({
    command: item.command,
    entityId: item.id,
    baseRevision: optimistic.baseRevision(item.id),
    catalogueRevision: item.catalogueRevision,
  }));
}

function refuseBatch(
  batch: readonly StartedBulkItem[],
  state: BatchState,
  error: InventoryApiError
): void {
  batch.forEach((item) => {
    state.optimistic.refuse(item.id, item.token);
    state.refusedById.set(item.id, { kind: 'failed', error });
  });
}

function settleOutcomes(
  batch: readonly StartedBulkItem[],
  outcomes: readonly InventoryMutationOutcome[],
  state: BatchState
): void {
  batch.forEach((item, index) => {
    const outcome = outcomes[index];
    if (outcome === undefined) {
      throw new InventoryApiError(
        `inventory mutation returned no outcome for ${item.id}`,
        undefined
      );
    }
    if (outcome.status === 'applied') {
      state.optimistic.acknowledge(item.id, item.token, outcome);
      state.appliedById.set(item.id, outcome.seq);
      return;
    }
    state.optimistic.refuse(item.id, item.token);
    state.refusedById.set(item.id, { kind: 'outcome', outcome });
  });
}

async function sendBatch(batch: readonly StartedBulkItem[], state: BatchState): Promise<void> {
  try {
    const outcomes = await sendInventoryMutations(mutationInputs(batch, state.optimistic));
    settleOutcomes(batch, outcomes, state);
  } catch (error: unknown) {
    if (!(error instanceof InventoryApiError)) throw error;
    refuseBatch(batch, state, error);
  }
}

async function sendBatches(started: readonly StartedBulkItem[], state: BatchState): Promise<void> {
  for (let start = 0; start < started.length; start += MAX_MUTATION_BATCH) {
    await sendBatch(started.slice(start, start + MAX_MUTATION_BATCH), state);
  }
}

function resultFor(
  ids: readonly string[],
  appliedById: ReadonlyMap<string, number>,
  refusedById: ReadonlyMap<string, BulkItemRefusal>
): { applied: AppliedBulkItem[]; refused: BulkRefusal[] } {
  const applied = ids.flatMap((id) => {
    const seq = appliedById.get(id);
    return seq === undefined ? [] : [{ id, seq }];
  });
  const refused = ids.flatMap((id) => {
    const refusal = refusedById.get(id);
    return refusal === undefined ? [] : [{ id, refusal }];
  });
  return { applied, refused };
}

function createBulkUndo(
  queryClient: QueryClient,
  optimistic: OptimisticItems,
  applied: readonly AppliedBulkItem[]
): () => Promise<void> {
  return async () => {
    try {
      await Promise.all(applied.map(({ id }) => optimistic.settled(id)));
      const refused = await sendUndoBatches(applied);
      if (refused.length > 0) throw new BulkUndoRefusedError(refused);
    } finally {
      void queryClient.invalidateQueries({ queryKey: WEB_QUERY_ROOT });
    }
  };
}

async function sendUndoBatch(batch: readonly AppliedBulkItem[]): Promise<BulkRefusal[]> {
  const inputs: InventoryCommandInput[] = batch.map(({ id, seq }) => ({
    command: { op: 'event.revert', args: { seq } },
    entityId: id,
  }));
  try {
    const outcomes = await sendInventoryMutations(inputs);
    return batch.flatMap(({ id }, index) => {
      const outcome = outcomes[index];
      if (outcome === undefined) {
        throw new InventoryApiError(`inventory mutation returned no outcome for ${id}`, undefined);
      }
      return outcome.status === 'applied'
        ? []
        : [{ id, refusal: { kind: 'outcome', outcome } as const }];
    });
  } catch (error: unknown) {
    if (!(error instanceof InventoryApiError)) throw error;
    return batch.map(({ id }) => ({ id, refusal: { kind: 'failed', error } }));
  }
}

async function sendUndoBatches(applied: readonly AppliedBulkItem[]): Promise<BulkRefusal[]> {
  const refused: BulkRefusal[] = [];
  for (let start = 0; start < applied.length; start += MAX_MUTATION_BATCH) {
    refused.push(...(await sendUndoBatch(applied.slice(start, start + MAX_MUTATION_BATCH))));
  }
  return refused;
}

/** Executes validated item commands with one optimistic ledger entry per item. */
export async function executeBulk(input: BulkExecutionInput): Promise<BulkExecution> {
  if (input.prepared.length === 0) {
    return {
      applied: [],
      result: { applied: [], refused: [...input.initialRefusals], undo: null },
    };
  }

  const refusedById = new Map(input.initialRefusals.map(({ id, refusal }) => [id, refusal]));
  const appliedById = new Map<string, number>();
  const started: StartedBulkItem[] = [];
  const releaseInvalidation = input.optimistic.holdInvalidation();
  const state = { optimistic: input.optimistic, refusedById, appliedById };

  try {
    beginItems(input.optimistic, input.prepared, started);
    await Promise.all(started.map(({ ready }) => ready));
    await sendBatches(started, state);
  } finally {
    started.forEach((item) => input.optimistic.refuse(item.id, item.token));
    releaseInvalidation();
  }

  const { applied, refused } = resultFor(input.ids, appliedById, refusedById);
  return {
    applied,
    result: {
      applied: applied.map(({ id }) => id),
      refused,
      undo:
        applied.length === 0 ? null : createBulkUndo(input.queryClient, input.optimistic, applied),
    },
  };
}
