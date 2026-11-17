import { beforeEach, expect, it, vi } from 'vitest';

import { createUploadTokenStore } from '../uploads/upload-tokens.js';
import { documentsOwnerReadTools } from './documents-owner-read.js';
import {
  documentsCreateUploadTool,
  documentsDispatchUploadTool,
} from './documents-owner-upload.js';

const owner = vi.hoisted(() => ({
  createUpload: vi.fn(),
  dispatchUpload: vi.fn(),
  upload: vi.fn(),
  fetchOptions: vi.fn<(options: { fetchImpl?: typeof fetch }) => void>(),
}));
vi.mock('../pillar-client.js', () => ({
  getPillar: (id: string, options?: { fetchImpl?: typeof fetch }) => {
    if (id !== 'documents') throw new Error('Unexpected nonowner pillar');
    owner.fetchOptions(options ?? {});
    return {
      paperless: { upload: owner.upload },
      write: { createUpload: owner.createUpload, dispatchUpload: owner.dispatchUpload },
    };
  },
}));

const input = {
  operationId: '0c8c5b6e-2817-4f70-98f9-0f5f274f9e1c',
  fileName: 'trip.pdf',
  title: 'Trip original',
  mimeType: 'application/pdf',
  byteLength: 3,
  sha256: 'a'.repeat(64),
};
function record(state: 'awaiting_content' | 'admitted' | 'accepted' | 'outcome_unknown') {
  const accepted = state === 'accepted';
  return {
    input,
    ownerMatches: true,
    state,
    contentAvailable: state === 'admitted' || accepted,
    taskId: accepted ? 'task-proof-1' : null,
    documentId: null,
    reason: null,
    ...(state === 'outcome_unknown' ? { blockedBy: 'dispatch_unproven' } : {}),
  };
}
function payload(
  result: Awaited<ReturnType<ReturnType<typeof documentsCreateUploadTool>['handler']>>
) {
  const text = result.content.find((item) => item.type === 'text');
  if (!text || text.type !== 'text') throw new Error('No text result');
  const value: unknown = JSON.parse(text.text);
  if (typeof value !== 'object' || value === null) throw new Error('No object result');
  return value;
}
beforeEach(() => {
  vi.clearAllMocks();
  owner.createUpload.mockResolvedValue({ kind: 'ok', value: { data: record('awaiting_content') } });
  owner.dispatchUpload.mockResolvedValue({
    kind: 'ok',
    value: { data: record('outcome_unknown') },
  });
});

it('uses the caller operation ID and immutable input, and issues bytes only for the returned awaiting intent', async () => {
  const tokens = createUploadTokenStore();
  const tool = documentsCreateUploadTool(tokens);
  const result = payload(await tool.handler(input, { publicBaseUrl: 'https://gateway.example' }));
  expect(owner.createUpload).toHaveBeenCalledExactlyOnceWith(input);
  expect(tool.scope).toBe('documents.write.createUpload');
  expect(result).toMatchObject({
    operationId: input.operationId,
    method: 'PUT',
    upload: { state: 'awaiting_content' },
  });
  if (!('uploadUrl' in result) || typeof result.uploadUrl !== 'string')
    throw new Error('Missing upload URL');
  const token = new URL(result.uploadUrl).pathname.split('/').at(-1);
  if (!token) throw new Error('Missing token');
  expect(tokens.consume(token)).toEqual({
    kind: 'paperless-document',
    operationId: input.operationId,
    fileName: input.fileName,
    title: input.title,
    mimeType: input.mimeType,
    byteLength: input.byteLength,
    sha256: input.sha256,
  });
});

it.each(['admitted', 'accepted', 'outcome_unknown'] as const)(
  'does not issue another byte URL for owner state %s',
  async (state) => {
    owner.createUpload.mockResolvedValue({ kind: 'ok', value: { data: record(state) } });
    const value = payload(
      await documentsCreateUploadTool(createUploadTokenStore()).handler(input, {
        publicBaseUrl: 'https://gateway.example',
      })
    );
    expect(value).not.toHaveProperty('uploadUrl');
    expect(value).toMatchObject({ upload: { state } });
  }
);

it('does not mint a content URL when the durable record belongs to a different owner identity', async () => {
  owner.createUpload.mockResolvedValue({
    kind: 'ok',
    value: { data: { ...record('awaiting_content'), ownerMatches: false } },
  });
  const value = payload(
    await documentsCreateUploadTool(createUploadTokenStore()).handler(input, {
      publicBaseUrl: 'https://gateway.example',
    })
  );
  expect(value).not.toHaveProperty('uploadUrl');
  expect(value).toMatchObject({ upload: { ownerMatches: false } });
});

it('refuses a replay whose owner proof contains different immutable input', async () => {
  owner.createUpload.mockResolvedValue({
    kind: 'ok',
    value: { data: { ...record('awaiting_content'), input: { ...input, sha256: 'b'.repeat(64) } } },
  });
  const result = await documentsCreateUploadTool().handler(input, {
    publicBaseUrl: 'https://gateway.example',
  });
  expect(result.isError).toBe(true);
});

