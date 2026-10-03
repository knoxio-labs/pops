import { DECLINED_RESULT } from './loop-resume.js';

import type { EgoActionsPart, EgoMessagePart } from '../../../contract/rest-ego-parts.js';
import type { EgoActionBatchRow, EgoActionRow } from '../../../db/index.js';
import type { EgoActionStore } from './actions-store.js';
import type { Message, ConversationPersistence } from './persistence.js';

/** The user's complete decision for one pending batch. */
export interface BatchDecision {
  approve: string[];
  reject: string[];
  alwaysAllow: string[];
}

/** The persisted result of recording a decision, before any write is run. */
export interface BatchOutcome {
  batch: EgoActionBatchRow;
  actions: EgoActionRow[];
  updatedMessage: Message | null;
}

/** A decision could not be recorded because the batch or its decision is invalid. */
export type DecideFailure = 'not-found' | 'not-pending' | 'invalid';

/** Persistence dependencies used to record a batch decision without running tools. */
export interface BatchDecisionDeps {
  store: EgoActionStore;
  persistence: ConversationPersistence;
}

/** Record a user's decision once, leaving approved writes confirmed for a runner. */
export async function decideBatch(
  deps: BatchDecisionDeps,
  batchId: string,
  decision: BatchDecision
): Promise<BatchOutcome | DecideFailure> {
  const batch = deps.store.getBatch(batchId);
  if (batch === null) return 'not-found';

  const actions = deps.store.listForBatch(batchId);
  if (!isValidDecision(actions, decision)) return 'invalid';

  if (!deps.store.transitionBatch(batchId, 'pending', 'decided')) return 'not-pending';

  if (decision.alwaysAllow.length > 0) {
    deps.persistence.addAllowedTools(batch.conversationId, decision.alwaysAllow);
  }

  const approvedIds = new Set(decision.approve);
  for (const action of actions) {
    if (approvedIds.has(action.id)) {
      deps.store.transition(action.id, 'pending', 'confirmed');
    } else {
      deps.store.transition(action.id, 'pending', 'rejected', DECLINED_RESULT);
    }
  }

  const decidedBatch = deps.store.getBatch(batchId);
  if (decidedBatch === null) {
    throw new Error(`Ego action batch ${batchId} disappeared after it was decided`);
  }

  const updatedMessage = await syncActionsPart(deps, decidedBatch);
  return {
    batch: decidedBatch,
    actions: deps.store.listForBatch(batchId),
    updatedMessage: updatedMessage?.message ?? null,
  };
}

/** Synchronize a batch's persisted actions part with its action rows. */
export async function syncActionsPart(
  deps: BatchDecisionDeps,
  batch: EgoActionBatchRow
): Promise<{ message: Message; part: EgoActionsPart } | null> {
  const conversation = deps.persistence.getConversation(batch.conversationId);
  const message = conversation?.messages.find((item) => item.id === batch.messageId);
  if (message?.parts == null) {
    warnMissingActionsPart(batch);
    return null;
  }

  const partIndex = message.parts.findIndex(
    (part) => part.type === 'actions' && part.batchId === batch.id
  );
  const currentPart = message.parts[partIndex];
  if (currentPart?.type !== 'actions') {
    warnMissingActionsPart(batch);
    return null;
  }

  const statuses = new Map(
    deps.store.listForBatch(batch.id).map((action) => [action.id, action.status])
  );
  const updatedPart: EgoActionsPart = {
    ...currentPart,
    actions: currentPart.actions.map((action) => {
      const status = statuses.get(action.actionId);
      return status === undefined ? action : { ...action, status };
    }),
  };
  const parts: EgoMessagePart[] = message.parts.map((part, index) =>
    index === partIndex ? updatedPart : part
  );

  if (!deps.persistence.updateMessageParts(message.id, parts)) {
    warnMissingActionsPart(batch);
    return null;
  }

  return { message: { ...message, parts }, part: updatedPart };
}

function isValidDecision(actions: EgoActionRow[], decision: BatchDecision): boolean {
  if (
    !Array.isArray(decision.approve) ||
    !Array.isArray(decision.reject) ||
    !Array.isArray(decision.alwaysAllow) ||
    decision.approve.some((id) => typeof id !== 'string') ||
    decision.reject.some((id) => typeof id !== 'string') ||
    decision.alwaysAllow.some((tool) => typeof tool !== 'string')
  ) {
    return false;
  }

  const actionIds = new Set(actions.map((action) => action.id));
  const selectedIds = [...decision.approve, ...decision.reject];
  if (selectedIds.length !== actions.length) return false;

  const selectedSet = new Set(selectedIds);
  if (selectedSet.size !== selectedIds.length) return false;
  if (selectedIds.some((id) => !actionIds.has(id))) return false;

  const approvedTools = new Set(
    actions.filter((action) => decision.approve.includes(action.id)).map((action) => action.tool)
  );
  return decision.alwaysAllow.every((tool) => approvedTools.has(tool));
}

function warnMissingActionsPart(batch: EgoActionBatchRow): void {
  console.warn(`ego: cannot sync actions part for batch ${batch.id} in message ${batch.messageId}`);
}
