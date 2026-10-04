import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../../../db/index.js';
import { makeEmptyPeerClients, makeTemplateRegistry } from '../../../__tests__/test-utils.js';
import { EngramService } from '../../engrams/service.js';
import { ConversationEngine, type EngineDeps } from '../engine.js';
import { fakeToolbox, scriptedLlm } from './fakes.js';

import type { EgoEntityPart } from '../../../../contract/rest-ego-parts.js';
import type { GatewayCaller } from '../gateway/gateway-client.js';
import type { EgoLlm, EgoToolUse } from '../llm.js';
import type { ChatParams, ChatStreamEvent } from '../types.js';

let tmpDir: string;
let engramRoot: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ego-engine-tools-test-'));
  engramRoot = mkdtempSync(join(tmpdir(), 'ego-engine-tools-engrams-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(engramRoot, { recursive: true, force: true });
});

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

function chatParams(overrides: Partial<ChatParams> = {}): ChatParams {
  return {
    conversationId: 'conversation_1',
    message: 'Hello',
    history: [],
    activeScopes: [],
    ...overrides,
  };
}

async function collectStream(engine: ConversationEngine, params = chatParams()) {
  const preparation = await engine.prepareStream(params);
  const events: ChatStreamEvent[] = [];
  for await (const event of preparation.stream) events.push(event);
  return { preparation, events };
}

function done(events: ChatStreamEvent[]): Extract<ChatStreamEvent, { type: 'done' }> {
  const last = events.at(-1);
  if (last?.type !== 'done') throw new Error('Ego engine stream did not finish.');
  return last;
}

function ids() {
  let actionId = 0;
  let batchId = 0;
  return {
    newActionId: () => 'action-' + ++actionId,
    newBatchId: () => 'batch-' + ++batchId,
    counts: () => ({ actionId, batchId }),
  };
}

const writeOne = 'finance.transactions.create';
const writeTwo = 'inventory.items.create';

