import { once } from 'node:events';
import { createServer, request } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { createMobileDocumentsUploadClient } from '../documents/upload-client.js';
import { closeOpenedApps, openWithOptions } from './mobile-inventory-app.js';

import type { ClientRequest, Server } from 'node:http';

import type { MobileDocumentsClient } from '../documents/client.js';

class Barrier {
  private notify: () => void = () => {
    throw new Error('Barrier not initialized');
  };
  readonly reached = new Promise<void>((resolve) => {
    this.notify = resolve;
  });
  open(): void {
    this.notify();
  }
}
async function listen(server: Server): Promise<string> {
  await once(server.listen(0, '127.0.0.1'), 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Expected TCP listener');
  return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
}
function documents(maxUploadBytes = 4): MobileDocumentsClient {
  return {
    status: () =>
      Promise.resolve({
        kind: 'ok',
        value: {
          configured: true,
          available: true,
          maxUploadBytes,
          allowedMimeTypes: ['application/pdf', 'image/*', 'text/*'],
        },
      }),
    task: () =>
      Promise.resolve({ kind: 'ok', value: { state: 'pending', documentId: null, reason: null } }),
    getDocument: () => Promise.resolve({ kind: 'not-found', pillar: 'documents', status: 404 }),
  };
}
function completion(client: ClientRequest) {
  return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    client.once('error', reject);
    client.once('response', (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: unknown) => {
        if (chunk instanceof Buffer) chunks.push(chunk);
        else reject(new Error('Expected response bytes'));
      });
      response.once('error', reject);
      response.once('end', () => {
        try {
          const body: unknown = JSON.parse(Buffer.concat(chunks).toString());
          resolve({ status: response.statusCode ?? 0, body });
        } catch (error) {
          reject(error);
        }
      });
    });
  }).then(
    (value) => ({ kind: 'response' as const, value }),
    (error: unknown) => ({ kind: 'error' as const, error })
  );
}
async function appFor(ownerURL: string, maxUploadBytes = 4) {
  const { app, token } = openWithOptions(
    {
      documents: documents(maxUploadBytes),
      documentUploads: createMobileDocumentsUploadClient({
        discovery: { lookup: () => Promise.resolve({ baseUrl: ownerURL }) },
        apiKey: () => 'pops_sa_test_fixture',
      }),
    },
    ['documents.upload']
  );
  const server = createServer(app);
  return { server, url: await listen(server), token };
}
function upload(url: string, token: string, mime = 'application/pdf') {
  return request(`${url}/mobile/documents?fileName=original`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': mime,
      'Transfer-Encoding': 'chunked',
    },
  });
}
afterEach(closeOpenedApps);
describe('Documents ingest actual inbound stream and default fetch', () => {
  it('caps chunked bytes before forwarding the excess and returns an unconfirmed outcome without replay', async () => {
    const first = new Barrier();
    const aborted = new Barrier();
    let posts = 0;
    let ownerBytes = 0;
    const owner = createServer((req, res) => {
      posts++;
      req.on('data', (chunk: unknown) => {
        if (!(chunk instanceof Buffer)) throw new Error('Expected upload bytes');
        ownerBytes += chunk.byteLength;
        first.open();
      });
      req.once('aborted', () => aborted.open());
      req.on('error', () => aborted.open());
      req.once('end', () => {
        res.writeHead(202, { 'content-type': 'application/json' });
        res.end('{"data":{"taskId":"unexpected_complete"}}');
      });
    });
    const ownerURL = await listen(owner);
    const app = await appFor(ownerURL);
    const client = upload(app.url, app.token);
    const terminal = completion(client);
    try {
      client.write('%PDF');
      await first.reached;
      client.end('x');
      const result = await terminal;
      expect(result.kind).toBe('response');
      if (result.kind === 'response') {
        expect(result.value.status).toBe(502);
        expect(result.value.body).toMatchObject({
          code: 'bfm.documents.upload_outcome_unknown',
          retryable: false,
        });
      }
      await aborted.reached;
      expect(ownerBytes).toBe(4);
      expect(posts).toBe(1);
    } finally {
      client.destroy();
      await terminal;
      await close(app.server);
      await close(owner);
    }
  });
  it('aborts the one owner stream when the phone disconnects during upload', async () => {
    const first = new Barrier();
    const aborted = new Barrier();
    let posts = 0;
    let ownerBytes = 0;
    const owner = createServer((req) => {
      posts++;
      req.on('data', (chunk: unknown) => {
        if (!(chunk instanceof Buffer)) throw new Error('Expected upload bytes');
        ownerBytes += chunk.byteLength;
        first.open();
      });
      req.once('aborted', () => aborted.open());
      req.on('error', () => aborted.open());
    });
    const ownerURL = await listen(owner);
    const app = await appFor(ownerURL, 8);
    const client = upload(app.url, app.token);
    const terminal = completion(client);
    try {
      client.write('%PDF');
      await first.reached;
      client.destroy();
      expect((await terminal).kind).toBe('error');
      await aborted.reached;
      expect(ownerBytes).toBe(4);
      expect(posts).toBe(1);
    } finally {
      client.destroy();
      await terminal;
      await close(app.server);
      await close(owner);
    }
  });
  it.each(['disconnect', 'truncated202'])(
    'does not retry or acknowledge a late owner%s after receiving the whole file',
    async (mode) => {
      let posts = 0;
      let ownerBytes = 0;
      const owner = createServer((req, res) => {
        posts++;
        req.on('data', (chunk: unknown) => {
          if (!(chunk instanceof Buffer)) throw new Error('Expected upload bytes');
          ownerBytes += chunk.byteLength;
        });
        req.once('end', () => {
          if (mode === 'truncated202') {
            res.writeHead(202, { 'content-type': 'application/json', 'content-length': '99' });
            res.write('{"data":');
          }
          req.socket.destroy();
        });
      });
      const ownerURL = await listen(owner);
      const app = await appFor(ownerURL);
      const client = upload(app.url, app.token);
      const terminal = completion(client);
      try {
        client.end('%PDF');
        const result = await terminal;
        expect(result.kind).toBe('response');
        if (result.kind === 'response') {
          expect(result.value.status).toBe(502);
          expect(result.value.body).toMatchObject({
            code: 'bfm.documents.upload_outcome_unknown',
            retryable: false,
          });
        }
        expect(posts).toBe(1);
        expect(ownerBytes).toBe(4);
      } finally {
        client.destroy();
        await terminal;
        await close(app.server);
        await close(owner);
      }
    }
  );
  it.each(['image/png', 'text/plain', 'APPLICATION/PDF; charset=binary'])(
    'retains owner202 through the real stream for%s',
    async (mime) => {
      let posts = 0;
      let contentType: string | undefined;
      let ownerBytes = 0;
      const owner = createServer((req, res) => {
        posts++;
        contentType = req.headers['content-type'];
        req.on('data', (chunk: unknown) => {
          if (!(chunk instanceof Buffer)) throw new Error('Expected upload bytes');
          ownerBytes += chunk.byteLength;
        });
        req.once('end', () => {
          res.writeHead(202, { 'content-type': 'application/json' });
          res.end('{"data":{"taskId":"accepted_1"}}');
        });
      });
      const ownerURL = await listen(owner);
      const app = await appFor(ownerURL);
      const client = upload(app.url, app.token, mime);
      const terminal = completion(client);
      try {
        client.end('%PDF');
        const result = await terminal;
        expect(result).toEqual({
          kind: 'response',
          value: { status: 202, body: { taskId: 'accepted_1' } },
        });
        expect(contentType).toBe(mime.split(';')[0]?.trim().toLowerCase());
        expect(ownerBytes).toBe(4);
        expect(posts).toBe(1);
      } finally {
        client.destroy();
        await terminal;
        await close(app.server);
        await close(owner);
      }
    }
  );
});
