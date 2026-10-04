import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../../../db/index.js';
import { makeEmptyPeerClients, makeTemplateRegistry } from '../../../__tests__/test-utils.js';
import { EngramService } from '../../engrams/service.js';
import { ConversationEngine, type EngineDeps } from '../engine.js';
import { DECLINED_RESULT, type ActionResolution } from '../loop-resume.js';
import { fakeToolbox, scriptedLlm } from './fakes.js';

import type {
  EgoActionsPart,
  EgoEntityPart,
  EgoMessagePart,
} from '../../../../contract/rest-ego-parts.js';
import type { ActionRunEvent } from '../action-runner.js';
import type { GatewayCaller } from '../gateway/gateway-client.js';
import type { EgoLlm, EgoToolUse } from '../llm.js';
import type { ProposedBatch } from '../tool-loop-types.js';
import type { ChatParams, ChatStreamEvent } from '../types.js';

let tmpDir: string;
let engramRoot: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ego-engine-resume-test-'));
  engramRoot = mkdtempSync(join(tmpdir(), 'ego-engine-resume-engrams-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(engramRoot, { recursive: true, force: true });
});

const writeOne = 'finance.transactions.create';
const writeTwo = 'inventory.items.create';
const readOne = 'finance.transactions.get';
const entity: EgoEntityPart = {
  type: 'entity',
  uri: 'pops:finance/transaction/tx_1',
  title: 'Coffee',
};
const proposal: EgoToolUse[] = [
  { id: 'write-1', name: writeOne, input: { amount: 12 } },
  { id: 'write-2', name: writeTwo, input: { name: 'Desk lamp' } },
];

function makeEngine(
  llm: EgoLlm,
  extras: Partial<Pick<EngineDeps, 'toolbox' | 'gateway' | 'newActionId' | 'newBatchId'>> = {}
): ConversationEngine {
  return new ConversationEngine({
    llm,
    search: {
      db: cerebrumDb.db,
      raw: cerebrumDb.raw,
      vecAvailable: cerebrumDb.vecAvailable,
      peers: makeEmptyPeerClients(),
    },
    engramService: new EngramService({
      root: engramRoot,
      db: cerebrumDb.db,
      templates: makeTemplateRegistry(),
    }),
    ...extras,
  });
}

function fixture(turns: Parameters<typeof scriptedLlm>[0], gateway?: GatewayCaller) {
  const scripted = scriptedLlm(turns);
  let actionId = 0;
  let batchId = 0;
  const tools = fakeToolbox(
    {
      [readOne]: () => ({
        kind: 'result',
        text: 'Found the coffee transaction.',
        isError: false,
        parts: [entity],
      }),
      [writeOne]: (args) => ({
        kind: 'write',
        tool: writeOne,
        args,
        summary: 'Create transaction',
      }),
      [writeTwo]: (args) => ({
        kind: 'write',
        tool: writeTwo,
        args,
        summary: 'Create inventory item',
      }),
    },
    { writes: [writeOne, writeTwo] }
  );
  const engine = makeEngine(scripted.llm, {
    toolbox: tools.toolbox,
    newActionId: () => 'action-' + ++actionId,
    newBatchId: () => 'batch-' + ++batchId,
    ...(gateway === undefined ? {} : { gateway }),
  });
  return { engine, scripted, toolCalls: tools.calls };
}

function chatParams(overrides: Partial<ChatParams> = {}): ChatParams {
  return {
    conversationId: 'conversation_1',
    message: 'Create two records.',
    history: [],
    activeScopes: [],
    ...overrides,
  };
}

