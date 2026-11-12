import { beforeEach, expect, it, vi } from 'vitest';

import { createPaperlessUploadIntents } from '../uploads/paperless-upload-intents.js';
import { createUploadTokenStore } from '../uploads/upload-tokens.js';
import { documentsCreateUploadTool, documentsUploadStatusTool } from './documents-owner-upload.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const status = vi.hoisted(() => vi.fn());
vi.mock('../pillar-client.js', () => ({
  getPillar: (id: string) => {
    if (id !== 'documents') throw new Error('Unexpected nonowner pillar');
    return { paperless: { status } };
  },
}));
beforeEach(() => {
  status.mockReset();
  status.mockResolvedValue({
    kind: 'ok',
    value: {
      data: {
        configured: true,
        available: true,
        baseUrl: null,
        documentCount: null,
        maxUploadBytes: 47,
        allowedMimeTypes: ['application/pdf'],
      },
    },
  });
});
function payload(result: CallToolResult): Record<string, unknown> {
  const text = result.content.find((item) => item.type === 'text');
  if (!text || text.type !== 'text') throw new Error('No text');
  const value: unknown = JSON.parse(text.text);
  if (typeof value !== 'object' || value === null) throw new Error('No object');
  return Object.fromEntries(Object.entries(value));
}
it('mints a direct owner target using actual metadata and no bytes/path/Inventory fields', async () => {
  const tokens = createUploadTokenStore();
  const intents = createPaperlessUploadIntents();
  const tool = documentsCreateUploadTool(tokens, intents);
  const result = await tool.handler(
    { fileName: '  trip.pdf', title: 'Original title' },
    { publicBaseUrl: 'http://gateway.test' }
  );
  const value = payload(result);
  expect(value).toMatchObject({
    maxBytes: 47,
    allowedMimeTypes: ['application/pdf'],
    method: 'PUT',
  });
  if (typeof value['uploadId'] !== 'string' || typeof value['uploadUrl'] !== 'string')
    throw new Error('Missing issued identities');
  const token = new URL(value['uploadUrl']).pathname.split('/').at(-1);
  if (!token) throw new Error('No grant');
  expect(tokens.consume(token)).toEqual({
    kind: 'paperless-document',
    uploadId: value['uploadId'],
    fileName: '  trip.pdf',
    title: 'Original title',
    maxBytes: 47,
    allowedMimeTypes: ['application/pdf'],
  });
  intents.update(value['uploadId'], { state: 'accepted', taskId: 'owner-task' });
  expect(
    payload(await documentsUploadStatusTool(intents).handler({ uploadId: value['uploadId'] }))
  ).toEqual({ uploadId: value['uploadId'], state: 'accepted', taskId: 'owner-task' });
  expect(documentsUploadStatusTool().readOnly).toBe(true);
  expect(tool.scope).toBe('documents.write.upload');
});
it.each([
  { fileName: 'x.pdf', content: 'base64' },
  { fileName: 'x.pdf', path: '/arbitrary/file' },
  { fileName: 'x\n.pdf' },
  { fileName: 'x.pdf', title: '' },
  { fileName: 'x'.repeat(256) },
])('rejects unsupported/invalid arguments before owner calls %j', async (args) => {
  expect(
    (await documentsCreateUploadTool().handler(args, { publicBaseUrl: 'http://gateway.test' }))
      .isError
  ).toBe(true);
  expect(status).not.toHaveBeenCalled();
});
it.each([
  { configured: false, available: true, maxUploadBytes: 4, allowedMimeTypes: ['application/pdf'] },
  { configured: true, available: false, maxUploadBytes: 4, allowedMimeTypes: ['application/pdf'] },
  { configured: true, available: true, maxUploadBytes: null, allowedMimeTypes: [] },
  { configured: true, available: true, maxUploadBytes: -1, allowedMimeTypes: ['application/pdf'] },
])('does not issue a URL from unavailable or invalid owner metadata %j', async (data) => {
  status.mockResolvedValue({
    kind: 'ok',
    value: { data: { baseUrl: null, documentCount: null, ...data } },
  });
  expect(
    (
      await documentsCreateUploadTool().handler(
        { fileName: 'x.pdf' },
        { publicBaseUrl: 'http://gateway.test' }
      )
    ).isError
  ).toBe(true);
});
it('preserves owner authorization failure and never invents accepted proof after restart', async () => {
  status.mockResolvedValue({ kind: 'unauthorized', pillar: 'documents', message: 'Forbidden' });
  const result = await documentsCreateUploadTool().handler(
    { fileName: 'x.pdf' },
    { publicBaseUrl: 'http://gateway.test' }
  );
  expect(result).toMatchObject({
    isError: true,
    content: [{ type: 'text', text: expect.stringContaining('documents.paperless.status') }],
  });
  const prior = createPaperlessUploadIntents();
  const id = prior.create();
  if (!id) throw new Error('No intent');
  prior.update(id, { state: 'accepted', taskId: 'known-only-before-restart' });
  expect(
    payload(
      await documentsUploadStatusTool(createPaperlessUploadIntents()).handler({ uploadId: id })
    )
  ).toMatchObject({ state: 'unavailable', reason: expect.stringContaining('Do not upload') });
});

it('admits the exact owner filename/title bounds and refuses missing public context before owner calls', async () => {
  const tool = documentsCreateUploadTool(createUploadTokenStore(), createPaperlessUploadIntents());
  expect((await tool.handler({ fileName: 'x.pdf' })).isError).toBe(true);
  expect(status).not.toHaveBeenCalled();
  expect(
    (
      await tool.handler(
        { fileName: 'x'.repeat(255), title: 't'.repeat(128) },
        { publicBaseUrl: 'http://gateway.test' }
      )
    ).isError
  ).not.toBe(true);
});
it.each([
  {},
  { uploadId: 'not-issued' },
  { uploadId: '00000000-0000-0000-0000-000000000000', path: '/file' },
])('refuses invalid upload receipt arguments without producer calls %j', async (args) => {
  expect((await documentsUploadStatusTool().handler(args)).isError).toBe(true);
  expect(status).not.toHaveBeenCalled();
});
