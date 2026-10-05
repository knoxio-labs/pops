/** Shared database and streamed pending-batch fixtures for Ego decision tests. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, vi } from 'vitest';
import { z } from 'zod';

import { egoMessagePartsSchema } from '../../contract/rest-ego-parts.js';
import { openCerebrumDb, type OpenedCerebrumDb } from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import { fakeToolbox, scriptedLlm } from '../modules/ego/__tests__/fakes.js';
import { createTestTransport } from './test-http.js';
import { makeCerebrumApiDeps, makeClient } from './test-utils.js';

import type { EgoActionsPart, EgoMessagePart } from '../../contract/rest-ego-parts.js';
import type { CerebrumApiDeps } from '../handlers.js';
import type { GatewayCaller } from '../modules/ego/gateway/gateway-client.js';
import type { EgoTools } from '../modules/ego/toolbox.js';
import type { TestTransport } from './test-http.js';

type TestClient = ReturnType<typeof makeClient>;
type TestApp = ReturnType<typeof createCerebrumApiApp>;
type PendingBatch = {
  client: TestClient;
  batchId: string;
  actionIds: string[];
  conversationId: string;
  messageId: string;
  tools: typeof actionTools;
  callTool: GatewayCaller['callTool'];
};
type TestSetup = {
  createApp: (overrides?: Partial<CerebrumApiDeps>) => TestApp;
  createClient: (overrides?: Partial<CerebrumApiDeps>) => TestClient;
  createPendingBatch: () => Promise<PendingBatch>;
  db: () => OpenedCerebrumDb['db'];
  requestOn: TestTransport['requestOn'];
};

const actionTools = [
  'finance.transactions.create',
  'inventory.items.create',
  'media.watchlist.add',
] as const;

const doneFrameSchema = z.object({
  type: z.literal('done'),
  conversationId: z.string(),
  messageId: z.string(),
  parts: egoMessagePartsSchema,
});

const testTransport = createTestTransport();

/** Register isolated Cerebrum test fixtures and return helpers for each test. */
export function createEgoActionsTestSetup(): TestSetup {
  let tmpDir: string;
  let cerebrumDb: OpenedCerebrumDb;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-ego-actions-'));
    cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
  });

  afterEach(() => {
    cerebrumDb.raw.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function createApp(overrides: Partial<CerebrumApiDeps> = {}): TestApp {
    return createCerebrumApiApp(makeCerebrumApiDeps({ cerebrumDb, tmpDir }, overrides));
  }

  function createClient(overrides: Partial<CerebrumApiDeps> = {}): TestClient {
    return makeClient(createApp(overrides));
  }

  return {
    createApp,
    createClient,
    createPendingBatch: () => makePendingBatch(createClient),
    db: (): OpenedCerebrumDb['db'] => cerebrumDb.db,
    requestOn: (app: TestApp) => testTransport.requestOn(app),
  };
}

async function makePendingBatch(createClient: TestSetup['createClient']): Promise<PendingBatch> {
  const { llm } = scriptedLlm([
    {
      toolUses: actionTools.map((name, index) => ({
        id: `write_${index + 1}`,
        name,
        input: { ordinal: index + 1 },
      })),
    },
  ]);
  const callTool = vi.fn<GatewayCaller['callTool']>().mockResolvedValue({
    text: 'Unexpected tool call',
    isError: false,
  });
  const client = createClient({
    egoLlm: llm,
    egoTools: {
      toolbox: createActionToolbox(),
      gateway: { listTools: async () => [], callTool },
    },
  });
  const response = await client.ego.stream({ message: 'Create three things.' });
  const done = parseDoneFrame(response.text);
  const part = done.parts.find((candidate) => candidate.type === 'actions');
  if (part?.type !== 'actions') throw new Error('Ego stream did not emit an actions part.');

  return {
    client,
    batchId: part.batchId,
    actionIds: part.actions.map((action) => action.actionId),
    conversationId: done.conversationId,
    messageId: done.messageId,
    tools: actionTools,
    callTool,
  };
}

function createActionToolbox(): EgoTools['toolbox'] {
  return fakeToolbox(
    {
      [actionTools[0]]: (args) => ({
        kind: 'write',
        tool: actionTools[0],
        args,
        summary: 'Create transaction',
      }),
      [actionTools[1]]: (args) => ({
        kind: 'write',
        tool: actionTools[1],
        args,
        summary: 'Create inventory item',
      }),
      [actionTools[2]]: (args) => ({
        kind: 'write',
        tool: actionTools[2],
        args,
        summary: 'Add watchlist item',
      }),
    },
    { writes: actionTools }
  ).toolbox;
}

function parseDoneFrame(raw: string): z.infer<typeof doneFrameSchema> {
  const done = raw
    .split('\n\n')
    .map((block) => block.replace(/^data: /, '').trim())
    .filter((line) => line.length > 0)
    .map((line) => doneFrameSchema.safeParse(JSON.parse(line)))
    .find((result) => result.success);
  if (!done?.success) throw new Error('Ego stream did not emit a valid done frame.');
  return done.data;
}

/** Narrow an optional parts list to the action part carried by a message. */
export function actionsPart(parts: EgoMessagePart[] | null | undefined): EgoActionsPart {
  const part = parts?.find((item) => item.type === 'actions');
  if (part?.type !== 'actions') throw new Error('Assistant message has no actions part.');
  return part;
}
