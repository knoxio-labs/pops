/** REST integration coverage for resuming paused Ego turns through the stream route. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PopsError } from '@pops/pillar-express';

import { egoStreamFrameSchema, type EgoStreamFrame } from '../../contract/rest-ego-stream.js';
import {
  egoActionBatchesService,
  egoActionsService,
  openCerebrumDb,
  type OpenedCerebrumDb,
} from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import { fakeToolbox, scriptedLlm } from '../modules/ego/__tests__/fakes.js';
import { EgoActionStore } from '../modules/ego/actions-store.js';
import { DECLINED_RESULT, INTERRUPTED_RESULT } from '../modules/ego/loop-resume.js';
import { parsePausedLoopState } from '../modules/ego/loop-state.js';
import { ConversationPersistence } from '../modules/ego/persistence.js';
import { createTestTransport } from './test-http.js';
import { makeCerebrumApiDeps, makeClient } from './test-utils.js';

import type { EgoActionsPart, EgoMessagePart } from '../../contract/rest-ego-parts.js';
import type { GatewayCaller } from '../modules/ego/gateway/gateway-client.js';
import type { EgoLlm, EgoToolUse } from '../modules/ego/llm.js';
import type { EgoTools } from '../modules/ego/toolbox.js';

let tmpDir: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-ego-stream-resume-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

const WRITE_ONE = 'finance.transactions.create';
const WRITE_TWO = 'inventory.items.create';
const ACTION_TOOLS = [WRITE_ONE, WRITE_TWO] as const;
const proposedWrites: EgoToolUse[] = [
  { id: 'write_1', name: WRITE_ONE, input: { amount: 12 } },
  { id: 'write_2', name: WRITE_TWO, input: { name: 'Desk lamp' } },
];
const { requestOn } = createTestTransport();

type Script = ReturnType<typeof scriptedLlm>;
type TestClient = ReturnType<typeof makeClient>;
type GatewayCall = { name: string; args: Record<string, unknown> };
type GatewayHandler = (
  name: string,
  args: Record<string, unknown>
) => Promise<{ text: string; isError: boolean }>;
type PendingBatch = {
  client: TestClient;
  script: Script;
  calls: GatewayCall[];
  batchId: string;
  conversationId: string;
  messageId: string;
  actionIds: string[];
};

function createActionToolbox(): EgoTools['toolbox'] {
  return fakeToolbox(
    {
      [WRITE_ONE]: (args) => ({
        kind: 'write',
        tool: WRITE_ONE,
        args,
        summary: 'Create transaction',
      }),
      [WRITE_TWO]: (args) => ({
        kind: 'write',
        tool: WRITE_TWO,
        args,
        summary: 'Create inventory item',
      }),
    },
    { writes: ACTION_TOOLS }
  ).toolbox;
}

function createGateway(calls: GatewayCall[], handler?: GatewayHandler): GatewayCaller {
  return {
    listTools: async () => [],
    callTool: async (name, args) => {
      calls.push({ name, args });
      return handler ? handler(name, args) : { text: 'Executed ' + name, isError: false };
    },
  };
}

function createClient(llm: EgoLlm, egoTools?: EgoTools): TestClient {
  const deps = makeCerebrumApiDeps(
    { cerebrumDb, tmpDir },
    {
      egoLlm: llm,
      ...(egoTools === undefined ? {} : { egoTools }),
    }
  );
  return makeClient(createCerebrumApiApp(deps));
}

async function createPendingBatch(
  script: Script,
  options: { llm?: EgoLlm; gatewayHandler?: GatewayHandler } = {}
): Promise<PendingBatch> {
  const calls: GatewayCall[] = [];
  const client = createClient(options.llm ?? script.llm, {
    toolbox: createActionToolbox(),
    gateway: createGateway(calls, options.gatewayHandler),
  });
  const response = await client.ego.stream({ message: 'Create two records.' });
  const frames = parseFrames(response.text);
  const done = doneFrame(frames);
  const part = actionsPart(done.parts);

  return {
    client,
    script,
    calls,
    batchId: part.batchId,
    conversationId: done.conversationId,
    messageId: done.messageId,
    actionIds: part.actions.map((action) => action.actionId),
  };
}

async function decide(
  pending: PendingBatch,
  approve: string[],
  reject: string[],
  alwaysAllow: string[] = []
): Promise<void> {
  await pending.client.ego.decideActionBatch(pending.batchId, { approve, reject, alwaysAllow });
}

function parseFrames(raw: string): EgoStreamFrame[] {
  return raw
    .split('\n\n')
    .map((block) => block.replace(/^data: /, '').trim())
    .filter((line) => line.length > 0)
    .map((line) => egoStreamFrameSchema.parse(JSON.parse(line)));
}

function doneFrame(frames: EgoStreamFrame[]): Extract<EgoStreamFrame, { type: 'done' }> {
  const frame = frames.find((event) => event.type === 'done');
  if (frame?.type !== 'done') throw new Error('Ego stream did not emit a done frame.');
  return frame;
}

function errorFrame(frames: EgoStreamFrame[]): Extract<EgoStreamFrame, { type: 'error' }> {
  const frame = frames.find((event) => event.type === 'error');
  if (frame?.type !== 'error') throw new Error('Ego stream did not emit an error frame.');
  return frame;
}

function actionsPart(parts: readonly EgoMessagePart[] | null | undefined): EgoActionsPart {
  const part = parts?.find((candidate) => candidate.type === 'actions');
  if (part?.type !== 'actions') throw new Error('Ego stream did not emit an actions part.');
  return part;
}

function actionId(pending: PendingBatch, index: number): string {
  const id = pending.actionIds[index];
  if (id === undefined) throw new Error('The batch is missing an expected action.');
  return id;
}

function pausedState(batchId: string) {
  const batch = egoActionBatchesService.getBatch(cerebrumDb.db, batchId);
  if (batch === null) throw new Error('The batch was not persisted.');
  const state = parsePausedLoopState(batch.loopState);
  if (state === null) throw new Error('The paused loop state was not persisted.');
  return state;
}

async function resume(pending: PendingBatch, client: TestClient = pending.client) {
  return client.ego.stream({
    conversationId: pending.conversationId,
    resumeBatchId: pending.batchId,
  });
}

function failingAfterFirstCall(inner: EgoLlm): EgoLlm {
  let calls = 0;
  return {
    model: () => inner.model(),
    async *stream(request) {
      calls += 1;
      if (calls === 1) {
        yield* inner.stream(request);
        return;
      }
      throw new PopsError({
        code: 'cerebrum.internal.failure',
        status: 503,
        message: 'The continuation failed.',
        retryable: true,
      });
    },
  };
}

describe('Ego stream resume route', () => {
  it('runs approved writes before resuming the saved model turn without adding a user message', async () => {
    const script = scriptedLlm([
      { toolUses: proposedWrites },
      { text: 'The continuation is complete.' },
    ]);
    const pending = await createPendingBatch(script);
    await decide(pending, [actionId(pending, 0)], [actionId(pending, 1)]);

    expect(pending.calls).toEqual([]);
    const state = pausedState(pending.batchId);
    const response = await resume(pending);
    const frames = parseFrames(response.text);
    const done = doneFrame(frames);

    expect(frames.map((frame) => frame.type)).toEqual(['tool', 'tool', 'part', 'token', 'done']);
    expect(frames.slice(0, 2)).toEqual([
      { type: 'tool', name: WRITE_ONE, status: 'started' },
      { type: 'tool', name: WRITE_ONE, status: 'finished' },
    ]);
    const updated = frames[2];
    if (updated?.type !== 'part' || updated.part.type !== 'actions') {
      throw new Error('The resume stream did not update the original actions part.');
    }
    expect(updated.part.batchId).toBe(pending.batchId);
    expect(updated.part.actions.map((action) => action.status)).toEqual(['executed', 'rejected']);
    expect(done.parts).toEqual([{ type: 'text', text: 'The continuation is complete.' }]);
    expect(done.conversationId).toBe(pending.conversationId);

    const conversation = await pending.client.ego.getConversation(pending.conversationId);
    expect(conversation.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'assistant',
    ]);
    expect(
      actionsPart(conversation.messages[1]?.parts).actions.map((action) => action.status)
    ).toEqual(['executed', 'rejected']);
    expect(conversation.messages[2]).toMatchObject({
      id: done.messageId,
      role: 'assistant',
      content: 'The continuation is complete.',
    });
    expect(egoActionBatchesService.getBatch(cerebrumDb.db, pending.batchId)?.status).toBe(
      'continued'
    );
    expect(
      egoActionsService
        .listActionsForBatch(cerebrumDb.db, pending.batchId)
        .map((action) => action.status)
    ).toEqual(['executed', 'rejected']);
    expect(pending.calls).toEqual([{ name: WRITE_ONE, args: { amount: 12 } }]);

    const request = script.requests[1];
    if (request === undefined) throw new Error('The continuation did not call the model.');
    expect(request.system).toBe(state.system);
    expect(request.messages.slice(0, state.messages.length)).toEqual(state.messages);
    expect(request.messages.at(-1)).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'write_1',
          content: 'Executed ' + WRITE_ONE,
          is_error: false,
        },
        {
          type: 'tool_result',
          tool_use_id: 'write_2',
          content: DECLINED_RESULT,
          is_error: false,
        },
      ],
    });
  });

  it('rejects missing, foreign, and still-pending batches without persisting a turn', async () => {
    const script = scriptedLlm([{ toolUses: proposedWrites }, { text: 'Should not run.' }]);
    const pending = await createPendingBatch(script);
    const foreign = await pending.client.ego.createConversation({ model: 'scripted-model' });
    const before = await pending.client.ego.getConversation(pending.conversationId);

    const missingConversation = parseFrames(
      (
        await pending.client.ego.stream({
          conversationId: 'conversation_missing',
          resumeBatchId: pending.batchId,
        })
      ).text
    );
    const missingBatch = parseFrames(
      (
        await pending.client.ego.stream({
          conversationId: pending.conversationId,
          resumeBatchId: 'bat_missing',
        })
      ).text
    );
    const foreignBatch = parseFrames(
      (
        await pending.client.ego.stream({
          conversationId: foreign.conversation.id,
          resumeBatchId: pending.batchId,
        })
      ).text
    );
    const stillPending = parseFrames((await resume(pending)).text);

    for (const frames of [missingConversation, missingBatch, foreignBatch, stillPending]) {
      expect(errorFrame(frames)).toMatchObject({
        code: 'cerebrum.ego.batch_not_resumable',
        retryable: false,
      });
    }
    expect(
      (await pending.client.ego.getConversation(pending.conversationId)).messages
    ).toHaveLength(before.messages.length);
    expect(script.requests).toHaveLength(1);
    expect(pending.calls).toEqual([]);
    expect(egoActionBatchesService.getBatch(cerebrumDb.db, pending.batchId)?.status).toBe(
      'pending'
    );
  });

  it('does not claim a decided batch whose saved loop state is corrupt', async () => {
    const script = scriptedLlm([{ toolUses: proposedWrites }, { text: 'Should not run.' }]);
    const pending = await createPendingBatch(script);
    await decide(pending, [actionId(pending, 0)], [actionId(pending, 1)]);
    cerebrumDb.raw
      .prepare('UPDATE ego_action_batches SET loop_state = ? WHERE id = ?')
      .run('{broken json', pending.batchId);

    const frames = parseFrames((await resume(pending)).text);

    expect(errorFrame(frames)).toMatchObject({
      code: 'cerebrum.ego.batch_state_invalid',
      retryable: false,
      conversationId: pending.conversationId,
    });
    expect(egoActionBatchesService.getBatch(cerebrumDb.db, pending.batchId)?.status).toBe(
      'decided'
    );
    expect(
      egoActionsService
        .listActionsForBatch(cerebrumDb.db, pending.batchId)
        .map((action) => action.status)
    ).toEqual(['confirmed', 'rejected']);
    expect(pending.calls).toEqual([]);
    expect(script.requests).toHaveLength(1);
  });

  it('allows only one concurrent resume of a decided batch', async () => {
    const script = scriptedLlm([
      { toolUses: proposedWrites },
      { text: 'Only one continuation runs.' },
    ]);
    const pending = await createPendingBatch(script);
    await decide(pending, pending.actionIds, []);

    const responses = await Promise.all([resume(pending), resume(pending)]);
    const frames = responses.map((response) => parseFrames(response.text));
    const completed = frames.filter((items) => items.some((frame) => frame.type === 'done'));
    const rejected = frames.filter((items) => items.some((frame) => frame.type === 'error'));

    expect(completed).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(errorFrame(rejected[0] ?? [])).toMatchObject({
      code: 'cerebrum.ego.batch_not_resumable',
      retryable: false,
    });
    expect(script.requests).toHaveLength(2);
    expect(pending.calls.map((call) => call.name)).toEqual([WRITE_ONE, WRITE_TWO]);
    expect(
      egoActionsService
        .listActionsForBatch(cerebrumDb.db, pending.batchId)
        .map((action) => action.status)
    ).toEqual(['executed', 'executed']);
  });

  it('fails confirmed writes from an interrupted continued batch instead of running them again', async () => {
    const script = scriptedLlm([
      { toolUses: proposedWrites },
      { text: 'The interrupted writes were not retried.' },
    ]);
    const pending = await createPendingBatch(script);
    await decide(pending, pending.actionIds, []);
    const store = new EgoActionStore({ db: cerebrumDb.db });
    expect(store.transitionBatch(pending.batchId, 'decided', 'continued')).toBe(true);

    const frames = parseFrames((await resume(pending)).text);
    const updated = frames.find((frame) => frame.type === 'part');
    const resultsMessage = script.requests[1]?.messages.at(-1);
    const actions = egoActionsService.listActionsForBatch(cerebrumDb.db, pending.batchId);

    expect(updated?.type).toBe('part');
    if (updated?.type !== 'part' || updated.part.type !== 'actions') {
      throw new Error('The resume stream did not report interrupted action statuses.');
    }
    expect(updated.part.actions.map((action) => action.status)).toEqual(['failed', 'failed']);
    expect(actions.map((action) => [action.status, action.result])).toEqual([
      ['failed', INTERRUPTED_RESULT],
      ['failed', INTERRUPTED_RESULT],
    ]);
    expect(pending.calls).toEqual([]);
    expect(resultsMessage).toEqual({
      role: 'user',
      content: proposedWrites.map((tool) => ({
        type: 'tool_result',
        tool_use_id: tool.id,
        content: INTERRUPTED_RESULT,
        is_error: true,
      })),
    });
    expect(egoActionBatchesService.getBatch(cerebrumDb.db, pending.batchId)?.status).toBe(
      'continued'
    );
    expect(errorFrame(parseFrames((await resume(pending)).text)).code).toBe(
      'cerebrum.ego.batch_not_resumable'
    );
    expect(script.requests).toHaveLength(2);
  });

  it('settles an older decided batch without adding its results to the resumed model history', async () => {
    const script = scriptedLlm([
      { toolUses: proposedWrites },
      { text: 'The newer batch resumed.' },
    ]);
    const pending = await createPendingBatch(script);
    await decide(pending, pending.actionIds, []);

    const store = new EgoActionStore({ db: cerebrumDb.db });
    const oldBatchId = 'bat_older_resume';
    const oldActionId = 'act_older_resume';
    store.createBatch({
      id: oldBatchId,
      conversationId: pending.conversationId,
      messageId: pending.messageId,
      status: 'decided',
      loopState: {},
    });
    store.create({
      id: oldActionId,
      batchId: oldBatchId,
      conversationId: pending.conversationId,
      messageId: pending.messageId,
      toolUseId: 'older_tool_use',
      position: 0,
      tool: WRITE_TWO,
      summary: 'Older write',
      args: { name: 'Old item' },
      status: 'confirmed',
    });
    cerebrumDb.raw
      .prepare('UPDATE ego_action_batches SET created_at = ? WHERE id = ?')
      .run('2000-01-01T00:00:00.000Z', oldBatchId);

    const persistence = new ConversationPersistence({ db: cerebrumDb.db });
    const saved = persistence.getConversation(pending.conversationId);
    const originalMessage = saved?.messages.find((message) => message.id === pending.messageId);
    if (originalMessage?.parts === null || originalMessage?.parts === undefined) {
      throw new Error('The original action card was not persisted.');
    }
    const olderPart: EgoActionsPart = {
      type: 'actions',
      batchId: oldBatchId,
      actions: [
        { actionId: oldActionId, tool: WRITE_TWO, summary: 'Older write', status: 'confirmed' },
      ],
    };
    expect(
      persistence.updateMessageParts(pending.messageId, [...originalMessage.parts, olderPart])
    ).toBe(true);

    await resume(pending);

    const oldAction = egoActionsService.getAction(cerebrumDb.db, oldActionId);
    expect(oldAction).toMatchObject({ status: 'failed', result: INTERRUPTED_RESULT });
    expect(egoActionBatchesService.getBatch(cerebrumDb.db, oldBatchId)?.status).toBe('continued');
    const request = script.requests[1];
    if (request === undefined) throw new Error('The resumed model request was not recorded.');
    const results = request.messages.at(-1);
    expect(results).toMatchObject({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'write_1' },
        { type: 'tool_result', tool_use_id: 'write_2' },
      ],
    });
    expect(JSON.stringify(results)).not.toContain('older_tool_use');
    const conversation = await pending.client.ego.getConversation(pending.conversationId);
    const messageParts = conversation.messages[1]?.parts;
    if (messageParts == null) throw new Error('The resumed assistant parts were not saved.');
    expect(actionsPart(messageParts).actions.map((action) => action.status)).toEqual([
      'executed',
      'executed',
    ]);
    expect(
      actionsPart(messageParts.filter((part) => part.type === 'actions').slice(1)).actions[0]
        ?.status
    ).toBe('failed');
  });

  it('records gateway failures and continues running later approved writes', async () => {
    const script = scriptedLlm([
      { toolUses: proposedWrites },
      { text: 'The writes were attempted.' },
    ]);
    const pending = await createPendingBatch(script, {
      gatewayHandler: async (name) =>
        name === WRITE_ONE
          ? { text: 'Transaction service failed.', isError: true }
          : { text: 'Created inventory item.', isError: false },
    });
    await decide(pending, pending.actionIds, []);

    const frames = parseFrames((await resume(pending)).text);

    expect(frames.map((frame) => frame.type)).toEqual([
      'tool',
      'tool',
      'part',
      'tool',
      'tool',
      'part',
      'token',
      'done',
    ]);
    expect(pending.calls.map((call) => call.name)).toEqual([WRITE_ONE, WRITE_TWO]);
    expect(pending.calls.map((call) => call.args)).toEqual([{ amount: 12 }, { name: 'Desk lamp' }]);
    expect(
      egoActionsService
        .listActionsForBatch(cerebrumDb.db, pending.batchId)
        .map((action) => [action.status, action.result])
    ).toEqual([
      ['failed', 'Transaction service failed.'],
      ['executed', 'Created inventory item.'],
    ]);
    expect(script.requests[1]?.messages.at(-1)).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'write_1',
          content: 'Transaction service failed.',
          is_error: true,
        },
        {
          type: 'tool_result',
          tool_use_id: 'write_2',
          content: 'Created inventory item.',
          is_error: false,
        },
      ],
    });
  });

  it('resumes a reject-only batch without an Ego tool gateway', async () => {
    const script = scriptedLlm([{ toolUses: proposedWrites }, { text: 'No writes were run.' }]);
    const pending = await createPendingBatch(script);
    const clientWithoutTools = createClient(script.llm);
    await clientWithoutTools.ego.decideActionBatch(pending.batchId, {
      approve: [],
      reject: pending.actionIds,
      alwaysAllow: [],
    });

    const frames = parseFrames((await resume(pending, clientWithoutTools)).text);

    expect(doneFrame(frames).parts).toEqual([{ type: 'text', text: 'No writes were run.' }]);
    expect(pending.calls).toEqual([]);
    expect(script.requests[1]?.messages.at(-1)).toEqual({
      role: 'user',
      content: proposedWrites.map((tool) => ({
        type: 'tool_result',
        tool_use_id: tool.id,
        content: DECLINED_RESULT,
        is_error: false,
      })),
    });
  });

  it('returns a new pending batch when the continuation proposes another write', async () => {
    const continuation: EgoToolUse = {
      id: 'write_again',
      name: WRITE_ONE,
      input: { amount: 24 },
    };
    const script = scriptedLlm([{ toolUses: proposedWrites }, { toolUses: [continuation] }]);
    const pending = await createPendingBatch(script);
    await decide(pending, [actionId(pending, 0)], [actionId(pending, 1)]);

    const frames = parseFrames((await resume(pending)).text);
    const next = actionsPart(doneFrame(frames).parts);
    const batch = egoActionBatchesService.getBatch(cerebrumDb.db, next.batchId);

    expect(next.batchId).not.toBe(pending.batchId);
    expect(next.actions).toMatchObject([{ tool: WRITE_ONE, status: 'pending' }]);
    expect(batch).toMatchObject({ status: 'pending', conversationId: pending.conversationId });
  });

  it('runs a continuation write inside the stream when the decision always allows its tool', async () => {
    const continuation: EgoToolUse = {
      id: 'write_again',
      name: WRITE_ONE,
      input: { amount: 24 },
    };
    const script = scriptedLlm([
      { toolUses: proposedWrites },
      { toolUses: [continuation] },
      { text: 'Allowed write completed.' },
    ]);
    const pending = await createPendingBatch(script);
    await decide(pending, [actionId(pending, 0)], [actionId(pending, 1)], [WRITE_ONE]);

    expect(pending.calls).toEqual([]);
    const frames = parseFrames((await resume(pending)).text);
    const autoExecutedPart = actionsPart(doneFrame(frames).parts);
    const autoExecutedBatch = egoActionBatchesService.getBatch(
      cerebrumDb.db,
      autoExecutedPart.batchId
    );

    expect(autoExecutedPart.batchId).not.toBe(pending.batchId);
    expect(autoExecutedPart.actions).toMatchObject([{ tool: WRITE_ONE, status: 'executed' }]);
    expect(frames.some((frame) => frame.type === 'part' && frame.part.type === 'actions')).toBe(
      true
    );
    expect(pending.calls.map((call) => call.name)).toEqual([WRITE_ONE, WRITE_ONE]);
    expect(autoExecutedBatch).toMatchObject({
      status: 'auto',
      conversationId: pending.conversationId,
    });
    expect(egoActionBatchesService.getBatch(cerebrumDb.db, pending.batchId)?.status).toBe(
      'continued'
    );
    expect(
      egoActionBatchesService.listBatchesForConversation(cerebrumDb.db, pending.conversationId)
    ).toHaveLength(2);
    expect(script.requests).toHaveLength(3);
  });

  it('marks failures after streaming starts as non-retryable and persists a placeholder assistant turn', async () => {
    const script = scriptedLlm([{ toolUses: proposedWrites }, { text: 'Unused.' }]);
    const pending = await createPendingBatch(script, {
      llm: failingAfterFirstCall(script.llm),
    });
    await decide(pending, [actionId(pending, 0)], [actionId(pending, 1)]);

    const frames = parseFrames((await resume(pending)).text);
    const failure = errorFrame(frames);

    expect(frames[0]).toMatchObject({ type: 'tool', name: WRITE_ONE, status: 'started' });
    expect(failure).toMatchObject({
      code: 'cerebrum.internal.failure',
      retryable: false,
      conversationId: pending.conversationId,
    });
    expect(egoActionBatchesService.getBatch(cerebrumDb.db, pending.batchId)?.status).toBe(
      'continued'
    );
    const conversation = await pending.client.ego.getConversation(pending.conversationId);
    expect(conversation.messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: '⚠️ Pipeline error: The continuation failed.',
    });
    expect(conversation.messages.filter((message) => message.role === 'user')).toHaveLength(1);
  });

  it('rejects resume when the supplied service-account key lacks the stream scope', async () => {
    const script = scriptedLlm([{ toolUses: proposedWrites }, { text: 'Should not run.' }]);
    const pending = await createPendingBatch(script);
    await decide(pending, [], pending.actionIds);
    const app = createCerebrumApiApp(
      makeCerebrumApiDeps(
        { cerebrumDb, tmpDir },
        {
          egoLlm: script.llm,
          serviceAccountVerifier: async () => ({
            outcome: 'authenticated',
            principal: {
              id: 'sa_test',
              name: 'test',
              scopes: ['cerebrum.templates'],
            },
          }),
        }
      )
    );

    const response = await requestOn(app)
      .post('/ego/chat/stream')
      .set('x-api-key', 'test-service-account-key')
      .send({ conversationId: pending.conversationId, resumeBatchId: pending.batchId });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'cerebrum.auth.forbidden' });
    expect(script.requests).toHaveLength(1);
    expect(egoActionBatchesService.getBatch(cerebrumDb.db, pending.batchId)?.status).toBe(
      'decided'
    );
  });
});
