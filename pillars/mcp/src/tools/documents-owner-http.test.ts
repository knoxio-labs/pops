import { readFileSync } from 'node:fs';

import express from 'express';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createPillarErrorHandlers } from '@pops/pillar-express';
import {
  __resetServerPillarCache,
  __resetServerSdkConfig,
  configureServerSdk,
} from '@pops/pillar-sdk/server';

import { contractInputs } from '../contract-inputs.js';
import { createPaperlessUploadIntents } from '../uploads/paperless-upload-intents.js';
import { createUploadRouter } from '../uploads/upload-route.js';
import { createUploadTokenStore } from '../uploads/upload-tokens.js';
import { documentsOwnerReadTools } from './documents-owner-read.js';
import { documentsCreateUploadTool, documentsUploadStatusTool } from './documents-owner-upload.js';
import { parseResult } from './test-helpers.js';

import type { Server } from 'node:http';

import type { DiscoveryTransport } from '@pops/pillar-sdk/client';

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
    getPillar: (id: string) => {
      if (id !== 'documents') throw new Error('Unexpected nonowner call');
      return pillar(id, { transport });
    },
  };
});
let server: Server;
let taskState: 'pending' | 'done' | 'duplicate';
let posts: number;
let originalBytes: Buffer;
const original = {
  id: 91,
  title: 'Rail original',
  created: '2026-11-12',
  originalFileName: 'rail.pdf',
  thumbnailUrl: '/91/thumb',
};
const policy = {
  configured: true,
  available: true,
  baseUrl: null,
  documentCount: 1,
  maxUploadBytes: 47,
  allowedMimeTypes: ['application/pdf'],
};
let tokens: ReturnType<typeof createUploadTokenStore>;
let intents: ReturnType<typeof createPaperlessUploadIntents>;
function fixture(): express.Express {
  const app = express();
  app.get('/openapi', (_req, res) =>
    res.json(JSON.parse(readFileSync(contractInputs.documents, 'utf8')))
  );
  app.use('/paperless', (req, res, next) => {
    if (req.get('x-api-key') === 'fixture') next();
    else
      res.status(403).json({
        code: 'documents.auth.forbidden',
        message: 'Forbidden',
        requestId: 'fixture',
        retryable: false,
      });
  });
  app.get('/paperless/status', (_req, res) => res.json({ data: policy }));
  app.get('/paperless/search', (_req, res) => res.json({ data: [original] }));
  app.get('/paperless/documents/:id', (_req, res) => res.json({ data: original }));
  app.get('/paperless/tasks/:taskId', (_req, res) =>
    res.json({
      data: { state: taskState, documentId: taskState === 'pending' ? null : 91, reason: null },
    })
  );
  app.post('/paperless/documents', express.raw({ type: 'application/pdf' }), (req, res) => {
    posts++;
    if (!Buffer.isBuffer(req.body)) throw new Error('Expected streamed bytes');
    originalBytes = req.body;
    expect(req.query).toEqual({ fileName: 'rail.pdf', title: 'Rail original' });
    res.status(202).json({ data: { taskId: 'owner-ingestion' } });
  });
  const errors = createPillarErrorHandlers({ pillar: 'mcp' });
  app.use(errors.requestId);
  app.use(
    '/uploads',
    createUploadRouter({
      tokens,
      paperlessIntents: intents,
      documents: {
        discovery: { lookup: async () => ({ baseUrl: state.origin }) },
        apiKey: () => 'fixture',
      },
    })
  );
  app.use(errors.final);
  return app;
}
beforeEach(async () => {
  tokens = createUploadTokenStore();
  intents = createPaperlessUploadIntents();
  taskState = 'pending';
  posts = 0;
  originalBytes = Buffer.alloc(0);
  configureServerSdk({ apiKey: 'fixture' });
  await new Promise<void>((resolve) => {
    server = fixture().listen(0, '127.0.0.1', () => resolve());
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
});
function read(name: string) {
  const tool = documentsOwnerReadTools.find((entry) => entry.name === `documents.${name}`);
  if (!tool) throw new Error('No read tool');
  return tool;
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error('No object');
  return Object.fromEntries(Object.entries(value));
}
it.each(['done', 'duplicate'] as const)(
  'crosses actual SDK/HTTP and streamed URL, retaining task/original identity through %s without an Inventory target',
  async (completed) => {
    const minted = object(
      parseResult(
        await documentsCreateUploadTool(tokens, intents).handler(
          { fileName: 'rail.pdf', title: 'Rail original' },
          { publicBaseUrl: state.origin }
        )
      )
    );
    if (typeof minted['uploadUrl'] !== 'string' || typeof minted['uploadId'] !== 'string')
      throw new Error('No upload identities');
    const bytes = Buffer.from('%PDF-fictional-test');
    const reply = await fetch(minted['uploadUrl'], {
      method: 'PUT',
      headers: { 'content-type': 'application/pdf' },
      body: bytes,
    });
    expect(reply.status).toBe(202);
    expect(originalBytes).toEqual(bytes);
    expect(
      parseResult(
        await documentsUploadStatusTool(intents).handler({ uploadId: minted['uploadId'] })
      )
    ).toMatchObject({ state: 'accepted', taskId: 'owner-ingestion' });
    expect(parseResult(await read('task').handler({ taskId: 'owner-ingestion' }))).toEqual({
      data: { state: 'pending', documentId: null, reason: null },
    });
    taskState = completed;
    expect(parseResult(await read('task').handler({ taskId: 'owner-ingestion' }))).toEqual({
      data: { state: completed, documentId: 91, reason: null },
    });
    expect(parseResult(await read('get').handler({ id: 91 }))).toEqual({ data: original });
    expect(parseResult(await read('search').handler({ query: 'rail' }))).toEqual({
      data: [original],
    });
    expect((await fetch(minted['uploadUrl'], { method: 'PUT', body: bytes })).status).toBe(404);
    expect(posts).toBe(1);
  }
);
