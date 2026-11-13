import { beforeEach, expect, it, vi } from 'vitest';

import { extractText, parseResult } from './test-helpers.js';

import type { CallResult } from '@pops/pillar-sdk/client';

const paperless = vi.hoisted(() => ({
  status: vi.fn(),
  search: vi.fn(),
  get: vi.fn(),
  task: vi.fn(),
}));
vi.mock('../pillar-client.js', () => ({
  getPillar: (id: string) => {
    if (id !== 'documents') throw new Error('Unexpected nonowner pillar');
    return { paperless };
  },
}));
const { documentsOwnerReadTools } = await import('./documents-owner-read.js');
function tool(operation: string): (typeof documentsOwnerReadTools)[number] {
  const found = documentsOwnerReadTools.find((entry) => entry.name === `documents.${operation}`);
  if (!found) throw new Error('Missing direct owner tool');
  return found;
}
const original = {
  id: 91,
  title: 'Trip original',
  created: '2026-11-12',
  originalFileName: 'ticket.pdf',
  thumbnailUrl: '/thumbnails/91',
};
beforeEach(() => {
  vi.resetAllMocks();
  paperless.status.mockResolvedValue({
    kind: 'ok',
    value: {
      data: {
        configured: true,
        available: true,
        baseUrl: null,
        documentCount: 1,
        maxUploadBytes: 47,
        allowedMimeTypes: ['application/pdf'],
      },
    },
  });
  paperless.search.mockResolvedValue({ kind: 'ok', value: { data: [original] } });
  paperless.get.mockResolvedValue({ kind: 'ok', value: { data: original } });
  paperless.task.mockResolvedValue({
    kind: 'ok',
    value: { data: { state: 'done', documentId: 91, reason: null } },
  });
});
it('registers only finite direct-owner reads with producer scopes and retains exact metadata', async () => {
  expect(documentsOwnerReadTools.map((entry) => [entry.name, entry.readOnly, entry.scope])).toEqual(
    ['status', 'search', 'get', 'task'].map((name) => [
      `documents.${name}`,
      true,
      `documents.paperless.${name}`,
    ])
  );
  expect(parseResult(await tool('search').handler({ query: 'ticket' }))).toEqual({
    data: [original],
  });
  expect(paperless.search).toHaveBeenCalledWith({ query: 'ticket' });
  expect(parseResult(await tool('get').handler({ id: 91 }))).toEqual({ data: original });
  expect(paperless.get).toHaveBeenCalledWith({ id: 91 });
  expect(parseResult(await tool('status').handler({}))).toMatchObject({
    data: { maxUploadBytes: 47 },
  });
});
it.each<[string, Record<string, unknown>]>([
  ['status', { unexpected: true }],
  ['search', {}],
  ['search', { query: 'x' }],
  ['search', { query: 'x'.repeat(201) }],
  ['search', { query: 'ok', itemId: 'invented' }],
  ['get', { id: '91' }],
  ['get', { id: 0 }],
  ['get', { id: -1 }],
  ['get', { id: 1.5 }],
  ['get', { id: 91, extra: true }],
  ['task', { taskId: '' }],
  ['task', { taskId: 'x'.repeat(73) }],
  ['task', { taskId: '../other' }],
  ['task', { taskId: 'valid', bytes: 'no' }],
])('rejects canonical invalid %s input before dispatch %j', async (name, args) => {
  expect((await tool(String(name)).handler(args)).isError).toBe(true);
  for (const call of Object.values(paperless)) expect(call).not.toHaveBeenCalled();
});
it.each(['pending', 'done', 'duplicate', 'failed'])(
  'returns actual %s task state without synthesising completion or changing IDs',
  async (state) => {
    const data = {
      state,
      documentId: state === 'done' || state === 'duplicate' ? 91 : null,
      reason: state === 'failed' ? 'Owner refused original' : null,
    };
    paperless.task.mockResolvedValue({ kind: 'ok', value: { data } });
    expect(parseResult(await tool('task').handler({ taskId: 'actual_Task-1' }))).toEqual({ data });
    expect(paperless.task).toHaveBeenCalledWith({ taskId: 'actual_Task-1' });
  }
);
it.each<[string, Record<string, unknown>, unknown]>([
  ['status', {}, {}],
  ['search', { query: 'ok' }, { data: [{ id: 91 }] }],
  ['get', { id: 91 }, { data: null }],
  ['task', { taskId: 'ok' }, { data: { state: 'complete', documentId: 91, reason: null } }],
  ['task', { taskId: 'ok' }, { data: { state: 'done', documentId: 0, reason: null } }],
])(
  'rejects malformed owner %s success instead of presenting false identity %j',
  async (name, args, value) => {
    const call = Object.entries(paperless).find(([operation]) => operation === name)?.[1];
    if (!call) throw new Error('No call');
    call.mockResolvedValue({ kind: 'ok', value });
    expect((await tool(String(name)).handler(args)).isError).toBe(true);
  }
);
const failures: Extract<CallResult<unknown>, { kind: 'not-found' | 'refused' | 'unavailable' }>[] =
  [
    {
      kind: 'not-found',
      pillar: 'documents',
      message: 'No original',
      code: 'documents.paperless.not_found',
    },
    {
      kind: 'refused',
      pillar: 'documents',
      status: 412,
      message: 'Not configured',
      code: 'documents.paperless.not_configured',
    },
    {
      kind: 'unavailable',
      pillar: 'documents',
      message: 'Owner unavailable',
      code: 'documents.paperless.unavailable',
    },
  ];
it.each(failures)(
  'keeps actual missing/unconfigured/unavailable distinctions (%s)',
  async (result) => {
    paperless.get.mockResolvedValue(result);
    const reply = await tool('get').handler({ id: 91 });
    expect(reply.isError).toBe(true);
    expect(extractText(reply)).toContain(result.message);
    expect(extractText(reply)).toContain(result.code);
  }
);
it('does not present metadata for a different original as proof for the requested ID', async () => {
  paperless.get.mockResolvedValue({ kind: 'ok', value: { data: { ...original, id: 92 } } });
  expect((await tool('get').handler({ id: 91 })).isError).toBe(true);
});
it('names the owner scope on authorization refusal', async () => {
  paperless.task.mockResolvedValue({
    kind: 'unauthorized',
    pillar: 'documents',
    message: 'Forbidden',
  });
  expect(extractText(await tool('task').handler({ taskId: 'actual' }))).toContain(
    'documents.paperless.task'
  );
});