function writeToolbox() {
  return fakeToolbox(
    {
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
}

describe('ConversationEngine tool loop', () => {
  it('forwards read tool events and returns entity parts from chat and streaming', async () => {
    const entity: EgoEntityPart = {
      type: 'entity',
      uri: 'pops:finance/transaction/tx_1',
      title: 'Coffee',
    };
    const toolUse: EgoToolUse = { id: 'read-1', name: 'lookup', input: { id: 'tx_1' } };
    const { toolbox } = fakeToolbox({
      lookup: () => ({
        kind: 'result',
        text: 'Transaction found',
        isError: false,
        parts: [entity],
      }),
    });
    const turns = [{ toolUses: [toolUse] }, { text: 'The coffee purchase was recorded.' }];
    const scripted = scriptedLlm(turns);
    const { events } = await collectStream(makeEngine(scripted.llm, { toolbox }));
    const streamDone = done(events);

    expect(scripted.requests[0]?.system).toContain('ego_show_entities');
    expect(events.map((event) => event.type)).toEqual(['tool', 'tool', 'part', 'token', 'done']);
    expect(events.slice(0, 2)).toEqual([
      { type: 'tool', name: 'lookup', status: 'started' },
      { type: 'tool', name: 'lookup', status: 'finished' },
    ]);
    expect(events).toContainEqual({ type: 'part', part: entity });
    expect(streamDone.parts).toEqual([
      { type: 'text', text: 'The coffee purchase was recorded.' },
      entity,
    ]);

    const chat = await makeEngine(scriptedLlm(turns).llm, { toolbox }).chat(chatParams());
    expect(chat.response.parts).toEqual(streamDone.parts);
    expect(chat.response.content).toBe(streamDone.content);
  });

  it('returns one ordered pending batch when the model proposes two writes', async () => {
    const toolUses: EgoToolUse[] = [
      { id: 'write-1', name: writeOne, input: { amount: 12 } },
      { id: 'write-2', name: writeTwo, input: { name: 'Desk lamp' } },
    ];
    const idFactory = ids();
    const { events } = await collectStream(
      makeEngine(scriptedLlm([{ toolUses }]).llm, {
        toolbox: writeToolbox().toolbox,
        newActionId: idFactory.newActionId,
        newBatchId: idFactory.newBatchId,
      })
    );
    const result = done(events);
    const part = result.parts.at(-1);

    expect(result.batch).toMatchObject({
      batchId: 'batch-1',
      actions: [
        { actionId: 'action-1', tool: writeOne, args: { amount: 12 } },
        { actionId: 'action-2', tool: writeTwo, args: { name: 'Desk lamp' } },
      ],
    });
    expect(part).toMatchObject({
      type: 'actions',
      batchId: result.batch?.batchId,
      actions: [
        { actionId: 'action-1', tool: writeOne, status: 'pending' },
        { actionId: 'action-2', tool: writeTwo, status: 'pending' },
      ],
    });
    expect(idFactory.counts()).toEqual({ actionId: 2, batchId: 1 });
    expect(result.batch?.state.messages.at(-1)).toMatchObject({ role: 'assistant' });
  });

  it('executes allowed writes and proposes them when the conversation has not allowed them', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const gateway: GatewayCaller = {
      listTools: async () => [],
      callTool: async (name, args) => {
        calls.push({ name, args });
        return { text: 'Created transaction tx_1', isError: false };
      },
    };
    const toolUse: EgoToolUse = {
      id: 'write-allowed',
      name: writeOne,
      input: { amount: 42 },
    };
    const idFactory = ids();
    const { toolbox } = writeToolbox();

    const allowedEvents = await collectStream(
      makeEngine(scriptedLlm([{ toolUses: [toolUse] }, { text: 'Transaction created.' }]).llm, {
        toolbox,
        gateway,
        newActionId: idFactory.newActionId,
        newBatchId: idFactory.newBatchId,
      }),
      chatParams({ allowedTools: [writeOne] })
    );
    const allowed = done(allowedEvents.events);

    expect(calls).toEqual([{ name: writeOne, args: { amount: 42 } }]);
    expect(allowed.batch).toBeNull();
    expect(allowed.autoExecuted).toMatchObject([
      {
        batchId: 'batch-1',
        actions: [{ actionId: 'action-1', tool: writeOne, result: 'Created transaction tx_1' }],
      },
    ]);
    expect(allowed.parts.at(-1)).toMatchObject({
      type: 'actions',
      actions: [{ actionId: 'action-1', tool: writeOne, status: 'executed' }],
    });

    const pendingEvents = await collectStream(
      makeEngine(scriptedLlm([{ toolUses: [toolUse] }]).llm, {
        toolbox,
        gateway,
        newActionId: idFactory.newActionId,
        newBatchId: idFactory.newBatchId,
      }),
      chatParams({ allowedTools: [] })
    );
    const pending = done(pendingEvents.events);

    expect(calls).toHaveLength(1);
    expect(pending.batch).not.toBeNull();
    expect(pending.autoExecuted).toEqual([]);
  });

  it('keeps the scope notice at the start of the stream, content, and text part', async () => {
    const { events } = await collectStream(
      makeEngine(scriptedLlm([{ text: 'Here are the personal notes.' }]).llm),
      chatParams({
        message: 'Only personal notes please.',
        activeScopes: ['work.notes'],
        knownScopes: ['work.notes', 'personal.notes'],
      })
    );
    const notice = events[0];
    const result = done(events);

    expect(notice).toMatchObject({
      type: 'token',
      text: expect.stringContaining('restricted to personal scopes'),
    });
    if (notice?.type !== 'token') throw new Error('Expected a leading scope notice token.');
    expect(result.content.startsWith(notice.text)).toBe(true);
    expect(result.parts[0]).toEqual({ type: 'text', text: result.content });
  });

  it('strips citations for engrams that were not retrieved', async () => {
    const { events } = await collectStream(
      makeEngine(
        scriptedLlm([{ text: 'The missing note [eng_20261003_0001_missing] is absent.' }]).llm
      )
    );

    expect(done(events).content).toBe('The missing note is absent.');
  });

  it('makes a tool-free model call and returns one text part without a toolbox', async () => {
    const { llm, requests } = scriptedLlm([{ text: 'A plain reply.' }]);
    const { events } = await collectStream(makeEngine(llm));
    const result = done(events);

    expect(requests[0]).not.toHaveProperty('tools');
    expect(requests[0]?.system).not.toContain('ego_show_entities');
    expect(result.parts).toEqual([{ type: 'text', text: 'A plain reply.' }]);
    expect(result.batch).toBeNull();
    expect(result.autoExecuted).toEqual([]);
  });
});
