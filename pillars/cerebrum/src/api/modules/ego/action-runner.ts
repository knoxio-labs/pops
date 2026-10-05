import { syncActionsPart } from './batch-decision.js';
import { INTERRUPTED_RESULT, resolutionFor } from './loop-resume.js';

import type { EgoActionsPart } from '../../../contract/rest-ego-parts.js';
import type { EgoActionStore } from './actions-store.js';
import type { GatewayCaller } from './gateway/gateway-client.js';
import type { ActionResolution } from './loop-resume.js';
import type { ConversationPersistence } from './persistence.js';

/** Events produced while confirmed actions are run and their message part is updated. */
export type ActionRunEvent =
  | { type: 'tool'; name: string; status: 'started' | 'finished' | 'failed' }
  | { type: 'part'; part: EgoActionsPart };

/** Gateway used when a decided batch is resumed by an instance without tool configuration. */
export const unavailableGateway: GatewayCaller = {
  async listTools() {
    return [];
  },
  async callTool() {
    throw new Error('The tool gateway is not configured.');
  },
};

/**
 * Run the batch's confirmed actions in proposal order. The caller must first
 * claim the batch by moving it from `decided` to `continued`.
 */
export async function* executeConfirmedActions(params: {
  store: EgoActionStore;
  persistence: ConversationPersistence;
  gateway: GatewayCaller;
  batchId: string;
}): AsyncGenerator<ActionRunEvent, ReadonlyMap<string, ActionResolution>> {
  const batch = params.store.getBatch(params.batchId);
  if (batch === null) throw new Error(`Ego action batch ${params.batchId} does not exist`);

  const actions = params.store.listForBatch(params.batchId);
  yield* failInterruptedActions(params, batch, actions);

  for (const action of actions) {
    if (action.status !== 'confirmed') continue;
    const current = params.store.get(action.id);
    if (current?.status !== 'confirmed') continue;

    yield { type: 'tool', name: action.tool, status: 'started' };
    let result: { text: string; isError: boolean };
    try {
      result = await params.gateway.callTool(action.tool, action.args as Record<string, unknown>);
    } catch (error) {
      result = {
        text: error instanceof Error ? error.message : String(error),
        isError: true,
      };
    }

    const status = result.isError ? 'failed' : 'executed';
    params.store.transition(action.id, 'confirmed', status, result.text.slice(0, 4000));
    const synced = await syncActionsPart(params, batch);
    yield { type: 'tool', name: action.tool, status: result.isError ? 'failed' : 'finished' };
    if (synced !== null) yield { type: 'part', part: synced.part };
  }

  return new Map(
    params.store.listForBatch(params.batchId).map((action) => [action.id, resolutionFor(action)])
  );
}

async function* failInterruptedActions(
  params: { store: EgoActionStore; persistence: ConversationPersistence },
  batch: NonNullable<ReturnType<EgoActionStore['getBatch']>>,
  actions: ReturnType<EgoActionStore['listForBatch']>
): AsyncGenerator<ActionRunEvent> {
  for (const action of actions) {
    if (action.status !== 'pending') continue;
    if (!params.store.transition(action.id, 'pending', 'failed', INTERRUPTED_RESULT)) continue;
    const synced = await syncActionsPart(params, batch);
    if (synced !== null) yield { type: 'part', part: synced.part };
  }
}
