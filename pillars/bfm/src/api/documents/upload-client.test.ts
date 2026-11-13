import { once } from 'node:events';
import { createServer } from 'node:http';

import { describe, expect, it } from 'vitest';

import { SERVICE_ACCOUNT_HEADER } from '@pops/pillar-sdk/server';

import { createMobileDocumentsUploadClient } from './upload-client.js';

import type { Server } from 'node:http';

async function listen(server: Server): Promise<string> {
  await once(server.listen(0, '127.0.0.1'), 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Expected TCP');
  return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
}
function request() {
  return {
    query: { fileName: 'ticket original.pdf', title: 'Source' },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('%PDF'));
        controller.close();
      },
    }),
    contentType: 'application/pdf',
    signal: new AbortController().signal,
  };
}
describe('Documents ingest real HTTP boundary', () => {
  it.each([301, 302, 303, 307, 308])(
    'never follows cross-owner redirect%s or transfers credentials',
    async (status) => {
      let foreignRequests = 0;
      const foreign = createServer((_req, res) => {
        foreignRequests++;
        res.writeHead(202, { 'content-type': 'application/json' });
        res.end('{"data":{"taskId":"forged"}}');
      });
      const foreignURL = await listen(foreign);
      let posts = 0;
      let authorized = false;
      const owner = createServer(async (req, res) => {
        let bytes = 0;
        for await (const chunk of req) {
          if (!(chunk instanceof Buffer)) throw new Error('Expected bytes');
          bytes += chunk.byteLength;
        }
        expect(bytes).toBe(4);
        posts++;
        authorized = Boolean(req.headers[SERVICE_ACCOUNT_HEADER.toLowerCase()]);
        res.writeHead(status, { location: foreignURL });
        res.end();
      });
      const ownerURL = await listen(owner);
      try {
        const client = createMobileDocumentsUploadClient({
          discovery: { lookup: () => Promise.resolve({ baseUrl: ownerURL }) },
          apiKey: () => 'pops_sa_test_fixture',
        });
        const outcome = await client.upload(request());
        expect(outcome.kind).toBe('response');
        if (outcome.kind === 'response') {
          expect(outcome.response.status).toBe(status);
          await outcome.response.body?.cancel();
        }
        expect(posts).toBe(1);
        expect(authorized).toBe(true);
        expect(foreignRequests).toBe(0);
      } finally {
        await close(owner);
        await close(foreign);
      }
    }
  );
  it('also refuses same-origin redirect without another POST or receipt', async () => {
    const paths: string[] = [];
    const owner = createServer(async (req, res) => {
      for await (const chunk of req) {
        if (!(chunk instanceof Buffer)) throw new Error('Expected bytes');
      }
      paths.push(req.url ?? '');
      res.writeHead(307, { location: '/redirected-upload' });
      res.end();
    });
    const url = await listen(owner);
    try {
      const client = createMobileDocumentsUploadClient({
        discovery: { lookup: () => Promise.resolve({ baseUrl: url }) },
        apiKey: () => 'pops_sa_test_fixture',
      });
      const outcome = await client.upload(request());
      expect(outcome.kind).toBe('response');
      if (outcome.kind === 'response') {
        expect(outcome.response.status).toBe(307);
        await outcome.response.body?.cancel();
      }
      expect(paths).toEqual(['/paperless/documents?fileName=ticket+original.pdf&title=Source']);
    } finally {
      await close(owner);
    }
  });
  it('sends exact metadata/body once, accepts owner202 and does not replay a lost response', async () => {
    const calls: { method: string | undefined; path: string | undefined; body: string }[] = [];
    const owner = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        if (!(chunk instanceof Buffer)) throw new Error('Expected bytes');
        chunks.push(chunk);
      }
      calls.push({ method: req.method, path: req.url, body: Buffer.concat(chunks).toString() });
      if (calls.length === 2) {
        req.socket.destroy();
        return;
      }
      res.writeHead(202, { 'content-type': 'application/json' });
      res.end('{"data":{"taskId":"accepted_task"}}');
    });
    const url = await listen(owner);
    try {
      const client = createMobileDocumentsUploadClient({
        discovery: { lookup: () => Promise.resolve({ baseUrl: url }) },
        apiKey: () => 'pops_sa_test_fixture',
      });
      const accepted = await client.upload(request());
      expect(accepted.kind).toBe('response');
      if (accepted.kind === 'response')
        expect(await accepted.response.json()).toEqual({ data: { taskId: 'accepted_task' } });
      expect(await client.upload(request())).toEqual({ kind: 'unknown' });
      expect(calls).toHaveLength(2);
      expect(calls[0]).toEqual({
        method: 'POST',
        path: '/paperless/documents?fileName=ticket+original.pdf&title=Source',
        body: '%PDF',
      });
    } finally {
      await close(owner);
    }
  });
  it('does not dispatch with missing discovery, credential or an already aborted request', async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = () => {
      calls++;
      return Promise.resolve(new Response());
    };
    const configured = {
      discovery: { lookup: () => Promise.resolve({ baseUrl: 'http://owner.test' }) },
      fetchImpl,
      apiKey: () => 'pops_sa_test_fixture',
    };
    expect(
      await createMobileDocumentsUploadClient({ ...configured, apiKey: () => undefined }).upload(
        request()
      )
    ).toEqual({ kind: 'not-sent' });
    expect(
      await createMobileDocumentsUploadClient({
        ...configured,
        discovery: { lookup: () => Promise.resolve(undefined) },
      }).upload(request())
    ).toEqual({ kind: 'not-sent' });
    const input = request();
    const controller = new AbortController();
    controller.abort();
    expect(
      await createMobileDocumentsUploadClient(configured).upload({
        ...input,
        signal: controller.signal,
      })
    ).toEqual({ kind: 'not-sent' });
    expect(calls).toBe(0);
  });
});