async function collect(stream: AsyncGenerator<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

function done(events: ChatStreamEvent[]): Extract<ChatStreamEvent, { type: 'done' }> {
  const last = events.at(-1);
  if (last?.type !== 'done') throw new Error('Ego resume stream did not finish.');
  return last;
}

async function pause(
  engine: ConversationEngine
): Promise<{ batch: ProposedBatch; done: Extract<ChatStreamEvent, { type: 'done' }> }> {
  const prepared = await engine.prepareStream(chatParams());
  const result = done(await collect(prepared.stream));
  if (result.batch === null) throw new Error('The first turn did not pause for action approval.');
  return { batch: result.batch, done: result };
}

function actionsPart(parts: EgoMessagePart[]): EgoActionsPart {
  const part = parts.find((item) => item.type === 'actions');
  if (part?.type !== 'actions') throw new Error('The paused turn has no actions part.');
  return part;
}

function resolutions(batch: ProposedBatch): ReadonlyMap<string, ActionResolution> {
  const first = batch.actions[0];
  const second = batch.actions[1];
  if (first === undefined || second === undefined)
    throw new Error('The paused turn needs two writes.');
  return new Map([
    [first.actionId, { content: 'Created transaction tx_1', isError: false }],
    [second.actionId, { content: DECLINED_RESULT, isError: false }],
  ]);
}

async function* actionRunner(
  events: ActionRunEvent[],
  result: ReadonlyMap<string, ActionResolution>
): AsyncGenerator<ActionRunEvent, ReadonlyMap<string, ActionResolution>> {
  for (const event of events) yield event;
  return result;
}

describe('ConversationEngine resume stream', () => {
  it('runs the actions first and resumes the saved turn without new context', async () => {
    const missing = '[eng_20261003_0001_missing]';
    const { engine, scripted } = fixture([
      { toolUses: proposal },
      { toolUses: [{ id: 'read-1', name: readOne, input: { id: 'tx_1' } }] },
      { text: `The result is ready ${missing}.` },
    ]);
    const paused = await pause(engine);
    const previousPart = actionsPart(paused.done.parts);
    const updatedPart: EgoActionsPart = {
      ...previousPart,
      actions: previousPart.actions.map((action, index) => ({
        ...action,
        status: index === 0 ? 'executed' : 'rejected',
      })),
    };
    const events = await collect(
      engine.resumeStream({
        state: paused.batch.state,
        runActions: actionRunner(
          [
            { type: 'tool', name: writeOne, status: 'started' },
            { type: 'tool', name: writeOne, status: 'finished' },
            { type: 'part', part: updatedPart },
          ],
          resolutions(paused.batch)
        ),
        allowedTools: [],
      })
    );
    const result = done(events);

    expect(events.map((event) => event.type)).toEqual([
      'tool',
      'tool',
      'part',
      'tool',
      'tool',
      'part',
      'token',
      'done',
    ]);
    expect(events.slice(0, 3)).toEqual([
      { type: 'tool', name: writeOne, status: 'started' },
      { type: 'tool', name: writeOne, status: 'finished' },
      { type: 'part', part: updatedPart },
    ]);
    expect(result.content).not.toContain(missing);
    expect(result.content).toContain('The result is ready');
    expect(result.citations).toEqual([]);
    expect(result.parts).toEqual([{ type: 'text', text: result.content }, entity]);
    expect(result.parts).not.toContainEqual(updatedPart);
    expect(result.batch).toBeNull();
    expect(result.autoExecuted).toEqual([]);
    expect(result.tokensIn).toBe(2);
    expect(result.tokensOut).toBe(2);

    const request = scripted.requests[1];
    if (request === undefined) throw new Error('The continuation did not call the model.');
    expect(request.system).toBe(paused.batch.state.system);
    expect(request.messages.slice(0, paused.batch.state.messages.length)).toEqual(
      paused.batch.state.messages
    );
    expect(request.messages[paused.batch.state.messages.length]).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'write-1',
          content: 'Created transaction tx_1',
          is_error: false,
        },
        { type: 'tool_result', tool_use_id: 'write-2', content: DECLINED_RESULT, is_error: false },
      ],
    });
  });

  it('returns a new pending batch when the continuation proposes another write', async () => {
    const { engine } = fixture([
      { toolUses: proposal },
      { toolUses: [{ id: 'write-again', name: writeOne, input: { amount: 24 } }] },
    ]);
    const paused = await pause(engine);
    const events = await collect(
      engine.resumeStream({
        state: paused.batch.state,
        runActions: actionRunner([], resolutions(paused.batch)),
        allowedTools: [],
      })
    );
    const result = done(events);

    expect(result.batch?.actions).toMatchObject([{ tool: writeOne, args: { amount: 24 } }]);
    expect(result.parts.at(-1)).toMatchObject({
      type: 'actions',
      batchId: result.batch?.batchId,
      actions: [{ tool: writeOne, status: 'pending' }],
    });
  });

  it('does not call the model when running approved actions fails', async () => {
    const { engine, scripted } = fixture([{ toolUses: proposal }, { text: 'Should not run.' }]);
    const paused = await pause(engine);
    async function* failedRunner(): AsyncGenerator<
      ActionRunEvent,
      ReadonlyMap<string, ActionResolution>
    > {
      yield { type: 'tool', name: writeOne, status: 'started' };
      throw new Error('action runner failed');
    }

    await expect(
      collect(
        engine.resumeStream({
          state: paused.batch.state,
          runActions: failedRunner(),
          allowedTools: [],
        })
      )
    ).rejects.toThrow('action runner failed');
    expect(scripted.requests).toHaveLength(1);
  });

  it('auto-runs a continuation write only when the conversation allows that tool', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const gateway: GatewayCaller = {
      listTools: async () => [],
      callTool: async (name, args) => {
        calls.push({ name, args });
        return { text: 'Created transaction tx_2', isError: false };
      },
    };
    const write: EgoToolUse = { id: 'write-again', name: writeOne, input: { amount: 24 } };
    const { engine } = fixture(
      [{ toolUses: proposal }, { toolUses: [write] }, { text: 'Done.' }],
      gateway
    );
    const paused = await pause(engine);
    const events = await collect(
      engine.resumeStream({
        state: paused.batch.state,
        runActions: actionRunner([], resolutions(paused.batch)),
        allowedTools: [writeOne],
      })
    );

    expect(calls).toEqual([{ name: writeOne, args: { amount: 24 } }]);
    expect(done(events).batch).toBeNull();
    expect(done(events).autoExecuted).toMatchObject([
      { actions: [{ tool: writeOne, result: 'Created transaction tx_2' }] },
    ]);
  });

  it('proposes the same continuation write when it is not allowed', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const gateway: GatewayCaller = {
      listTools: async () => [],
      callTool: async (name, args) => {
        calls.push({ name, args });
        return { text: 'Created transaction tx_2', isError: false };
      },
    };
    const write: EgoToolUse = { id: 'write-again', name: writeOne, input: { amount: 24 } };
    const { engine } = fixture([{ toolUses: proposal }, { toolUses: [write] }], gateway);
    const paused = await pause(engine);
    const events = await collect(
      engine.resumeStream({
        state: paused.batch.state,
        runActions: actionRunner([], resolutions(paused.batch)),
        allowedTools: [],
      })
    );
    const result = done(events);

    expect(calls).toEqual([]);
    expect(result.batch?.actions).toMatchObject([{ tool: writeOne, args: { amount: 24 } }]);
    expect(result.parts.at(-1)).toMatchObject({
      type: 'actions',
      actions: [{ status: 'pending' }],
    });
  });
});
