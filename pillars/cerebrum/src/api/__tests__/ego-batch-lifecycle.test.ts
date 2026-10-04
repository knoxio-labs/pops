/** REST integration coverage for settling open Ego action batches on new turns. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
import { SUPERSEDED_RESULT } from '../modules/ego/batch-settle.js';
import { INTERRUPTED_RESULT } from '../modules/ego/loop-resume.js';
import { ConversationPersistence } from '../modules/ego/persistence.js';
import { makeCerebrumApiDeps, makeClient } from './test-utils.js';

import type { EgoActionsPart, EgoMessagePart } from '../../contract/rest-ego-parts.js';
import type { GatewayCaller } from '../modules/ego/gateway/gateway-client.js';
import type { EgoLlm, EgoToolUse } from '../modules/ego/llm.js';
import type { EgoTools } from '../modules/ego/toolbox.js';

let tmpDir: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-ego-batch-lifecycle-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

const WRITE_ONE = 'finance.transactions.addTags';
const WRITE_TWO = 'finance.transactions.removeTags';
const proposedWrites: EgoToolUse[] = [
  { id: 'write_1', name: WRITE_ONE, input: { id: 'tx_1', tag: 'coffee' } },
  { id: 'write_2', name: WRITE_TWO, input: { id: 'tx_2', tag: 'travel' } },
];

type Script = ReturnType<typeof scriptedLlm>;
type TestClient = ReturnType<typeof makeClient>;
type GatewayCall = { name: string; args: Record<string, unknown> };
type PendingBatch = {
  client: TestClient;
  script: Script;
  calls: GatewayCall[];
  batchId: string;
  conversationId: string;
  messageId: string;
  actionIds: string[];
};

function actionTools(): EgoTools['toolbox'] {
  return fakeToolbox(
    {
      [WRITE_ONE]: (args) => ({
        kind: 'write',
        tool: WRITE_ONE,
        args,
        summary: 'Add transaction tag',
      }),
      [WRITE_TWO]: (args) => ({
        kind: 'write',
        tool: WRITE_TWO,
        args,
        summary: 'Remove transaction tag',
      }),
    },
    { writes: [WRITE_ONE, WRITE_TWO] }
  ).toolbox;
}

function gateway(calls: GatewayCall[]): GatewayCaller {
  return {
    listTools: async () => [],
    callTool: async (name, args) => {
      calls.push({ name, args });
      return { text: `Ran ${name}`, isError: false };
    },
  };
}

function createClient(llm: EgoLlm, calls: GatewayCall[] = []): TestClient {
  const deps = makeCerebrumApiDeps(
    { cerebrumDb, tmpDir },
    { egoLlm: llm, egoTools: { toolbox: actionTools(), gateway: gateway(calls) } }
  );
  return makeClient(createCerebrumApiApp(deps));
}

async function createPendingBatch(script: Script): Promise<PendingBatch> {
  const calls: GatewayCall[] = [];
  const client = createClient(script.llm, calls);
  const response = await client.ego.stream({ message: 'Prepare transaction updates.' });
  const done = doneFrame(parseFrames(response.text));
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

async function decide(pending: PendingBatch, approve: string[], reject: string[]): Promise<void> {
  await pending.client.ego.decideActionBatch(pending.batchId, {
    approve,
    reject,
    alwaysAllow: [],
  });
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
  if (id === undefined) throw new Error('The action batch is missing an expected action.');
  return id;
}

function userText(script: Script, requestIndex: number): string {
  const message = script.requests[requestIndex]?.messages.at(-1);
  if (message?.role !== 'user' || typeof message.content !== 'string') {
    throw new Error('The model request did not end with a text user message.');
  }
  return message.content;
}

function assistantHistoryText(script: Script, requestIndex: number): string {
  const message = script.requests[requestIndex]?.messages
    .filter((candidate) => candidate.role === 'assistant')
    .at(-1);
  if (message?.role !== 'assistant' || typeof message.content !== 'string') {
    throw new Error('The model request did not include an assistant history message.');
  }
  return message.content;
}

function actionLine(tool: string, summary: string, result: string): string {
  return `[action ${tool} "${summary}": ${result}]`;
}

describe('Ego batch lifecycle on new message turns', () => {
  it('supersedes pending writes before streaming cards and before building model history', async () => {
    const script = scriptedLlm([
      { toolUses: proposedWrites },
      { text: 'I will follow the new request.' },
    ]);
    const pending = await createPendingBatch(script);
    const response = await pending.client.ego.stream({
      conversationId: pending.conversationId,
      message: 'Never mind.',
    });
    const frames = parseFrames(response.text);
    const updated = frames[0];
    const rows = egoActionsService.listActionsForBatch(cerebrumDb.db, pending.batchId);
    const conversation = await pending.client.ego.getConversation(pending.conversationId);
    const storedCard = conversation.messages.find((message) => message.id === pending.messageId);

    expect(frames.map((frame) => frame.type)).toEqual(['part', 'token', 'done']);
    expect(updated?.type).toBe('part');
    if (updated?.type !== 'part' || updated.part.type !== 'actions') {
      throw new Error('The superseded batch card was not the first stream frame.');
    }
    expect(updated.part.batchId).toBe(pending.batchId);
    expect(updated.part.actions.map((action) => action.status)).toEqual(['rejected', 'rejected']);
    expect(rows.map(({ status, result }) => [status, result])).toEqual(
      pending.actionIds.map(() => ['rejected', SUPERSEDED_RESULT])
    );
    expect(egoActionBatchesService.getBatch(cerebrumDb.db, pending.batchId)?.status).toBe(
      'continued'
    );
    expect(pending.calls).toEqual([]);
    expect(actionsPart(storedCard?.parts).actions.map((action) => action.status)).toEqual([
      'rejected',
      'rejected',
    ]);
    expect(userText(script, 1)).toBe(
      `${actionLine(WRITE_ONE, 'Add transaction tag', SUPERSEDED_RESULT)}\n` +
        `${actionLine(WRITE_TWO, 'Remove transaction tag', SUPERSEDED_RESULT)}\n\nNever mind.`
    );
    expect(assistantHistoryText(script, 1)).toContain(
      actionLine(WRITE_ONE, 'Add transaction tag', 'rejected')
    );
    expect(assistantHistoryText(script, 1)).not.toContain(': pending]');
    await expect(
      pending.client.ego.decideActionBatch(pending.batchId, {
        approve: pending.actionIds,
        reject: [],
        alwaysAllow: [],
      })
    ).rejects.toMatchObject({ status: 409 });

    const resumed = await pending.client.ego.stream({
      conversationId: pending.conversationId,
      resumeBatchId: pending.batchId,
    });
    expect(errorFrame(parseFrames(resumed.text)).code).toBe('cerebrum.ego.batch_not_resumable');
    expect(script.requests).toHaveLength(2);
  });

  it('settles a decided batch whose approved actions were never resumed', async () => {
    const script = scriptedLlm([
      { toolUses: proposedWrites },
      { text: 'The follow-up is handled.' },
    ]);
    const pending = await createPendingBatch(script);
    await decide(pending, [actionId(pending, 0)], [actionId(pending, 1)]);

    const response = await pending.client.ego.stream({
      conversationId: pending.conversationId,
      message: 'What happened to those changes?',
    });
    const frames = parseFrames(response.text);
    const first = frames[0];
    const rows = egoActionsService.listActionsForBatch(cerebrumDb.db, pending.batchId);

    expect(first?.type).toBe('part');
    if (first?.type !== 'part' || first.part.type !== 'actions') {
      throw new Error('The interrupted batch card was not the first stream frame.');
    }
    expect(first.part.actions.map((action) => action.status)).toEqual(['failed', 'rejected']);
    expect(rows.map(({ status, result }) => [status, result])).toEqual([
      ['failed', INTERRUPTED_RESULT],
      ['rejected', 'The user declined this action.'],
    ]);
    expect(egoActionBatchesService.getBatch(cerebrumDb.db, pending.batchId)?.status).toBe(
      'continued'
    );
    expect(pending.calls).toEqual([]);
    expect(userText(script, 1)).toBe(
      `${actionLine(WRITE_ONE, 'Add transaction tag', INTERRUPTED_RESULT)}\n` +
        `${actionLine(WRITE_TWO, 'Remove transaction tag', 'The user declined this action.')}\n\n` +
        'What happened to those changes?'
    );
  });

  it('settles confirmed actions from a continued batch once, then leaves later turns unprefixed', async () => {
    const script = scriptedLlm([
      { toolUses: proposedWrites },
      { text: 'The interrupted write is recorded.' },
      { text: 'A later turn.' },
    ]);
    const pending = await createPendingBatch(script);
    await decide(pending, [actionId(pending, 0)], [actionId(pending, 1)]);
    const store = new EgoActionStore({ db: cerebrumDb.db });
    expect(store.transitionBatch(pending.batchId, 'decided', 'continued')).toBe(true);

    const interrupted = await pending.client.ego.stream({
      conversationId: pending.conversationId,
      message: 'Continue after the restart.',
    });
    const interruptedFrames = parseFrames(interrupted.text);
    const first = interruptedFrames[0];
    if (first?.type !== 'part' || first.part.type !== 'actions') {
      throw new Error('The interrupted batch card was not the first stream frame.');
    }
    expect(first.part.actions.map((action) => action.status)).toEqual(['failed', 'rejected']);
    expect(egoActionBatchesService.getBatch(cerebrumDb.db, pending.batchId)?.status).toBe(
      'continued'
    );
    expect(
      egoActionsService
        .listActionsForBatch(cerebrumDb.db, pending.batchId)
        .map(({ status, result }) => [status, result])
    ).toEqual([
      ['failed', INTERRUPTED_RESULT],
      ['rejected', 'The user declined this action.'],
    ]);
    expect(pending.calls).toEqual([]);
    expect(userText(script, 1)).toContain(INTERRUPTED_RESULT);

    const later = await pending.client.ego.stream({
      conversationId: pending.conversationId,
      message: 'Do something else.',
    });
    const laterFrames = parseFrames(later.text);
    expect(laterFrames.some((frame) => frame.type === 'part')).toBe(false);
    expect(userText(script, 2)).toBe('Do something else.');
    expect(userText(script, 2)).not.toContain('[action ');
  });

  it('settles open batches before non-stream chat and keeps batch parts current in history', async () => {
    const script = scriptedLlm([
      { toolUses: proposedWrites },
      { text: 'The new chat request is handled.' },
    ]);
    const pending = await createPendingBatch(script);

    await pending.client.ego.chat({
      conversationId: pending.conversationId,
      message: 'Explain the new status.',
    });
    const rows = egoActionsService.listActionsForBatch(cerebrumDb.db, pending.batchId);
    const conversation = await pending.client.ego.getConversation(pending.conversationId);
    const storedCard = conversation.messages.find((message) => message.id === pending.messageId);

    expect(rows.map(({ status }) => status)).toEqual(['rejected', 'rejected']);
    expect(actionsPart(storedCard?.parts).actions.map((action) => action.status)).toEqual([
      'rejected',
      'rejected',
    ]);
    expect(userText(script, 1)).toBe(
      `${actionLine(WRITE_ONE, 'Add transaction tag', SUPERSEDED_RESULT)}\n` +
        `${actionLine(WRITE_TWO, 'Remove transaction tag', SUPERSEDED_RESULT)}\n\n` +
        'Explain the new status.'
    );
    expect(assistantHistoryText(script, 1)).not.toContain(': pending]');
    expect(pending.calls).toEqual([]);
  });

  it('keeps an existing conversation with no batch free of settlement frames or prompt prefixes', async () => {
    const script = scriptedLlm([{ text: 'A plain answer.' }]);
    const client = createClient(script.llm);
    const persistence = new ConversationPersistence({ db: cerebrumDb.db });
    const conversation = persistence.createConversation({
      title: 'No open actions',
      model: 'scripted-model',
    });

    const response = await client.ego.stream({
      conversationId: conversation.id,
      message: 'Just answer plainly.',
    });
    const frames = parseFrames(response.text);

    expect(frames.map((frame) => frame.type)).toEqual(['token', 'done']);
    expect(userText(script, 0)).toBe('Just answer plainly.');
    expect(
      egoActionBatchesService.listBatchesForConversation(cerebrumDb.db, conversation.id)
    ).toEqual([]);
  });

  it('ends with one error frame and does not persist a turn when settlement fails', async () => {
    const script = scriptedLlm([{ text: 'This must not reach the model.' }]);
    const client = createClient(script.llm);
    const persistence = new ConversationPersistence({ db: cerebrumDb.db });
    const conversation = persistence.createConversation({
      title: 'Settlement failure',
      model: 'scripted-model',
    });
    const databasePath = join(tmpDir, 'cerebrum.db');

    cerebrumDb.raw.close();
    cerebrumDb = openCerebrumDb(databasePath, { loadVec: false });

    const response = await client.ego.stream({
      conversationId: conversation.id,
      message: 'Do not persist this turn.',
    });
    const frames = parseFrames(response.text);

    expect(frames.map((frame) => frame.type)).toEqual(['error']);
    expect(errorFrame(frames).conversationId).toBeUndefined();
    expect(script.requests).toHaveLength(0);
    expect(
      new ConversationPersistence({ db: cerebrumDb.db }).getConversation(conversation.id)?.messages
    ).toEqual([]);
  });
});
