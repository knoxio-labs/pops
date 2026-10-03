/** REST coverage for every event emitted by the Ego chat stream. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { egoStreamFrameSchema, type EgoStreamFrame } from '../../contract/rest-ego-stream.js';
import { openCerebrumDb, type OpenedCerebrumDb } from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import { fakeToolbox, scriptedLlm } from '../modules/ego/__tests__/fakes.js';
import { makeCerebrumApiDeps, makeClient } from './test-utils.js';

import type { EgoEntityPart } from '../../contract/rest-ego-parts.js';
import type { GatewayCaller } from '../modules/ego/gateway/gateway-client.js';
import type { EgoLlm, EgoToolUse } from '../modules/ego/llm.js';
import type { EgoToolbox } from '../modules/ego/toolbox.js';

let tmpDir: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-ego-stream-frames-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client(llm: EgoLlm, toolbox?: EgoToolbox) {
  const gateway: GatewayCaller = {
    listTools: async () => [],
    callTool: async () => ({ text: 'Unexpected gateway call', isError: false }),
  };
  const deps = makeCerebrumApiDeps(
    { cerebrumDb, tmpDir },
    {
      egoLlm: llm,
      ...(toolbox === undefined ? {} : { egoTools: { toolbox, gateway } }),
    }
  );
  return makeClient(createCerebrumApiApp(deps));
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

const readTool = 'finance.transactions.list';
const writeTools = ['finance.transactions.addTags', 'finance.transactions.removeTags'] as const;

describe('Ego SSE frames', () => {
  it('forwards read tool, entity, navigate, token, and done frames in order', async () => {
    const entity: EgoEntityPart = {
      type: 'entity',
      uri: 'pops:finance/transaction/tx_1',
      title: 'Coffee',
    };
    const read: EgoToolUse = { id: 'read-1', name: readTool, input: { limit: 1 } };
    const { llm } = scriptedLlm([
      { toolUses: [read] },
      { text: 'The coffee transaction was found.' },
    ]);
    const { toolbox } = fakeToolbox({
      [readTool]: () => ({
        kind: 'result',
        text: 'Coffee transaction',
        isError: false,
        parts: [entity],
        navigate: entity.uri,
      }),
    });

    const response = await client(llm, toolbox).ego.stream({ message: 'Find the transaction.' });
    const frames = parseFrames(response.text);

    expect(frames.map((frame) => frame.type)).toEqual([
      'tool',
      'tool',
      'part',
      'navigate',
      'token',
      'done',
    ]);
    expect(frames.slice(0, 4)).toEqual([
      { type: 'tool', name: readTool, status: 'started' },
      { type: 'tool', name: readTool, status: 'finished' },
      { type: 'part', part: entity },
      { type: 'navigate', uri: entity.uri },
    ]);
    expect(doneFrame(frames).parts).toEqual([
      { type: 'text', text: 'The coffee transaction was found.' },
      entity,
    ]);
  });

  it('ends a proposed write turn with one pending actions part and no tool frames', async () => {
    const toolUses: EgoToolUse[] = writeTools.map((name, index) => ({
      id: `write-${index + 1}`,
      name,
      input: { transactionId: `tx_${index + 1}` },
    }));
    const { llm } = scriptedLlm([{ toolUses }]);
    const { toolbox } = fakeToolbox(
      {
        [writeTools[0]]: (args) => ({
          kind: 'write',
          tool: writeTools[0],
          args,
          summary: 'Add transaction tags',
        }),
        [writeTools[1]]: (args) => ({
          kind: 'write',
          tool: writeTools[1],
          args,
          summary: 'Remove transaction tags',
        }),
      },
      { writes: writeTools }
    );

    const response = await client(llm, toolbox).ego.stream({ message: 'Tag these transactions.' });
    const frames = parseFrames(response.text);
    const tail = frames.slice(-2);

    expect(tail.map((frame) => frame.type)).toEqual(['part', 'done']);
    expect(frames.filter((frame) => frame.type === 'tool')).toEqual([]);
    const proposed = tail[0];
    expect(proposed?.type).toBe('part');
    if (proposed?.type !== 'part' || proposed.part.type !== 'actions') {
      throw new Error('Ego stream did not emit a pending actions part.');
    }
    expect(proposed.part.actions).toMatchObject([
      { tool: writeTools[0], status: 'pending' },
      { tool: writeTools[1], status: 'pending' },
    ]);
  });

  it('marks a failed read tool with started and failed tool frames', async () => {
    const { llm } = scriptedLlm([
      { toolUses: [{ id: 'failure-1', name: readTool, input: {} }] },
      { text: 'The lookup failed.' },
    ]);
    const { toolbox } = fakeToolbox({
      [readTool]: () => ({ kind: 'result', text: 'Gateway rejected the lookup.', isError: true }),
    });

    const response = await client(llm, toolbox).ego.stream({ message: 'Look this up.' });
    const frames = parseFrames(response.text);

    expect(frames.filter((frame) => frame.type === 'tool')).toEqual([
      { type: 'tool', name: readTool, status: 'started' },
      { type: 'tool', name: readTool, status: 'failed' },
    ]);
  });

  it('streams a plain text part when no tools are configured', async () => {
    const { llm } = scriptedLlm([{ text: 'Plain answer.' }]);

    const response = await client(llm).ego.stream({ message: 'Say hello.' });
    const frames = parseFrames(response.text);

    expect(frames.map((frame) => frame.type)).toEqual(['token', 'done']);
    expect(doneFrame(frames).parts).toEqual([{ type: 'text', text: 'Plain answer.' }]);
  });

  it('ends with a conversation-linked error if the model fails after the user turn is stored', async () => {
    const failingLlm: EgoLlm = {
      model: () => 'scripted-model',
      async *stream() {
        yield* [];
        throw new Error('scripted stream failure');
      },
    };
    const api = client(failingLlm);

    const response = await api.ego.stream({ message: 'Keep this user turn.' });
    const frames = parseFrames(response.text);
    const failure = frames.at(-1);

    expect(failure?.type).toBe('error');
    if (failure?.type !== 'error' || failure.conversationId === undefined) {
      throw new Error('Ego stream error did not carry its conversation id.');
    }
    const conversation = await api.ego.getConversation(failure.conversationId);
    expect(conversation.messages[0]).toMatchObject({
      role: 'user',
      content: 'Keep this user turn.',
    });
  });
});
