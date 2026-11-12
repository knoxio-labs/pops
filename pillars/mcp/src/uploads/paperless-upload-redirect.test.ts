import { once } from 'node:events';
import { createServer } from 'node:http';

import express from 'express';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createPillarErrorHandlers } from '@pops/pillar-express';
import { SERVICE_ACCOUNT_HEADER } from '@pops/pillar-sdk/server';

import { createPaperlessUploadIntents } from './paperless-upload-intents.js';
import { createUploadRouter } from './upload-route.js';
import { createUploadTokenStore } from './upload-tokens.js';

import type { Server } from 'node:http';

let servers: Server[];
let ownerOrigin: string;
let foreignOrigin: string;
let gatewayOrigin: string;
let status: number;
let destination: 'foreign' | 'same-owner';
let ownerRequests: { readonly method: string; readonly credentialPresent: boolean }[];
let sameOwnerRedirects: number;
let foreignRequests: { readonly method: string; readonly credentialPresent: boolean }[];
let tokens: ReturnType<typeof createUploadTokenStore>;
let intents: ReturnType<typeof createPaperlessUploadIntents>;

function origin(server: Server): string {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No listener address');
  return `http://127.0.0.1:${address.port}`;
}
async function listen(server: Server): Promise<string> {
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return origin(server);
}
function ownerServer(): Server {
  return createServer(async (req, res) => {
    for await (const chunk of req) {
      if (!(chunk instanceof Uint8Array)) throw new Error('Expected fictional byte chunks');
    }
    if (req.url === '/redirected') {
      sameOwnerRedirects++;
      res.writeHead(202, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: { taskId: 'redirected-task' } }));
      return;
    }
    ownerRequests.push({
      method: req.method ?? '',
      credentialPresent: req.headers[SERVICE_ACCOUNT_HEADER] !== undefined,
    });
    if (status === 202) {
      res.writeHead(202, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: { taskId: 'owner-task' } }));
    } else {
      res.writeHead(status, {
        location: `${destination === 'foreign' ? foreignOrigin : ownerOrigin}/redirected`,
      });
      res.end();
    }
  });
}
beforeEach(async () => {
  servers = [];
  ownerRequests = [];
  sameOwnerRedirects = 0;
  foreignRequests = [];
  status = 202;
  destination = 'foreign';
  tokens = createUploadTokenStore();
  intents = createPaperlessUploadIntents();
  foreignOrigin = await listen(
    createServer((req, res) => {
      foreignRequests.push({
        method: req.method ?? '',
        credentialPresent: req.headers[SERVICE_ACCOUNT_HEADER] !== undefined,
      });
      req.resume();
      res.writeHead(202, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: { taskId: 'foreign-task' } }));
    })
  );
  ownerOrigin = await listen(ownerServer());
  const app = express();
  const errors = createPillarErrorHandlers({ pillar: 'mcp', logger: { error: vi.fn() } });
  app.use(errors.requestId);
  app.use(
    '/uploads',
    createUploadRouter({
      tokens,
      paperlessIntents: intents,
      documents: {
        apiKey: () => 'synthetic-test-credential',
        discovery: { lookup: async () => ({ baseUrl: ownerOrigin }) },
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
});
function mint(): { uploadId: string; url: string } {
  const uploadId = intents.create();
  if (!uploadId) throw new Error('No receipt');
  const grant = tokens.mint({
    kind: 'paperless-document',
    uploadId,
    fileName: 'fixture.pdf',
    maxBytes: 64,
    allowedMimeTypes: ['application/pdf'],
  });
  if (!grant) throw new Error('No upload URL');
  return { uploadId, url: `${gatewayOrigin}/uploads/${grant.token}` };
}
function put(url: string): Promise<Response> {
  return fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/pdf' },
    body: 'fictional document bytes',
  });
}
it.each([301, 302, 303, 307, 308])(
  'does not follow owner HTTP%s to a foreign origin, expose credentials, accept foreign proof or replay POST',
  async (redirect) => {
    status = redirect;
    const { uploadId, url } = mint();
    const reply = await put(url);
    expect(reply.status).toBe(502);
    expect(await reply.json()).toMatchObject({
      code: 'mcp.upload.outcome_unknown',
      retryable: false,
    });
    expect(foreignRequests).toEqual([]);
    expect(sameOwnerRedirects).toBe(0);
    expect(intents.read(uploadId)).toMatchObject({ state: 'unknown' });
    expect((await put(url)).status).toBe(404);
    expect(ownerRequests).toEqual([{ method: 'POST', credentialPresent: true }]);
  }
);
it.each([301, 302, 303, 307, 308])(
  'does not reinterpret same-owner HTTP%s as the raw route published202 receipt',
  async (redirect) => {
    status = redirect;
    destination = 'same-owner';
    const { uploadId, url } = mint();
    expect((await put(url)).status).toBe(502);
    expect(intents.read(uploadId)).toMatchObject({ state: 'unknown' });
    expect(sameOwnerRedirects).toBe(0);
    expect(foreignRequests).toEqual([]);
    expect(ownerRequests).toEqual([{ method: 'POST', credentialPresent: true }]);
  }
);
it('retains an actual initial-owner202 task and refuses another PUT without sending more bytes', async () => {
  const { uploadId, url } = mint();
  expect((await put(url)).status).toBe(202);
  expect(intents.read(uploadId)).toEqual({ state: 'accepted', taskId: 'owner-task' });
  expect((await put(url)).status).toBe(404);
  expect(ownerRequests).toEqual([{ method: 'POST', credentialPresent: true }]);
  expect(sameOwnerRedirects).toBe(0);
  expect(foreignRequests).toEqual([]);
});

it.each<[number, 'foreign' | 'same-owner']>([
  [303, 'foreign'],
  [307, 'foreign'],
  [303, 'same-owner'],
  [307, 'same-owner'],
])(
  'keeps legacy Inventory HTTP%s redirect to%s unknown with no retry instruction or forwarded credential',
  async (redirect, next) => {
    status = redirect;
    destination = next;
    const grant = tokens.mint({
      kind: 'document',
      itemId: 'fictional-item',
      documentType: 'manual',
      fileName: 'fixture.pdf',
      maxBytes: 64,
      allowedMimeTypes: ['application/pdf'],
    });
    if (!grant) throw new Error('No legacy URL');
    const url = `${gatewayOrigin}/uploads/${grant.token}`;
    const reply = await put(url);
    expect(reply.status).toBe(502);
    expect(await reply.json()).toMatchObject({
      code: 'mcp.upload.outcome_unknown',
      retryable: false,
    });
    expect(foreignRequests).toEqual([]);
    expect(sameOwnerRedirects).toBe(0);
    expect((await put(url)).status).toBe(404);
    expect(ownerRequests).toEqual([{ method: 'POST', credentialPresent: true }]);
  }
);
