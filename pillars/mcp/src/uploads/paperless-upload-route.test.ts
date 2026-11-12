import express from 'express';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createPillarErrorHandlers } from '@pops/pillar-express';

import { createPaperlessUploadIntents } from './paperless-upload-intents.js';
import { createUploadRouter } from './upload-route.js';
import { createUploadTokenStore, UPLOAD_TOKEN_TTL_MS } from './upload-tokens.js';

import type { Server } from 'node:http';

let server: Server;
let origin: string;
let now: number;
let tokens: ReturnType<typeof createUploadTokenStore>;
let intents: ReturnType<typeof createPaperlessUploadIntents>;
let owner: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(async () => {
  now = 1;
  tokens = createUploadTokenStore(() => now);
  intents = createPaperlessUploadIntents(() => now);
  owner = vi.fn<typeof fetch>(async (_url, init) => {
    await new Response(init?.body).arrayBuffer();
    return Response.json({ data: { taskId: 'actual-task' } }, { status: 202 });
  });
  const errors = createPillarErrorHandlers({ pillar: 'mcp', logger: { error: vi.fn() } });
  const app = express();
  app.use(errors.requestId);
  app.use(
    '/uploads',
    createUploadRouter({
      tokens,
      paperlessIntents: intents,
      documents: {
        discovery: {
          lookup: async (id) =>
            id === 'documents' ? { baseUrl: 'http://documents-owner.test' } : undefined,
        },
        apiKey: () => 'fixture',
        fetchImpl: owner,
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
function mint(maxBytes = 8) {
  const uploadId = intents.create();
  if (!uploadId) throw new Error('No intent');
  const grant = tokens.mint({
    kind: 'paperless-document',
    uploadId,
    fileName: 'trip.pdf',
    title: 'Trip original',
    maxBytes,
    allowedMimeTypes: ['application/pdf'],
  });
  if (!grant) throw new Error('No grant');
  return { uploadId, token: grant.token };
}
function put(token: string, data = 'PDF', mime = 'application/pdf') {
  return fetch(`${origin}/uploads/${token}`, {
    method: 'PUT',
    headers: { 'content-type': mime },
    body: data,
  });
}
it('streams to Documents without Inventory, retains accepted task independently of consuming the client reply, and refuses replay', async () => {
  const { token, uploadId } = mint();
  const reply = await put(token);
  expect(reply.status).toBe(202);
  expect(intents.read(uploadId)).toEqual({ state: 'accepted', taskId: 'actual-task' });
  expect((await put(token)).status).toBe(404);
  expect(owner).toHaveBeenCalledTimes(1);
  expect(owner.mock.calls[0]?.[0]).toBe(
    'http://documents-owner.test/paperless/documents?fileName=trip.pdf&title=Trip+original'
  );
  expect(owner.mock.calls[0]?.[1]?.headers).toMatchObject({
    'x-api-key': 'fixture',
    'content-type': 'application/pdf',
  });
});
it.each([202, 200, 503])(
  'keeps malformed/unconfirmed HTTP%s unknown and refuses blind retry',
  async (status) => {
    owner.mockResolvedValue(Response.json({ data: {} }, { status }));
    const { token, uploadId } = mint();
    const reply = await put(token);
    expect(reply.status).toBe(502);
    expect(await reply.json()).toMatchObject({
      code: 'mcp.upload.outcome_unknown',
      retryable: false,
    });
    expect(intents.read(uploadId)).toMatchObject({ state: 'unknown' });
    expect((await put(token)).status).toBe(404);
    expect(owner).toHaveBeenCalledTimes(1);
  }
);
it('retains unknown when the owner response is lost and names scope for an explicit auth refusal', async () => {
  owner.mockRejectedValueOnce(new TypeError('response lost'));
  const first = mint();
  expect((await put(first.token)).status).toBe(502);
  expect(intents.read(first.uploadId)).toMatchObject({ state: 'unknown' });
  owner.mockResolvedValueOnce(
    Response.json(
      {
        code: 'documents.auth.forbidden',
        message: 'Forbidden',
        requestId: 'fixture',
        retryable: false,
      },
      { status: 403 }
    )
  );
  const second = mint();
  expect((await put(second.token)).status).toBe(403);
  expect(intents.read(second.uploadId)).toMatchObject({
    state: 'refused',
    reason: expect.stringContaining('documents.write.upload'),
  });
});
it('enforces owner MIME/declared size before POST and URL expiry without forwarding', async () => {
  const wrong = mint();
  expect((await put(wrong.token, 'PDF', 'text/plain')).status).toBe(415);
  expect(intents.read(wrong.uploadId)).toMatchObject({ state: 'not-sent' });
  expect((await put(mint(2).token)).status).toBe(413);
  const expired = mint();
  now += UPLOAD_TOKEN_TTL_MS;
  expect((await put(expired.token)).status).toBe(404);
  expect(intents.read(expired.uploadId)).toMatchObject({ state: 'unavailable' });
  expect(owner).not.toHaveBeenCalled();
});
it('keeps the task when the HTTP caller disconnects after its body was forwarded, without a second POST', async () => {
  let start: () => void = () => {};
  let release: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  owner.mockImplementationOnce(async (_url, init) => {
    await new Response(init?.body).arrayBuffer();
    start();
    await released;
    return Response.json({ data: { taskId: 'retained-after-disconnect' } }, { status: 202 });
  });
  const { token, uploadId } = mint();
  const abort = new AbortController();
  const sending = fetch(`${origin}/uploads/${token}`, {
    method: 'PUT',
    body: 'PDF',
    headers: { 'content-type': 'application/pdf' },
    signal: abort.signal,
  }).catch(() => undefined);
  await started;
  abort.abort();
  await sending;
  release();
  await vi.waitFor(() =>
    expect(intents.read(uploadId)).toEqual({
      state: 'accepted',
      taskId: 'retained-after-disconnect',
    })
  );
  expect((await put(token)).status).toBe(404);
  expect(owner).toHaveBeenCalledTimes(1);
});
it('cuts chunked bodies at the owner cap and keeps uncertainty rather than permitting an automatic retry', async () => {
  const { token, uploadId } = mint(2);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]));
      controller.enqueue(new Uint8Array([3]));
      controller.close();
    },
  });
  const init: RequestInit & { duplex: 'half' } = {
    method: 'PUT',
    headers: { 'content-type': 'application/pdf' },
    body: stream,
    duplex: 'half',
  };
  const reply = await fetch(`${origin}/uploads/${token}`, init);
  expect(reply.status).toBe(502);
  expect(intents.read(uploadId)).toMatchObject({ state: 'unknown' });
  expect(owner).toHaveBeenCalledTimes(1);
});
it('refuses a still-live URL whose earlier receipt has expired rather than forwarding without recoverable state', async () => {
  const uploadId = intents.create();
  if (!uploadId) throw new Error('No intent');
  now++;
  const grant = tokens.mint({
    kind: 'paperless-document',
    uploadId,
    fileName: 'trip.pdf',
    maxBytes: 8,
    allowedMimeTypes: ['application/pdf'],
  });
  if (!grant) throw new Error('No grant');
  now += UPLOAD_TOKEN_TTL_MS - 1;
  expect(intents.read(uploadId)).toMatchObject({ state: 'unavailable' });
  expect((await put(grant.token)).status).toBe(404);
  expect(owner).not.toHaveBeenCalled();
});
