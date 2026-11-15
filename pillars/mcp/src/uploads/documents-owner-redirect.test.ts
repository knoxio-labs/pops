import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

import express from 'express';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createPillarErrorHandlers } from '@pops/pillar-express';
import { __resetSharedOpenApiCache, __resetSharedPillarClient } from '@pops/pillar-sdk/client';
import {
  __resetServerPillarCache,
  __resetServerSdkConfig,
  configureServerSdk,
  SERVICE_ACCOUNT_HEADER,
} from '@pops/pillar-sdk/server';

import { contractInputs } from '../contract-inputs.js';
import { documentsOwnerReadTools } from '../tools/documents-owner-read.js';
import {
  documentsCreateUploadTool,
  documentsDispatchUploadTool,
} from '../tools/documents-owner-upload.js';
import { createUploadRouter } from './upload-route.js';
import { createUploadTokenStore } from './upload-tokens.js';

import type { IncomingMessage, Server, ServerResponse } from 'node:http';

import type { DiscoveryTransport } from '@pops/pillar-sdk/client';
import type { PillarHandle, ServerPillarOptions } from '@pops/pillar-sdk/server';

const discovery = vi.hoisted(() => ({ origin: '' }));
vi.mock('../pillar-client.js', async () => {
  const { pillar } = await import('@pops/pillar-sdk/server');
  const transport: DiscoveryTransport = {
    fetchSnapshot: async () => [
      {
        pillarId: 'documents',
        baseUrl: discovery.origin,
        status: 'healthy',
        registered: true,
        lastSeenAt: '2026-11-14T00:00:00Z',
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
      if (id !== 'documents') throw new Error('Unexpected nonowner pillar');
      return pillar<TRouter>(id, { ...options, transport });
    },
  };
});

type Operation = 'create' | 'dispatch' | 'status' | 'content';
type Destination = 'same-owner' | 'foreign';
type State = 'awaiting_content' | 'admitted' | 'accepted' | 'outcome_unknown';
const bytes = 'PDF';
const input = {
  operationId: '0c8c5b6e-2817-4f70-98f9-0f5f274f9e1c',
  fileName: 'fictional.pdf',
  title: 'Fictional original',
  mimeType: 'application/pdf',
  byteLength: Buffer.byteLength(bytes),
  sha256: createHash('sha256').update(bytes).digest('hex'),
};
let servers: Server[];
let tokens: ReturnType<typeof createUploadTokenStore>;
let redirectOperation: Operation;
let redirectDestination: Destination;
let redirectStatus: 303 | 307;
let foreignOrigin: string;
let gatewayOrigin: string;
let durableState: State;
let counts: Record<Operation, number>;
let ownerCredentials: boolean[];
let destinationRequests: number;
let destinationCredentials: boolean;
let createBody: unknown;

function record(state: State) {
  return {
    input,
    ownerMatches: true,
    state,
    contentAvailable: state === 'admitted' || state === 'accepted',
    taskId: state === 'accepted' ? 'owner-task-proof' : null,
    documentId: null,
    reason: null,
    ...(state === 'outcome_unknown' ? { blockedBy: 'dispatch_unproven' } : {}),
  };
}
function json(response: ServerResponse, value: unknown): void {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}
function destination(request: IncomingMessage, response: ServerResponse): void {
  destinationRequests++;
  destinationCredentials ||= request.headers[SERVICE_ACCOUNT_HEADER] !== undefined;
  request.resume();
  json(response, { data: record(redirectOperation === 'content' ? 'admitted' : 'accepted') });
}
async function listen(server: Server): Promise<string> {
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing local listener');
  return `http://127.0.0.1:${address.port}`;
}
function operation(request: IncomingMessage): Operation | undefined {
  const path = request.url?.split('?', 1)[0];
  if (request.method === 'POST' && path === '/paperless/uploads') return 'create';
  if (request.method === 'POST' && path === `/paperless/uploads/${input.operationId}/dispatch`)
    return 'dispatch';
  if (request.method === 'GET' && path === `/paperless/uploads/${input.operationId}`)
    return 'status';
  if (request.method === 'PUT' && path === `/paperless/uploads/${input.operationId}/content`)
    return 'content';
  return undefined;
}
async function owner(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.url === '/openapi') {
    const document: unknown = JSON.parse(readFileSync(contractInputs.documents, 'utf8'));
    json(response, document);
    return;
  }
  if (request.url === '/redirected') return destination(request, response);
  const selected = operation(request);
  if (!selected) {
    request.resume();
    response.writeHead(404);
    response.end();
    return;
  }
  counts[selected]++;
  ownerCredentials.push(request.headers[SERVICE_ACCOUNT_HEADER] !== undefined);
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    if (!(chunk instanceof Uint8Array)) throw new Error('Unexpected HTTP byte chunk');
    chunks.push(chunk);
  }
  if (selected === 'create') createBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (selected === redirectOperation) {
    if (selected === 'content') durableState = 'outcome_unknown';
    response.writeHead(redirectStatus, {
      location: `${redirectDestination === 'foreign' ? foreignOrigin : discovery.origin}/redirected`,
    });
    response.end();
    return;
  }
  if (selected === 'dispatch') durableState = 'accepted';
  json(response, { data: record(durableState) });
}

