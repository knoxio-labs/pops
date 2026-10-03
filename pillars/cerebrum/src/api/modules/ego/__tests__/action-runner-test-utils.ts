import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openCerebrumDb } from '../../../../db/index.js';
import { EgoActionStore } from '../actions-store.js';
import { DECLINED_RESULT } from '../loop-resume.js';
import { ConversationPersistence } from '../persistence.js';

import type { EgoActionsPart } from '../../../../contract/rest-ego-parts.js';
import type { EgoActionStatus } from '../../../../db/services/ego-actions-types.js';
import type { ActionRunEvent, executeConfirmedActions } from '../action-runner.js';
import type { GatewayCallResult, GatewayCaller } from '../gateway/gateway-client.js';
import type { ActionResolution } from '../loop-resume.js';
import type { Message } from '../persistence.js';

/** Stable rows used by the action-runner tests. */
export const TEST_ACTIONS = [
  { id: 'action-1', tool: 'finance.transactions.addTags', args: { transactionId: 'tx-1' } },
  { id: 'action-2', tool: 'inventory.items.move', args: { itemId: 'item-2' } },
  { id: 'action-3', tool: 'finance.transactions.removeTags', args: { transactionId: 'tx-3' } },
] as const;

/** Resources created for one isolated action-runner test. */
export interface RunnerFixture {
  store: EgoActionStore;
  persistence: ConversationPersistence;
  batchId: string;
  messageId: string;
  conversationId: string;
  readMessage: () => Message | undefined;
  close: () => void;
}

/** Create a temp database with a decided batch and matching persisted message part. */
export function createRunnerFixture(
  options: {
    statuses?: readonly EgoActionStatus[];
    withActionsPart?: boolean;
  } = {}
): RunnerFixture {
  const dir = mkdtempSync(join(tmpdir(), 'cerebrum-action-runner-'));
  const opened = openCerebrumDb(join(dir, 'cerebrum.db'), { loadVec: false });
  const persistence = new ConversationPersistence({ db: opened.db });
  const store = new EgoActionStore({ db: opened.db });
  const batchId = 'batch-1';
  const conversationId = persistence.createConversation({ model: 'test-model' }).id;
  const statuses = TEST_ACTIONS.map((_, index) => options.statuses?.[index] ?? 'confirmed');
  const actionPart: EgoActionsPart = {
    type: 'actions',
    batchId,
    actions: TEST_ACTIONS.map((action, index) => ({
      actionId: action.id,
      tool: action.tool,
      summary: `Summary ${index + 1}`,
      status: statuses[index] ?? 'confirmed',
    })),
  };
  const message = persistence.appendMessage(conversationId, {
    role: 'assistant',
    content: 'I can make these changes.',
    parts: options.withActionsPart === false ? [{ type: 'text', text: 'No card.' }] : [actionPart],
  });
  store.createBatch({ id: batchId, conversationId, messageId: message.id, status: 'decided' });
  TEST_ACTIONS.forEach((action, index) => {
    const status = statuses[index] ?? 'confirmed';
    store.create({
      ...action,
      batchId,
      conversationId,
      messageId: message.id,
      toolUseId: `tool-use-${action.id}`,
      position: index,
      summary: `Summary ${index + 1}`,
      status,
      ...(status === 'rejected' ? { result: DECLINED_RESULT } : {}),
      ...(status === 'failed' ? { result: 'Seed failure' } : {}),
      ...(status === 'executed' ? { result: 'Seed result' } : {}),
    });
  });
  return {
    store,
    persistence,
    batchId,
    messageId: message.id,
    conversationId,
    readMessage: () =>
      persistence.getConversation(conversationId)?.messages.find(({ id }) => id === message.id),
    close: () => {
      opened.raw.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Fake gateway that records ordered calls and returns or throws scripted outcomes. */
export function fakeGateway(responses: Array<GatewayCallResult | Error> = []): {
  gateway: GatewayCaller;
  calls: Array<{ name: string; args: Record<string, unknown> }>;
} {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let index = 0;
  const gateway: GatewayCaller = {
    async listTools() {
      return [];
    },
    async callTool(name, args) {
      calls.push({ name, args });
      const response = responses[index++];
      if (response instanceof Error) throw response;
      return response ?? { text: `Result for ${name}`, isError: false };
    },
  };
  return { gateway, calls };
}

/** Drain an action-runner generator while preserving its return map. */
export async function collectRun(
  iterator: ReturnType<typeof executeConfirmedActions>
): Promise<{ events: ActionRunEvent[]; resolutions: ReadonlyMap<string, ActionResolution> }> {
  const events: ActionRunEvent[] = [];
  let next = await iterator.next();
  while (!next.done) {
    events.push(next.value);
    next = await iterator.next();
  }
  return { events, resolutions: next.value };
}
