import express from 'express';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createPillarErrorHandlers } from '@pops/pillar-express';
import { __resetSharedOpenApiCache, __resetSharedPillarClient } from '@pops/pillar-sdk/client';
import {
  __resetServerPillarCache,
  __resetServerSdkConfig,
  configureServerSdk,
} from '@pops/pillar-sdk/server';

import { createUploadRouter } from '../uploads/upload-route.js';
import { createUploadTokenStore } from '../uploads/upload-tokens.js';
import {
  createDocumentsOwnerHttpFixture,
  uploadInput,
  original,
  originalBytes,
} from './documents-owner-http-fixture.js';
import { documentsOwnerReadTools } from './documents-owner-read.js';
import {
  documentsCreateUploadTool,
  documentsDispatchUploadTool,
} from './documents-owner-upload.js';
import { parseResult } from './test-helpers.js';

import type { Server } from 'node:http';

import type { DiscoveryTransport } from '@pops/pillar-sdk/client';
import type { PillarHandle, ServerPillarOptions } from '@pops/pillar-sdk/server';

const state = vi.hoisted(() => ({ origin: '' }));
vi.mock('../pillar-client.js', async () => {
  const { pillar } = await import('@pops/pillar-sdk/server');
  const transport: DiscoveryTransport = {
    fetchSnapshot: async () => [
      {
        pillarId: 'documents',
        baseUrl: state.origin,
        status: 'healthy',
        registered: true,
        lastSeenAt: '2026-11-12T00:00:00Z',
        manifest: {
          pillar: 'documents',
          version: '1.0.0',
          contract: {
            package: '@pops/documents',
            version: '1.0.0',
            tag: 'contract-documents@v1.0.0',
          },
          routes: { queries: [], mutations: [], subscriptions: [] },
          search: { adapters: [] },
          ai: { tools: [] },
          uri: { types: ['documents/document'] },
          consumedSettings: { keys: [] },
          healthcheck: { path: '/health' },
        },
      },
    ],
  };
  return {
    getPillar: <TRouter>(id: string, options?: ServerPillarOptions): PillarHandle<TRouter> => {
      if (id !== 'documents') throw new Error('Unexpected nonowner call');
      return pillar<TRouter>(id, { ...options, transport });
    },
  };
});
let server: Server;
let tokens: ReturnType<typeof createUploadTokenStore>;
let owner: ReturnType<typeof createDocumentsOwnerHttpFixture>;

beforeEach(async () => {
  tokens = createUploadTokenStore();
  owner = createDocumentsOwnerHttpFixture();
  configureServerSdk({ apiKey: 'fixture' });
  const app = express();
  const errors = createPillarErrorHandlers({ pillar: 'mcp' });
  app.use(errors.requestId);
  app.use(owner.app);
  app.use(
    '/uploads',
    createUploadRouter({
      tokens,
      documents: {
        discovery: { lookup: async () => ({ baseUrl: state.origin }) },
        apiKey: () => 'fixture',
      },
    })
  );
  app.use(errors.final);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No address');
  state.origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  __resetServerPillarCache();
  __resetServerSdkConfig();
  __resetSharedPillarClient();
  __resetSharedOpenApiCache();
});
function read(name: string) {
  const tool = documentsOwnerReadTools.find((entry) => entry.name === `documents.${name}`);
  if (!tool) throw new Error('No read tool');
  return tool;
}
async function create(tokensToUse = tokens) {
  const result = await documentsCreateUploadTool(tokensToUse).handler(uploadInput, {
    publicBaseUrl: state.origin,
  });
  expect(result.isError).not.toBe(true);
  const value = parseResult(result);
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('No object');
  return Object.fromEntries(Object.entries(value));
}
async function send(url: unknown): Promise<Response> {
  if (typeof url !== 'string') throw new Error('No upload URL');
  return fetch(url, {
    method: 'PUT',
    headers: { 'content-type': uploadInput.mimeType },
    body: originalBytes,
  });
}
async function status() {
  return read('uploadStatus').handler({ operationId: uploadInput.operationId });
}

