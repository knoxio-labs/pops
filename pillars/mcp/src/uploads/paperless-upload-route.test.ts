import { createHash } from 'node:crypto';

import express from 'express';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createPillarErrorHandlers } from '@pops/pillar-express';

import { createUploadRouter } from './upload-route.js';
import { createUploadTokenStore } from './upload-tokens.js';

import type { Server } from 'node:http';

const owner = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock('../tools/documents-owner-client.js', () => ({
  documentsOwner: () => ({ write: { dispatchUpload: owner.dispatch } }),
}));

let server: Server;
let origin: string;
let tokens: ReturnType<typeof createUploadTokenStore>;
let upstream: ReturnType<typeof vi.fn<typeof fetch>>;
const input = {
  operationId: '0c8c5b6e-2817-4f70-98f9-0f5f274f9e1c',
  fileName: 'trip.pdf',
  title: 'Trip original',
  mimeType: 'application/pdf',
  byteLength: 3,
  sha256: createHash('sha256').update('PDF').digest('hex'),
};
function ownerRecord(state: 'admitted' | 'accepted') {
  return {
    input,
    ownerMatches: true,
    state,
    contentAvailable: true,
    taskId: state === 'accepted' ? 'actual-task' : null,
    documentId: null,
    reason: null,
  };
}
function contentResponse(value: unknown): typeof fetch {
  return async (_url, init) => {
    await new Response(init?.body).arrayBuffer();
    return Response.json(value, { status: 200 });
  };
}
beforeEach(async () => {
  tokens = createUploadTokenStore();
  owner.dispatch.mockReset().mockResolvedValue({
    kind: 'ok',
    value: { data: ownerRecord('accepted') },
  });
  upstream = vi.fn<typeof fetch>(contentResponse({ data: ownerRecord('admitted') }));
  const errors = createPillarErrorHandlers({ pillar: 'mcp', logger: { error: vi.fn() } });
  const app = express();
  app.use(errors.requestId);
  app.use(
    '/uploads',
    createUploadRouter({
      tokens,
      documents: {
        discovery: {
          lookup: async (id) =>
            id === 'documents' ? { baseUrl: 'http://documents-owner.test' } : undefined,
        },
        apiKey: () => 'fixture',
        fetchImpl: upstream,
      },
    })
  );
  app.use(errors.final);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
function mint() {
  const grant = tokens.mint({ kind: 'paperless-document', ...input });
  if (!grant) throw new Error('No grant');
  return grant.token;
}
function put(token: string, data = 'PDF', mime = input.mimeType) {
  return fetch(`${origin}/uploads/${token}`, {
    method: 'PUT',
    headers: { 'content-type': mime },
    body: data,
  });
}

it('streams exact bytes to the durable content route and dispatches the same owner operation once', async () => {
  const token = mint();
  const reply = await put(token);
  expect(reply.status).toBe(200);
  expect(await reply.json()).toMatchObject({ data: { state: 'accepted', taskId: 'actual-task' } });
  expect(upstream).toHaveBeenCalledTimes(1);
  expect(upstream.mock.calls[0]?.[0]).toBe(
    'http://documents-owner.test/paperless/uploads/0c8c5b6e-2817-4f70-98f9-0f5f274f9e1c/content'
  );
  expect(upstream.mock.calls[0]?.[1]).toMatchObject({
    method: 'PUT',
    redirect: 'manual',
    headers: {
      'x-api-key': 'fixture',
      'content-type': input.mimeType,
      'content-length': '3',
    },
  });
  expect(owner.dispatch).toHaveBeenCalledExactlyOnceWith({ operationId: input.operationId });
  expect((await put(token)).status).toBe(404);
  expect(owner.dispatch).toHaveBeenCalledTimes(1);
});

it('does not dispatch after a lost raw-content response and exposes no new identity', async () => {
  upstream.mockRejectedValueOnce(new TypeError('response lost'));
  const reply = await put(mint());
  expect(reply.status).toBe(502);
  expect(owner.dispatch).not.toHaveBeenCalled();
  expect(upstream).toHaveBeenCalledTimes(1);
});

it.each(['PDF', 'PD', 'ABC', 'PDF excess tail'])(
  'does not dispatch an early admitted response before verifying all bytes of %s',
  async (bytes) => {
    upstream.mockResolvedValueOnce(Response.json({ data: ownerRecord('admitted') }));
    expect((await put(mint(), bytes)).status).toBe(502);
    expect(owner.dispatch).not.toHaveBeenCalled();
  }
);

it.each(['PD', 'ABC', 'PDF excess tail'])(
  'does not dispatch after consuming invalid content %s',
  async (bytes) => {
    expect((await put(mint(), bytes)).status).toBe(502);
    expect(owner.dispatch).not.toHaveBeenCalled();
  }
);

it.each([
  ['file name', { ...input, fileName: 'different.pdf' }],
  ['title', { ...input, title: 'Different original' }],
  ['MIME type', { ...input, mimeType: 'application/octet-stream' }],
  ['byte length', { ...input, byteLength: 4 }],
  ['digest', { ...input, sha256: 'a'.repeat(64) }],
  ['operation ID', { ...input, operationId: '11111111-1111-4111-8111-111111111111' }],
])(
  'does not dispatch when admitted proof changes the immutable %s',
  async (_field, mismatchedInput) => {
    upstream.mockImplementationOnce(
      contentResponse({ data: { ...ownerRecord('admitted'), input: mismatchedInput } })
    );
    expect((await put(mint())).status).toBe(502);
    expect(owner.dispatch).not.toHaveBeenCalled();
  }
);

it('does not dispatch content admitted under a mismatched owner identity', async () => {
  upstream.mockImplementationOnce(
    contentResponse({ data: { ...ownerRecord('admitted'), ownerMatches: false } })
  );
  expect((await put(mint())).status).toBe(502);
  expect(owner.dispatch).not.toHaveBeenCalled();
});

it('does not follow redirects or dispatch an unconfirmed content write', async () => {
  upstream.mockResolvedValueOnce(
    new Response(null, { status: 307, headers: { location: '/elsewhere' } })
  );
  expect((await put(mint())).status).toBe(502);
  expect(owner.dispatch).not.toHaveBeenCalled();
  expect(upstream).toHaveBeenCalledTimes(1);
});

it('rejects a MIME mismatch before contacting Documents or dispatching', async () => {
  expect((await put(mint(), 'PDF', 'text/plain')).status).toBe(415);
  expect(upstream).not.toHaveBeenCalled();
  expect(owner.dispatch).not.toHaveBeenCalled();
});

it('preserves Documents scope refusal diagnostics without reporting an Inventory rejection', async () => {
  upstream.mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
  const reply = await put(mint());
  expect(reply.status).toBe(502);
  expect(await reply.json()).toMatchObject({
    code: 'mcp.upload.documents_refused',
    details: {
      ownerStatus: 403,
      scope: 'documents.write.uploadContent',
      operationId: input.operationId,
    },
  });
  expect(owner.dispatch).not.toHaveBeenCalled();
});

it('does not dispatch when the final owner response is lost; explicit status/re-dispatch uses the same operation', async () => {
  owner.dispatch.mockRejectedValueOnce(new TypeError('lost dispatch response'));
  expect((await put(mint())).status).toBe(502);
  expect(owner.dispatch).toHaveBeenCalledExactlyOnceWith({ operationId: input.operationId });
  expect(upstream).toHaveBeenCalledTimes(1);
});
