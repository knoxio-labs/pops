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
import { makeCerebrumApiDeps, makeClient } from './test-utils.js';

import type { EgoActionsPart, EgoMessagePart } from '../../contract/rest-ego-parts.js';
import type { GatewayCaller } from '../modules/ego/gateway/gateway-client.js';
import type { EgoLlm } from '../modules/ego/llm.js';
import type { EgoTools } from '../modules/ego/toolbox.js';

let tmpDir: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-ego-readonly-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client(llm: EgoLlm, egoTools: EgoTools) {
  const deps = makeCerebrumApiDeps({ cerebrumDb, tmpDir }, { egoLlm: llm, egoTools });
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

function doneFrame(raw: string): z.infer<typeof doneFrameSchema> {
  const parsed = parseSseFrames(raw)
    .map((frame) => doneFrameSchema.safeParse(frame))
    .find((result) => result.success);
  if (!parsed?.success) throw new Error('Ego stream did not emit a valid done frame.');
  return parsed.data;
}

function actionsPart(parts: EgoMessagePart[]): EgoActionsPart {
  const part = parts.find((item) => item.type === 'actions');
  if (!part || part.type !== 'actions') throw new Error('Assistant message has no actions part.');
  return part;
}

const readTool = 'finance.transactions.list';
const writeTool = 'finance.transactions.create';

function writeTools() {
  return fakeToolbox(
    {
      [readTool]: () => ({ kind: 'result', text: 'No transactions found.', isError: false }),
      [writeTool]: (args) => ({
        kind: 'write',
        tool: writeTool,
        args,
        summary: 'Create transaction',
      }),
    },
    { writes: [writeTool] }
  );
}

function gateway(): { caller: GatewayCaller; callTool: ReturnType<typeof vi.fn> } {
  const callTool = vi.fn(async () => ({ text: 'Created transaction tx_1', isError: false }));
  return { caller: { listTools: async () => [], callTool }, callTool };
}

describe('Ego non-stream chat read-only tools', () => {
  it('hides writes, blocks invented write calls, and persists no actions or batches', async () => {
    const scripted = scriptedLlm([
      { toolUses: [{ id: 'write-1', name: writeTool, input: { amount: 42 } }] },
      { text: 'I cannot make that change here.' },
    ]);
    const tools = writeTools();
    const gw = gateway();
    const c = client(scripted.llm, { toolbox: tools.toolbox, gateway: gw.caller });

    const result = await c.ego.chat({ message: 'Create a transaction.' });

    expect(scripted.requests[0]?.tools?.map(({ name }) => name)).toEqual([readTool]);
    expect(tools.calls).toEqual([]);
    expect(gw.callTool).not.toHaveBeenCalled();
    expect(result.response.parts?.some((part) => part.type === 'actions')).toBe(false);
    expect(
      egoActionBatchesService.listBatchesForConversation(cerebrumDb.db, result.conversationId)
    ).toEqual([]);
    expect(
      egoActionsService.listActionsForConversation(cerebrumDb.db, result.conversationId)
    ).toEqual([]);
  });

  it('keeps write tools on the stream route and stores their pending batch', async () => {
    const args = { amount: 42 };
    const scripted = scriptedLlm([{ toolUses: [{ id: 'write-1', name: writeTool, input: args }] }]);
    const tools = writeTools();
    const gw = gateway();
    const c = client(scripted.llm, { toolbox: tools.toolbox, gateway: gw.caller });

    const response = await c.ego.stream({ message: 'Create a transaction.' });
    const done = doneFrame(response.text);
    const part = actionsPart(done.parts);
    const batch = egoActionBatchesService.getBatch(cerebrumDb.db, part.batchId);
    const rows = egoActionsService.listActionsForBatch(cerebrumDb.db, part.batchId);

    expect(scripted.requests[0]?.tools?.map(({ name }) => name)).toContain(writeTool);
    expect(tools.calls).toEqual([{ name: writeTool, input: args }]);
    expect(gw.callTool).not.toHaveBeenCalled();
    expect(part.actions).toMatchObject([{ tool: writeTool, status: 'pending' }]);
    expect(batch).toMatchObject({ status: 'pending', messageId: done.messageId });
    expect(rows).toMatchObject([{ tool: writeTool, args, status: 'pending' }]);
  });
});