it.each(['done', 'duplicate'] as const)(
  'crosses actual SDK/HTTP and streamed URL through durable %s proof without an Inventory target',
  async (completed) => {
    const minted = await create();
    expect(minted).toMatchObject({
      operationId: uploadInput.operationId,
      upload: { input: uploadInput, state: 'awaiting_content' },
    });
    const reply = await send(minted['uploadUrl']);
    expect(reply.status).toBe(200);
    expect(await reply.json()).toMatchObject({
      data: { input: uploadInput, state: 'accepted', taskId: 'owner-ingestion' },
    });
    expect(owner.bytes).toEqual(originalBytes);
    expect(parseResult(await status())).toMatchObject({
      data: { input: uploadInput, state: 'accepted', taskId: 'owner-ingestion' },
    });
    expect(parseResult(await read('task').handler({ taskId: 'owner-ingestion' }))).toEqual({
      data: { state: 'pending', documentId: null, reason: null },
    });
    owner.taskState = completed;
    expect(parseResult(await read('task').handler({ taskId: 'owner-ingestion' }))).toEqual({
      data: { state: completed, documentId: 91, reason: null },
    });
    expect(parseResult(await status())).toMatchObject({
      data: { input: uploadInput, state: completed, documentId: 91 },
    });
    expect(parseResult(await read('get').handler({ id: 91 }))).toEqual({ data: original });
    expect(parseResult(await read('search').handler({ query: 'rail' }))).toEqual({
      data: [original],
    });
    expect(await create(createUploadTokenStore())).not.toHaveProperty('uploadUrl');
    expect(
      (await documentsDispatchUploadTool().handler({ operationId: uploadInput.operationId }))
        .isError
    ).not.toBe(true);
    expect((await send(minted['uploadUrl'])).status).toBe(404);
    expect(owner.contentWrites).toBe(1);
    expect(owner.posts).toBe(1);
    expect(owner.legacyPosts).toBe(0);
    expect(owner.createBodies).toEqual([uploadInput, uploadInput]);
  }
);

it('recovers admitted content after a refused dispatch using owner proof and explicit same-ID dispatch', async () => {
  owner.refuseDispatch = true;
  const minted = await create();
  expect((await send(minted['uploadUrl'])).status).toBe(502);
  expect(owner.posts).toBe(0);
  expect(parseResult(await status())).toMatchObject({
    data: { state: 'admitted', input: uploadInput },
  });
  expect(await create(createUploadTokenStore())).not.toHaveProperty('uploadUrl');
  owner.refuseDispatch = false;
  const dispatched = await documentsDispatchUploadTool().handler({
    operationId: uploadInput.operationId,
  });
  expect(dispatched.isError).not.toBe(true);
  expect(parseResult(dispatched)).toMatchObject({
    input: uploadInput,
    state: 'accepted',
    taskId: 'owner-ingestion',
  });
  await documentsDispatchUploadTool().handler({ operationId: uploadInput.operationId });
  expect(parseResult(await status())).toMatchObject({
    data: { state: 'accepted', input: uploadInput },
  });
  expect(owner.contentWrites).toBe(1);
  expect(owner.posts).toBe(1);
  expect(owner.legacyPosts).toBe(0);
});

it('keeps real owner service-account refusals distinct from successful durable proof', async () => {
  configureServerSdk({ apiKey: 'wrong-fixture' });
  const result = await documentsCreateUploadTool(tokens).handler(uploadInput, {
    publicBaseUrl: state.origin,
  });
  expect(result.isError).toBe(true);
  expect(result.content).toContainEqual({
    type: 'text',
    text: expect.stringContaining('documents.write.createUpload'),
  });
  expect(owner.createBodies).toEqual([]);
  expect(owner.posts).toBe(0);
});
