/**
 * REST integration coverage for Ego tool results, pending write batches, and
 * conversation-allowed writes persisted by the chat pipeline.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { egoMessagePartsSchema } from '../../contract/rest-ego-parts.js';
import {
  egoActionBatchesService,
  egoActionsService,
  openCerebrumDb,
  type OpenedCerebrumDb,
} from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import { fakeToolbox, scriptedLlm } from '../modules/ego/__tests__/fakes.js';
import { resetBuildEgoToolsWarningForTests } from '../modules/ego/gateway/build-ego-tools.js';
import { ConversationPersistence } from '../modules/ego/persistence.js';
import { makeCerebrumApiDeps, makeClient } from './test-utils.js';

import type { EgoActionsPart, EgoMessagePart } from '../../contract/rest-ego-parts.js';
import type { GatewayCaller } from '../modules/ego/gateway/gateway-client.js';
import type { EgoLlm } from '../modules/ego/llm.js';
import type { EgoTools } from '../modules/ego/toolbox.js';

let tmpDir: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-ego-tools-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
});

afterEach(() => {
  vi.unstubAllEnvs();
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client(llm: EgoLlm, egoTools?: EgoTools) {
  const deps = makeCerebrumApiDeps(
    { cerebrumDb, tmpDir },
    {
      egoLlm: llm,
      ...(egoTools === undefined ? {} : { egoTools }),
    }
  );
  return makeClient(createCerebrumApiApp(deps));
}

function parseSseFrames(raw: string): unknown[] {
  return raw
    .split('\n\n')
    .map((block) => block.replace(/^data: /, '').trim())
    .filter((line) => line.length > 0)
    .map((line): unknown => JSON.parse(line));
}

const doneFrameSchema = z.object({
  type: z.literal('done'),
  conversationId: z.string(),
  messageId: z.string(),
  parts: egoMessagePartsSchema,
});

type DoneFrame = z.infer<typeof doneFrameSchema>;

function doneFrame(raw: string): DoneFrame {
  const parsed = parseSseFrames(raw)
    .map((frame) => doneFrameSchema.safeParse(frame))
    .find((result) => result.success);
  if (!parsed?.success) throw new Error('Ego stream did not emit a valid done frame.');
  return parsed.data;
}

function actionsPart(parts: EgoMessagePart[] | null | undefined): EgoActionsPart {
  const part = parts?.find((item) => item.type === 'actions');
  if (!part || part.type !== 'actions') throw new Error('Assistant message has no actions part.');
  return part;
}

const firstWrite = 'finance.transactions.create';
const secondWrite = 'inventory.items.create';

function writeTools() {
  return fakeToolbox(
    {
      [firstWrite]: (args) => ({
        kind: 'write',
        tool: firstWrite,
        args,
        summary: 'Create transaction',
      }),
      [secondWrite]: (args) => ({ kind: 'write', tool: secondWrite, args, summary: 'Create item' }),
    },
    { writes: [firstWrite, secondWrite] }
  ).toolbox;
}

function gateway(
  callTool = vi.fn(async () => ({ text: 'Created transaction tx_1', isError: false }))
): {
  caller: GatewayCaller;
  callTool: typeof callTool;
} {
  return {
    caller: { listTools: async () => [], callTool },
    callTool,
  };
}

describe('Ego tool persistence over REST', () => {
  it('stores read-tool parts on the chat response and conversation history', async () => {
    const entity = { type: 'entity' as const, uri: 'pops:inventory/item/item_1', title: 'Drill' };
    const { llm } = scriptedLlm([
      { toolUses: [{ id: 'read_1', name: 'inventory.items.get', input: { id: 'item_1' } }] },
      { text: 'That is the drill.' },
    ]);
    const toolbox = fakeToolbox({
      'inventory.items.get': () => ({
        kind: 'result',
        text: 'Drill',
        isError: false,
        parts: [entity],
      }),
    }).toolbox;
    const c = client(llm, { toolbox, gateway: gateway().caller });

    const result = await c.ego.chat({ message: 'Find my drill.' });
    const conversation = await c.ego.getConversation(result.conversationId);
    const expected = [{ type: 'text', text: 'That is the drill.' }, entity];

    expect(result.response.parts).toEqual(expected);
    expect(conversation.messages[1]?.parts).toEqual(expected);
  });

  it('persists a pending streamed batch after its assistant message', async () => {
    const argsOne = { amount: 12 };
    const argsTwo = { name: 'Desk lamp' };
    const { llm } = scriptedLlm([
      {
        toolUses: [
          { id: 'write_1', name: firstWrite, input: argsOne },
          { id: 'write_2', name: secondWrite, input: argsTwo },
        ],
      },
    ]);
    const { caller } = gateway();
    const c = client(llm, { toolbox: writeTools(), gateway: caller });
    const response = await c.ego.stream({ message: 'Create the transaction and item.' });
    const done = doneFrame(response.text);
    const part = actionsPart(done.parts);
    const conversation = await c.ego.getConversation(done.conversationId);
    const message = conversation.messages.find((item) => item.id === done.messageId);
    const batch = egoActionBatchesService.getBatch(cerebrumDb.db, part.batchId);
    const rows = egoActionsService.listActionsForBatch(cerebrumDb.db, part.batchId);

    expect(part.actions.map(({ status }) => status)).toEqual(['pending', 'pending']);
    expect(actionsPart(message?.parts).actions).toEqual(part.actions);
    expect(batch).toMatchObject({ status: 'pending', messageId: done.messageId });
    expect(batch?.loopState).toMatchObject({ messages: expect.any(Array) });
    expect(rows.map(({ id }) => id)).toEqual(part.actions.map(({ actionId }) => actionId));
    expect(rows.map(({ position, tool, args }) => ({ position, tool, args }))).toEqual([
      { position: 0, tool: firstWrite, args: argsOne },
      { position: 1, tool: secondWrite, args: argsTwo },
    ]);
  });

  it('persists an allowed streamed write as an auto batch and executed action', async () => {
    const args = { amount: 18 };
    const { llm } = scriptedLlm([
      { toolUses: [{ id: 'write_1', name: firstWrite, input: args }] },
      { text: 'Done.' },
    ]);
    const { caller, callTool } = gateway();
    const persistence = new ConversationPersistence({ db: cerebrumDb.db });
    const conversation = persistence.createConversation({
      title: 'Allowed writes',
      model: 'scripted-model',
    });
    persistence.addAllowedTools(conversation.id, [firstWrite]);
    const c = client(llm, { toolbox: writeTools(), gateway: caller });

    const response = await c.ego.stream({
      conversationId: conversation.id,
      message: 'Create the transaction.',
    });
    const done = doneFrame(response.text);
    const part = actionsPart(done.parts);
    const batch = egoActionBatchesService.getBatch(cerebrumDb.db, part.batchId);
    const rows = egoActionsService.listActionsForBatch(cerebrumDb.db, part.batchId);

    expect(callTool).toHaveBeenCalledWith(firstWrite, args);
    expect(part.actions).toMatchObject([{ actionId: expect.any(String), status: 'executed' }]);
    expect(batch).toMatchObject({ status: 'auto', messageId: done.messageId });
    expect(rows).toMatchObject([
      { tool: firstWrite, args, status: 'executed', result: 'Created transaction tx_1' },
    ]);
    expect(
      egoActionBatchesService.listBatchesForConversation(cerebrumDb.db, conversation.id)
    ).toMatchObject([{ id: part.batchId, status: 'auto' }]);
  });

  it('serves chat without tools when gateway configuration is missing', async () => {
    vi.stubEnv('CEREBRUM_EGO_MCP_URL', '');
    vi.stubEnv('CEREBRUM_EGO_MCP_TOKEN_FILE', '');
    vi.stubEnv('CEREBRUM_EGO_MCP_TOKEN', '');
    resetBuildEgoToolsWarningForTests();
    const { llm, requests } = scriptedLlm([{ text: 'Plain answer.' }]);
    const c = client(llm);
    const result = await c.ego.chat({ message: 'Say hello.' });

    expect(requests[0]?.tools ?? []).toEqual([]);
    expect(result.response.parts).toEqual([{ type: 'text', text: 'Plain answer.' }]);
    expect(
      egoActionBatchesService.listBatchesForConversation(cerebrumDb.db, result.conversationId)
    ).toEqual([]);
    expect(
      egoActionsService.listActionsForConversation(cerebrumDb.db, result.conversationId)
    ).toEqual([]);
  });
});