beforeEach(async () => {
  servers = [];
  tokens = createUploadTokenStore();
  redirectOperation = 'create';
  redirectDestination = 'foreign';
  redirectStatus = 307;
  durableState = 'awaiting_content';
  counts = { create: 0, dispatch: 0, status: 0, content: 0 };
  ownerCredentials = [];
  destinationRequests = 0;
  destinationCredentials = false;
  createBody = undefined;
  configureServerSdk({ apiKey: 'fixture' });
  foreignOrigin = await listen(createServer(destination));
  discovery.origin = await listen(
    createServer((request, response) => {
      void owner(request, response).catch(() => {
        response.writeHead(500);
        response.end();
      });
    })
  );
  const app = express();
  const errors = createPillarErrorHandlers({ pillar: 'mcp', logger: { error: vi.fn() } });
  app.use(errors.requestId);
  app.use(
    '/uploads',
    createUploadRouter({
      tokens,
      documents: {
        apiKey: () => 'fixture',
        discovery: { lookup: async () => ({ baseUrl: discovery.origin }) },
      },
    })
  );
  app.use(errors.final);
  gatewayOrigin = await listen(createServer(app));
});
afterEach(async () => {
  await Promise.all(
    servers.map(async (server) => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    })
  );
  __resetServerPillarCache();
  __resetServerSdkConfig();
  __resetSharedPillarClient();
  __resetSharedOpenApiCache();
});

function uploadStatus() {
  const tool = documentsOwnerReadTools.find((value) => value.name === 'documents.uploadStatus');
  if (!tool) throw new Error('Missing canonical upload status tool');
  return tool.handler({ operationId: input.operationId });
}
function text(value: Awaited<ReturnType<typeof uploadStatus>>): string {
  return value.content
    .filter((entry) => entry.type === 'text')
    .map((entry) => entry.text)
    .join('\n');
}
function noRedirectLeak(): void {
  expect(destinationRequests).toBe(0);
  expect(destinationCredentials).toBe(false);
  expect(ownerCredentials.length).toBeGreaterThan(0);
  expect(ownerCredentials.every(Boolean)).toBe(true);
}
const redirects = (['same-owner', 'foreign'] as const).flatMap((target) =>
  ([303, 307] as const).map((status) => ({ target, status }))
);
const jsonRedirects = redirects.flatMap((redirect) =>
  (['create', 'dispatch', 'status'] as const).map((selected) => ({ ...redirect, selected }))
);

it.each(jsonRedirects)(
  'rejects actual SDK $selected HTTP$status redirect to $target without accepting destination proof',
  async ({ target, status, selected }) => {
    redirectOperation = selected;
    redirectDestination = target;
    redirectStatus = status;
    if (selected === 'dispatch') durableState = 'admitted';
    let result: Awaited<ReturnType<typeof uploadStatus>>;
    if (selected === 'create')
      result = await documentsCreateUploadTool(tokens).handler(input, {
        publicBaseUrl: gatewayOrigin,
      });
    else if (selected === 'dispatch')
      result = await documentsDispatchUploadTool().handler({ operationId: input.operationId });
    else result = await uploadStatus();
    expect(result.isError).toBe(true);
    expect(text(result)).not.toContain('owner-task-proof');
    expect(text(result)).not.toContain('uploadUrl');
    expect(counts).toEqual({
      create: selected === 'create' ? 1 : 0,
      dispatch: selected === 'dispatch' ? 1 : 0,
      status: selected === 'status' ? 1 : 0,
      content: 0,
    });
    if (selected === 'create') expect(createBody).toEqual(input);
    noRedirectLeak();
  }
);

it.each(redirects)(
  'keeps streamed Documents HTTP$status redirect to $target unknown with no dispatch or byte replay',
  async ({ target, status }) => {
    redirectOperation = 'content';
    redirectDestination = target;
    redirectStatus = status;
    const minted = await documentsCreateUploadTool(tokens).handler(input, {
      publicBaseUrl: gatewayOrigin,
    });
    expect(minted.isError).not.toBe(true);
    const value: unknown = JSON.parse(text(minted));
    if (
      typeof value !== 'object' ||
      value === null ||
      !('uploadUrl' in value) ||
      typeof value.uploadUrl !== 'string'
    )
      throw new Error('Missing owner-qualified upload URL');
    const response = await fetch(value.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': input.mimeType },
      body: bytes,
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      code: 'mcp.upload.outcome_unknown',
      retryable: false,
    });
    expect(counts.content).toBe(1);
    expect(counts.dispatch).toBe(0);
    const proof = await uploadStatus();
    expect(proof.isError).not.toBe(true);
    expect(JSON.parse(text(proof))).toMatchObject({
      data: { state: 'outcome_unknown', taskId: null },
    });
    const resumed = await documentsCreateUploadTool(tokens).handler(input, {
      publicBaseUrl: gatewayOrigin,
    });
    expect(resumed.isError).not.toBe(true);
    expect(JSON.parse(text(resumed))).not.toHaveProperty('uploadUrl');
    expect(JSON.parse(text(resumed))).toMatchObject({
      upload: { state: 'outcome_unknown', taskId: null },
    });
    expect(
      (
        await fetch(value.uploadUrl, {
          method: 'PUT',
          headers: { 'content-type': input.mimeType },
          body: bytes,
        })
      ).status
    ).toBe(404);
    expect(counts).toEqual({ create: 2, dispatch: 0, status: 1, content: 1 });
    expect(createBody).toEqual(input);
    noRedirectLeak();
  }
);
