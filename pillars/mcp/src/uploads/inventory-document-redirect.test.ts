import { once } from 'node:events';
import { createServer } from 'node:http';

import express from 'express';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createPillarErrorHandlers } from '@pops/pillar-express';
import { SERVICE_ACCOUNT_HEADER } from '@pops/pillar-sdk/server';

import { createUploadRouter } from './upload-route.js';
import { createUploadTokenStore } from './upload-tokens.js';

import type { Server } from 'node:http';

let servers: Server[];
let ownerOrigin: string;
let foreignOrigin: string;
let gatewayOrigin: string;
let redirectStatus: number;
let redirectTarget: 'foreign' | 'same-owner';
let ownerRequests: number;
let ownerCredentials: boolean;
let destinationRequests: number;
let tokens: ReturnType<typeof createUploadTokenStore>;

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

beforeEach(async () => {
  servers = [];
  redirectStatus = 307;
  redirectTarget = 'foreign';
  ownerRequests = 0;
  ownerCredentials = false;
  destinationRequests = 0;
  tokens = createUploadTokenStore();
  foreignOrigin = await listen(
    createServer((req, res) => {
      destinationRequests++;
      req.resume();
      res.writeHead(202, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: { taskId: 'redirected-task' } }));
    })
  );
  ownerOrigin = await listen(
    createServer((req, res) => {
      ownerRequests++;
      ownerCredentials = req.headers[SERVICE_ACCOUNT_HEADER] !== undefined;
      req.resume();
      res.writeHead(redirectStatus, {
        location: `${redirectTarget === 'foreign' ? foreignOrigin : ownerOrigin}/redirected`,
      });
      res.end();
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

it.each([303, 307] as const)(
  'keeps legacy Inventory document HTTP%s redirects unknown and never forwards the credential',
  async (status) => {
    redirectStatus = status;
    const grant = tokens.mint({
      kind: 'document',
      itemId: 'fixture-item',
      documentType: 'manual',
      fileName: 'fixture.pdf',
      maxBytes: 64,
      allowedMimeTypes: ['application/pdf'],
    });
    if (!grant) throw new Error('No Inventory document URL');
    const reply = await fetch(`${gatewayOrigin}/uploads/${grant.token}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/pdf' },
      body: 'fictional document bytes',
    });
    expect(reply.status).toBe(502);
    expect(await reply.json()).toMatchObject({
      code: 'mcp.upload.outcome_unknown',
      retryable: false,
    });
    expect(ownerRequests).toBe(1);
    expect(ownerCredentials).toBe(true);
    expect(destinationRequests).toBe(0);
    expect((await fetch(`${gatewayOrigin}/uploads/${grant.token}`, { method: 'PUT' })).status).toBe(
      404
    );
  }
);

it.each(['foreign', 'same-owner'] as const)(
  'does not follow a legacy Inventory redirect to the %s origin',
  async (target) => {
    redirectTarget = target;
    const grant = tokens.mint({
      kind: 'document',
      itemId: 'fixture-item',
      documentType: 'manual',
      fileName: 'fixture.pdf',
      maxBytes: 64,
      allowedMimeTypes: ['application/pdf'],
    });
    if (!grant) throw new Error('No Inventory document URL');
    const reply = await fetch(`${gatewayOrigin}/uploads/${grant.token}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/pdf' },
      body: 'fictional document bytes',
    });
    expect(reply.status).toBe(502);
    expect(ownerRequests).toBe(1);
    expect(destinationRequests).toBe(0);
    expect(ownerCredentials).toBe(true);
  }
);
