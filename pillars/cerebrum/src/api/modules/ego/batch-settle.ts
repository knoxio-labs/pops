import { syncActionsPart } from './batch-decision.js';
import { DECLINED_RESULT, INTERRUPTED_RESULT, resolutionFor } from './loop-resume.js';

import type { EgoActionsPart } from '../../../contract/rest-ego-parts.js';
import type { EgoActionStore } from './actions-store.js';
import type { ConversationPersistence } from './persistence.js';

/** Result stored when a new message supersedes an undecided action batch. */
export const SUPERSEDED_RESULT = 'This action was superseded by a new message and was not run.';

/** One settled action result to include in the next model turn. */
export interface SettledAction {
  batchId: string;
  actionId: string;
  tool: string;
  summary: string;
  content: string;
  isError: boolean;
}

/** Parts rewritten while settling batches, in oldest-batch order. */
export interface SettleResult {
  actions: SettledAction[];
  parts: EgoActionsPart[];
}

/** Reason a conversation's outstanding action batches are being settled. */
export type SettleMode = { reason: 'new-message' } | { reason: 'resume'; exceptBatchId: string };

type SettleDeps = { store: EgoActionStore; persistence: ConversationPersistence };
type Batch = NonNullable<ReturnType<EgoActionStore['getBatch']>>;

/**
 * Close outstanding batches before a new turn or a resumed continuation.
 * This operation never calls a tool.
 */
export async function settleConversation(
  deps: SettleDeps,
  conversationId: string,
  mode: SettleMode
): Promise<SettleResult> {
  const result: SettleResult = { actions: [], parts: [] };
  const batches = deps.store.listBatchesForConversation(conversationId);

  for (const listedBatch of batches) {
    if (listedBatch.status === 'auto') continue;
    if (mode.reason === 'resume' && listedBatch.id === mode.exceptBatchId) continue;

    const settledBatch = settleBatch(deps, listedBatch, mode);
    if (settledBatch === null) continue;

    const synced = await syncActionsPart(deps, settledBatch);
    if (synced !== null) result.parts.push(synced.part);
    result.actions.push(
      ...deps.store
        .listForBatch(settledBatch.id)
        .map((action) => toSettledAction(settledBatch.id, action))
    );
  }

  return result;
}

function settleBatch(deps: SettleDeps, listedBatch: Batch, mode: SettleMode): Batch | null {
  let batch: Batch | null = listedBatch;

  if (batch.status === 'pending') {
    if (mode.reason !== 'new-message') return null;
    if (deps.store.transitionBatch(batch.id, 'pending', 'decided')) {
      batch = deps.store.getBatch(batch.id);
      if (batch === null) return null;
      supersedePendingActions(deps.store, batch.id);
      deps.store.transitionBatch(batch.id, 'decided', 'continued');
      return deps.store.getBatch(batch.id) ?? batch;
    }
    batch = deps.store.getBatch(batch.id);
    if (batch === null) return null;
  }

  if (batch.status === 'decided') {
    if (!deps.store.transitionBatch(batch.id, 'decided', 'continued')) return null;
    batch = deps.store.getBatch(batch.id);
    if (batch === null) return null;
    failOpenActions(deps.store, batch.id);
    return batch;
  }

  if (batch.status === 'continued') {
    if (!deps.store.listForBatch(batch.id).some(({ status }) => isOpenStatus(status))) return null;
    failOpenActions(deps.store, batch.id);
    return batch;
  }

  return null;
}

function supersedePendingActions(store: EgoActionStore, batchId: string): void {
  for (const action of store.listForBatch(batchId)) {
    if (action.status === 'pending') {
      store.transition(action.id, 'pending', 'rejected', SUPERSEDED_RESULT);
    }
  }
}

function failOpenActions(store: EgoActionStore, batchId: string): void {
  for (const action of store.listForBatch(batchId)) {
    if (isOpenStatus(action.status)) {
      store.transition(action.id, action.status, 'failed', INTERRUPTED_RESULT);
    }
  }
}

function isOpenStatus(status: string): boolean {
  return status === 'pending' || status === 'confirmed';
}

function toSettledAction(
  batchId: string,
  action: ReturnType<EgoActionStore['listForBatch']>[number]
): SettledAction {
  const resolution =
    action.status === 'rejected'
      ? { content: action.result ?? DECLINED_RESULT, isError: false }
      : resolutionFor(action);
  return {
    batchId,
    actionId: action.id,
    tool: action.tool,
    summary: action.summary,
    content: resolution.content,
    isError: resolution.isError,
  };
}