it.each([
  ['operation ID', { ...input, operationId: '11111111-1111-4111-8111-111111111111' }],
  ['file name', { ...input, fileName: 'different.pdf' }],
  ['title', { ...input, title: 'Different original' }],
  ['MIME type', { ...input, mimeType: 'application/octet-stream' }],
  ['byte length', { ...input, byteLength: 4 }],
  ['digest', { ...input, sha256: 'b'.repeat(64) }],
])('rejects canonical accepted proof with a different %s', async (_field, mismatchedInput) => {
  owner.createUpload.mockResolvedValue({
    kind: 'ok',
    value: { data: { ...record('accepted'), input: mismatchedInput } },
  });
  const result = await documentsCreateUploadTool().handler(input, {
    publicBaseUrl: 'https://gateway.example',
  });
  expect(result.isError).toBe(true);
});

it('reissues an expired or restarted gateway token only for the same durable operation input', async () => {
  const firstTokens = createUploadTokenStore();
  await documentsCreateUploadTool(firstTokens).handler(input, {
    publicBaseUrl: 'https://gateway.example',
  });
  const restartedTokens = createUploadTokenStore();
  const result = payload(
    await documentsCreateUploadTool(restartedTokens).handler(input, {
      publicBaseUrl: 'https://gateway.example',
    })
  );
  expect(owner.createUpload).toHaveBeenCalledTimes(2);
  expect(owner.createUpload).toHaveBeenLastCalledWith(input);
  expect(result).toMatchObject({
    operationId: input.operationId,
    upload: { state: 'awaiting_content' },
  });
  if (!('uploadUrl' in result) || typeof result.uploadUrl !== 'string')
    throw new Error('No resumed URL');
  const token = new URL(result.uploadUrl).pathname.split('/').at(-1);
  if (!token) throw new Error('Missing token');
  expect(restartedTokens.consume(token)).toMatchObject({ operationId: input.operationId });
});

it.each(['accepted', 'outcome_unknown'] as const)(
  'does not mint bytes after owner proof becomes %s',
  async (state) => {
    owner.upload.mockResolvedValue({ kind: 'ok', value: { data: record(state) } });
    const status = documentsOwnerReadTools.find((tool) => tool.name === 'documents.uploadStatus');
    if (!status) throw new Error('Missing durable upload status tool');
    const result = await status.handler({ operationId: input.operationId });
    expect(status.scope).toBe('documents.paperless.upload');
    expect(owner.upload).toHaveBeenCalledExactlyOnceWith({ operationId: input.operationId });
    expect(payload(result)).toMatchObject({ data: { state } });
  }
);

it('validates the caller identity and refuses missing gateway context before owner mutation', async () => {
  expect((await documentsCreateUploadTool().handler({ ...input, extra: true })).isError).toBe(true);
  expect((await documentsCreateUploadTool().handler(input)).isError).toBe(true);
  expect(owner.createUpload).not.toHaveBeenCalled();
});

it('dispatch tool uses only the existing operation ID and reports the exact narrow scope', async () => {
  const tool = documentsDispatchUploadTool();
  await tool.handler({ operationId: input.operationId });
  expect(owner.dispatchUpload).toHaveBeenCalledExactlyOnceWith({ operationId: input.operationId });
  expect(tool.scope).toBe('documents.write.dispatchUpload');
  expect(tool.readOnly).toBe(false);
});

it('does not report a dispatch proof from a different owner identity', async () => {
  owner.dispatchUpload.mockResolvedValue({
    kind: 'ok',
    value: { data: { ...record('accepted'), ownerMatches: false } },
  });
  expect(
    (await documentsDispatchUploadTool().handler({ operationId: input.operationId })).isError
  ).toBe(true);
});

it('configures manual redirects on the finite Documents SDK handle', async () => {
  const request = vi.fn<typeof fetch>(async (_input, init) => {
    expect(init?.redirect).toBe('manual');
    return new Response(null, { status: 307, headers: { location: 'https://elsewhere.test' } });
  });
  vi.stubGlobal('fetch', request);
  try {
    await documentsCreateUploadTool().handler(input, { publicBaseUrl: 'https://gateway.example' });
    expect(owner.fetchOptions).toHaveBeenLastCalledWith({ fetchImpl: expect.any(Function) });
    const fetchImpl = owner.fetchOptions.mock.lastCall?.[0].fetchImpl;
    if (!fetchImpl) throw new Error('Documents SDK handle omitted its redirect policy');
    const response = await fetchImpl('https://documents.test/paperless/uploads', {
      method: 'POST',
      headers: { 'x-api-key': 'fixture' },
      body: JSON.stringify(input),
    });
    expect(response.status).toBe(307);
    expect(request).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('rejects status proof for a different operation ID', async () => {
  owner.upload.mockResolvedValue({
    kind: 'ok',
    value: {
      data: {
        ...record('accepted'),
        input: { ...input, operationId: '11111111-1111-4111-8111-111111111111' },
      },
    },
  });
  const status = documentsOwnerReadTools.find((tool) => tool.name === 'documents.uploadStatus');
  if (!status) throw new Error('Missing durable upload status tool');
  expect((await status.handler({ operationId: input.operationId })).isError).toBe(true);
});

it('rejects dispatch proof for a different operation ID', async () => {
  owner.dispatchUpload.mockResolvedValue({
    kind: 'ok',
    value: {
      data: {
        ...record('accepted'),
        input: { ...input, operationId: '11111111-1111-4111-8111-111111111111' },
      },
    },
  });
  expect(
    (await documentsDispatchUploadTool().handler({ operationId: input.operationId })).isError
  ).toBe(true);
});
