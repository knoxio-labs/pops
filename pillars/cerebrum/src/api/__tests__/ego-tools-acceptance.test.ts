/** Offline acceptance coverage for the complete Ego gateway and action flow. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { egoStreamFrameSchema, type EgoStreamFrame } from '../../contract/rest-ego-stream.js';
import { egoActionBatchesService, openCerebrumDb, type OpenedCerebrumDb } from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import { scriptedLlm } from '../modules/ego/__tests__/fakes.js';
import {
  startGatewayTestServer,
  type GatewayTestCall,
} from '../modules/ego/gateway/__tests__/gateway-test-server.js';
import {
  buildEgoTools,
  resetBuildEgoToolsWarningForTests,
} from '../modules/ego/gateway/build-ego-tools.js';
import { DECLINED_RESULT } from '../modules/ego/loop-resume.js';
import { makeCerebrumApiDeps, makeClient } from './test-utils.js';

import type { Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';

import type { EgoActionsPart, EgoMessagePart } from '../../contract/rest-ego-parts.js';
import type { EgoTurnRequest, EgoToolUse } from '../modules/ego/llm.js';
import type { EgoTools } from '../modules/ego/toolbox.js';

const LIST_TOOL = 'finance.transactions.list';
const GET_TOOL = 'finance.transactions.get';
const ADD_TAGS_TOOL = 'finance.transactions.addTags';
const REMOVE_TAGS_TOOL = 'finance.transactions.removeTags';
const LIST_MODEL_TOOL = 'finance__transactions__list';
const ADD_TAGS_MODEL_TOOL = 'finance__transactions__addTags';
const REMOVE_TAGS_MODEL_TOOL = 'finance__transactions__removeTags';
const TRANSACTION_URI = 'pops:finance/transaction/tx_1';
const WRITE_TOOLS = new Set([ADD_TAGS_TOOL, REMOVE_TAGS_TOOL]);

const transaction = {
  id: 'tx_1',
  uri: TRANSACTION_URI,
  description: 'Coffee',
  amount: -4.5,
  date: '2026-09-30',
};

const financeTools: McpTool[] = [
  {
    name: LIST_TOOL,
    description: 'List transactions.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: GET_TOOL,
    description: 'Get one transaction.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: ADD_TAGS_TOOL,
    description: 'Add tags to a transaction.',
    inputSchema: {
      type: 'object',
      properties: { transactionId: { type: 'string' }, tags: { type: 'array' } },
      required: ['transactionId', 'tags'],
    },
  },
  {
    name: REMOVE_TAGS_TOOL,
    description: 'Remove tags from a transaction.',
    inputSchema: {
      type: 'object',
      properties: { transactionId: { type: 'string' }, tags: { type: 'array' } },
      required: ['transactionId', 'tags'],
    },
  },
];

let gateway: Awaited<ReturnType<typeof startGatewayTestServer>>;
let tmpDir: string;
let cerebrumDb: OpenedCerebrumDb;

beforeAll(async () => {
  gateway = await startGatewayTestServer({
    tools: financeTools,
    onCall: (call) => financeToolResult(call),
  });
});

afterAll(async () => {
  await gateway.close();
});

beforeEach(() => {
  vi.stubEnv('CEREBRUM_EGO_MCP_URL', '');
  vi.stubEnv('CEREBRUM_EGO_MCP_TOKEN_FILE', '');
  vi.stubEnv('CEREBRUM_EGO_MCP_TOKEN', '');
  resetBuildEgoToolsWarningForTests();
  gateway.calls.length = 0;
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-ego-tools-acceptance-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('Ego tools offline acceptance', () => {
  it('composes read cards, decided writes, resume results, and the following model history', async () => {
    const firstArgs = { transactionId: 'tx_1', tags: ['reviewed'] };
    const rejectedArgs = { transactionId: 'tx_2', tags: ['coffee'] };
    const thirdArgs = { transactionId: 'tx_3', tags: ['duplicate'] };
    const writes: EgoToolUse[] = [
      { id: 'write_add_1', name: ADD_TAGS_MODEL_TOOL, input: firstArgs },
      { id: 'write_add_2', name: ADD_TAGS_MODEL_TOOL, input: rejectedArgs },
      { id: 'write_remove_3', name: REMOVE_TAGS_MODEL_TOOL, input: thirdArgs },
    ];
    const script = scriptedLlm([
      { toolUses: [{ id: 'read_list', name: LIST_MODEL_TOOL, input: {} }] },
      {
        toolUses: [
          {
            id: 'show_coffee',
            name: 'ego_show_entities',
            input: { uris: [TRANSACTION_URI] },
          },
        ],
      },
      { text: 'The transaction is Coffee.' },
      { toolUses: writes },
      { text: 'The approved transaction updates are complete.' },
      { text: 'The card and action results are in the conversation history.' },
    ]);
    const client = await createTestClient(script.llm);

    const readResponse = await client.ego.stream({ message: 'Show me my coffee transaction.' });
    const readFrames = parseFrames(readResponse.text);
    const readDone = doneFrame(readFrames);
    const readToolFrames = readFrames.filter(
      (frame): frame is Extract<EgoStreamFrame, { type: 'tool' }> => frame.type === 'tool'
    );
    expect(readToolFrames).toEqual([
      { type: 'tool', name: LIST_TOOL, status: 'started' },
      { type: 'tool', name: LIST_TOOL, status: 'finished' },
      { type: 'tool', name: 'ego_show_entities', status: 'started' },
      { type: 'tool', name: 'ego_show_entities', status: 'finished' },
    ]);
    const cardFrame = readFrames.find(
      (frame): frame is Extract<EgoStreamFrame, { type: 'part' }> =>
        frame.type === 'part' && frame.part.type === 'entity'
    );
    expect(cardFrame?.part).toMatchObject({
      type: 'entity',
      uri: TRANSACTION_URI,
      title: 'Coffee',
    });
    expect(readDone.parts).toContainEqual({ type: 'text', text: 'The transaction is Coffee.' });
    expect(readDone.parts).toContainEqual(
      expect.objectContaining({ type: 'entity', uri: TRANSACTION_URI, title: 'Coffee' })
    );
    expect(gateway.calls).toEqual([
      { name: LIST_TOOL, args: {} },
      { name: GET_TOOL, args: { id: 'tx_1' } },
    ]);

    const readConversation = await client.ego.getConversation(readDone.conversationId);
    const readMessage = readConversation.messages.find(({ id }) => id === readDone.messageId);
    expect(readMessage).toMatchObject({
      role: 'assistant',
      content: 'The transaction is Coffee.',
      parts: expect.arrayContaining([
        expect.objectContaining({ type: 'text', text: 'The transaction is Coffee.' }),
        expect.objectContaining({ type: 'entity', uri: TRANSACTION_URI, title: 'Coffee' }),
      ]),
    });

    const pendingResponse = await client.ego.stream({
      conversationId: readDone.conversationId,
      message: 'Tag these transactions.',
    });
    const pendingFrames = parseFrames(pendingResponse.text);
    const pendingDone = doneFrame(pendingFrames);
    const pending = actionsPart(pendingDone.parts);
    expect(pending.actions.map(({ status }) => status)).toEqual(['pending', 'pending', 'pending']);
    expect(
      pendingFrames.filter((frame) => frame.type === 'part' && frame.part.type === 'actions')
    ).toHaveLength(1);
    expect(writeCalls(gateway.calls)).toEqual([]);

    const decision = await client.ego.decideActionBatch(pending.batchId, {
      approve: [actionId(pending, 0), actionId(pending, 2)],
      reject: [actionId(pending, 1)],
      alwaysAllow: [],
    });
    expect(decision.batch.actions.map(({ status }) => status)).toEqual([
      'confirmed',
      'rejected',
      'confirmed',
    ]);
    expect(writeCalls(gateway.calls)).toEqual([]);
    await expect(
      client.ego.decideActionBatch(pending.batchId, {
        approve: [actionId(pending, 0), actionId(pending, 2)],
        reject: [actionId(pending, 1)],
        alwaysAllow: [],
      })
    ).rejects.toMatchObject({ status: 409 });

    const resumeResponse = await client.ego.stream({
      conversationId: readDone.conversationId,
      resumeBatchId: pending.batchId,
    });
    const resumeFrames = parseFrames(resumeResponse.text);
    const resumeDone = doneFrame(resumeFrames);
    expect(resumeFrames.slice(0, 6).map(({ type }) => type)).toEqual([
      'tool',
      'tool',
      'part',
      'tool',
      'tool',
      'part',
    ]);
    expect(
      resumeFrames.filter(
        (frame): frame is Extract<EgoStreamFrame, { type: 'tool' }> => frame.type === 'tool'
      )
    ).toEqual([
      { type: 'tool', name: ADD_TAGS_TOOL, status: 'started' },
      { type: 'tool', name: ADD_TAGS_TOOL, status: 'finished' },
      { type: 'tool', name: REMOVE_TAGS_TOOL, status: 'started' },
      { type: 'tool', name: REMOVE_TAGS_TOOL, status: 'finished' },
    ]);
    const actionPartFrames = resumeFrames.filter(
      (frame): frame is Extract<EgoStreamFrame, { type: 'part' }> =>
        frame.type === 'part' && frame.part.type === 'actions'
    );
    expect(actionPartFrames).toHaveLength(2);
    expect(
      actionPartFrames.map(({ part }) => actionsPart([part]).actions.map(({ status }) => status))
    ).toEqual([
      ['executed', 'rejected', 'confirmed'],
      ['executed', 'rejected', 'executed'],
    ]);
    expect(writeCalls(gateway.calls)).toEqual([
      { name: ADD_TAGS_TOOL, args: firstArgs },
      { name: REMOVE_TAGS_TOOL, args: thirdArgs },
    ]);

    const resumeRequest = script.requests[4];
    expect(resumeRequest?.messages.at(-1)).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'write_add_1',
          content: JSON.stringify({ added: firstArgs }),
          is_error: false,
        },
        {
          type: 'tool_result',
          tool_use_id: 'write_add_2',
          content: DECLINED_RESULT,
          is_error: false,
        },
        {
          type: 'tool_result',
          tool_use_id: 'write_remove_3',
          content: JSON.stringify({ removed: thirdArgs }),
          is_error: false,
        },
      ],
    });

    const afterResume = await client.ego.getConversation(readDone.conversationId);
    const batchMessageIndex = afterResume.messages.findIndex(
      ({ id }) => id === pendingDone.messageId
    );
    const resumedMessageIndex = afterResume.messages.findIndex(
      ({ id }) => id === resumeDone.messageId
    );
    expect(resumedMessageIndex).toBeGreaterThan(batchMessageIndex);
    const storedBatchMessage = afterResume.messages[batchMessageIndex];
    expect(actionsPart(storedBatchMessage?.parts).actions.map(({ status }) => status)).toEqual([
      'executed',
      'rejected',
      'executed',
    ]);
    expect(afterResume.messages[resumedMessageIndex]).toMatchObject({
      role: 'assistant',
      content: 'The approved transaction updates are complete.',
    });
    expect(egoActionBatchesService.getBatch(cerebrumDb.db, pending.batchId)?.status).toBe(
      'continued'
    );

    const repeatedResume = await client.ego.stream({
      conversationId: readDone.conversationId,
      resumeBatchId: pending.batchId,
    });
    expect(errorFrame(parseFrames(repeatedResume.text)).code).toBe(
      'cerebrum.ego.batch_not_resumable'
    );

    await client.ego.chat({
      conversationId: readDone.conversationId,
      message: 'What is in the history?',
    });
    const followingRequest = script.requests[5];
    expect(followingRequest?.messages[0]?.role).toBe('user');
    const history = messagesText(followingRequest);
    expect(history).toContain('[shown: Coffee (');
    expect(history).toContain(`[action ${ADD_TAGS_TOOL} `);
    expect(history).toContain(`[action ${REMOVE_TAGS_TOOL} `);
    expect(history).toContain(': executed]');
    expect(history).toContain(': rejected]');
  });

  it('scopes always-allow, supersedes undecided writes, and keeps non-stream chat read-only', async () => {
    const approvedArgs = { transactionId: 'tx_1', tags: ['reviewed'] };
    const allowedArgs = { transactionId: 'tx_2', tags: ['automatic'] };
    const newConversationArgs = { transactionId: 'tx_3', tags: ['manual'] };
    const script = scriptedLlm([
      { toolUses: [{ id: 'always_first', name: ADD_TAGS_MODEL_TOOL, input: approvedArgs }] },
      { text: 'The approved write resumed.' },
      { toolUses: [{ id: 'auto_write', name: ADD_TAGS_MODEL_TOOL, input: allowedArgs }] },
      { text: 'The allowed write ran.' },
      {
        toolUses: [
          { id: 'new_conversation_write', name: ADD_TAGS_MODEL_TOOL, input: newConversationArgs },
        ],
      },
      { text: 'The replacement message was handled.' },
      { text: 'Read tools are available here.' },
    ]);
    const client = await createTestClient(script.llm);

    const firstResponse = await client.ego.stream({ message: 'Add a review tag.' });
    const firstDone = doneFrame(parseFrames(firstResponse.text));
    const firstBatch = actionsPart(firstDone.parts);
    expect(firstBatch.actions.map(({ status }) => status)).toEqual(['pending']);
    await client.ego.decideActionBatch(firstBatch.batchId, {
      approve: [actionId(firstBatch, 0)],
      reject: [],
      alwaysAllow: [ADD_TAGS_TOOL],
    });
    expect(writeCalls(gateway.calls)).toEqual([]);

    const resumedResponse = await client.ego.stream({
      conversationId: firstDone.conversationId,
      resumeBatchId: firstBatch.batchId,
    });
    const resumedDone = doneFrame(parseFrames(resumedResponse.text));
    expect(resumedDone.parts).toContainEqual({ type: 'text', text: 'The approved write resumed.' });
    expect(writeCalls(gateway.calls)).toEqual([{ name: ADD_TAGS_TOOL, args: approvedArgs }]);

    const autoResponse = await client.ego.stream({
      conversationId: firstDone.conversationId,
      message: 'Add an automatic tag.',
    });
    const autoDone = doneFrame(parseFrames(autoResponse.text));
    const autoPart = actionsPart(autoDone.parts);
    expect(autoPart.actions.map(({ status }) => status)).toEqual(['executed']);
    expect(egoActionBatchesService.getBatch(cerebrumDb.db, autoPart.batchId)?.status).toBe('auto');
    expect(
      egoActionBatchesService
        .listBatchesForConversation(cerebrumDb.db, firstDone.conversationId)
        .some(({ status }) => status === 'pending')
    ).toBe(false);
    const afterAuto = await client.ego.getConversation(firstDone.conversationId);
    const storedAutoMessage = afterAuto.messages.find(({ id }) => id === autoDone.messageId);
    expect(actionsPart(storedAutoMessage?.parts).actions.map(({ status }) => status)).toEqual([
      'executed',
    ]);
    expect(writeCalls(gateway.calls)).toEqual([
      { name: ADD_TAGS_TOOL, args: approvedArgs },
      { name: ADD_TAGS_TOOL, args: allowedArgs },
    ]);

    const newConversationResponse = await client.ego.stream({
      message: 'Add a tag in a new conversation.',
    });
    const newConversationDone = doneFrame(parseFrames(newConversationResponse.text));
    const pending = actionsPart(newConversationDone.parts);
    expect(newConversationDone.conversationId).not.toBe(firstDone.conversationId);
    expect(pending.actions.map(({ status }) => status)).toEqual(['pending']);
    expect(writeCalls(gateway.calls)).toHaveLength(2);

    const writeCountBeforeSupersede = writeCalls(gateway.calls).length;
    const supersededResponse = await client.ego.stream({
      conversationId: newConversationDone.conversationId,
      message: 'never mind',
    });
    const supersededFrames = parseFrames(supersededResponse.text);
    const firstFrame = supersededFrames[0];
    expect(firstFrame?.type).toBe('part');
    if (firstFrame?.type !== 'part' || firstFrame.part.type !== 'actions') {
      throw new Error('The superseded action part was not the first stream frame.');
    }
    expect(firstFrame.part.batchId).toBe(pending.batchId);
    expect(firstFrame.part.actions.map(({ status }) => status)).toEqual(['rejected']);
    expect(writeCalls(gateway.calls)).toHaveLength(writeCountBeforeSupersede);
    await expect(
      client.ego.decideActionBatch(pending.batchId, {
        approve: [actionId(pending, 0)],
        reject: [],
        alwaysAllow: [],
      })
    ).rejects.toMatchObject({ status: 409 });

    const supersededRequest = script.requests[5];
    expect(lastUserText(supersededRequest)).toMatch(
      /^\[action finance\.transactions\.addTags .*: This action was superseded by a new message and was not run\.\]/
    );
    expect(lastUserText(supersededRequest)).toContain('never mind');

    await client.ego.chat({
      conversationId: newConversationDone.conversationId,
      message: 'List transactions only.',
    });
    const nonStreamToolNames = (script.requests[6]?.tools ?? []).map(({ name }) => name);
    expect(nonStreamToolNames).toContain(LIST_MODEL_TOOL);
    expect(nonStreamToolNames).not.toContain(ADD_TAGS_MODEL_TOOL);
    expect(nonStreamToolNames).not.toContain(REMOVE_TAGS_MODEL_TOOL);
    expect(writeCalls(gateway.calls)).toHaveLength(writeCountBeforeSupersede);
  });

  it('keeps local tools available when the configured gateway is down', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tools = await buildTools('http://127.0.0.1:1/mcp');
    const script = scriptedLlm([{ text: 'A plain answer while the gateway is down.' }]);
    const client = await createTestClient(script.llm, tools);

    const result = await client.ego.chat({ message: 'Answer without a gateway.' });
    expect(result.response.parts).toEqual([
      { type: 'text', text: 'A plain answer while the gateway is down.' },
    ]);
    expect((script.requests[0]?.tools ?? []).map(({ name }) => name)).toEqual([
      'ego_show_entities',
      'ego_navigate',
    ]);
    expect(writeCalls(gateway.calls)).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Failed to list gateway tools'));
  });
});

function financeToolResult({ name, args }: GatewayTestCall) {
  switch (name) {
    case LIST_TOOL:
      return textResult({ data: [transaction] });
    case GET_TOOL: {
      const id = String(args['id'] ?? '');
      return textResult({ data: id === transaction.id ? transaction : { ...transaction, id } });
    }
    case ADD_TAGS_TOOL:
      return textResult({ added: args });
    case REMOVE_TAGS_TOOL:
      return textResult({ removed: args });
    default:
      return { content: [{ type: 'text' as const, text: 'Unknown fake tool.' }], isError: true };
  }
}

function textResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

async function buildTools(url = gateway.url): Promise<EgoTools> {
  const tools = buildEgoTools({
    CEREBRUM_EGO_MCP_URL: url,
    CEREBRUM_EGO_MCP_TOKEN: gateway.token,
  });
  if (tools === null) throw new Error('The fake gateway configuration should build Ego tools.');
  await tools.toolbox.definitions();
  return tools;
}

async function createTestClient(llm: ReturnType<typeof scriptedLlm>['llm'], tools?: EgoTools) {
  const egoTools = tools ?? (await buildTools());
  const deps = makeCerebrumApiDeps({ cerebrumDb, tmpDir }, { egoLlm: llm, egoTools });
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

function actionId(part: EgoActionsPart, index: number): string {
  const action = part.actions[index];
  if (action === undefined) throw new Error('The action part is missing an expected entry.');
  return action.actionId;
}

function writeCalls(calls: readonly GatewayTestCall[]): GatewayTestCall[] {
  return calls.filter(({ name }) => WRITE_TOOLS.has(name));
}

function messagesText(request: EgoTurnRequest | undefined): string {
  return (
    request?.messages
      .map(({ content }) => (typeof content === 'string' ? content : JSON.stringify(content)))
      .join('\n') ?? ''
  );
}

function lastUserText(request: EgoTurnRequest | undefined): string {
  const message = request?.messages.at(-1);
  if (message?.role !== 'user')
    throw new Error('The model request did not end with a user message.');
  return typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
}
