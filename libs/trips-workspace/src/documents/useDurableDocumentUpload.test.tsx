import { webcrypto } from 'node:crypto';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createClient } from '../documents-api/client';
import { createTestUploadJournal } from './durable-upload-test-utils';
import { useDocumentUpload } from './useDocumentUpload';
import { createDocumentUploadSession } from './useUploadFields';

import type { ReactNode } from 'react';

import type { PaperlessStatusResponses } from '../documents-api/types.gen';
import type { DurableUploadInput, DurableUploadRecord } from './durable-upload-api';
import type { DocumentUploadSession } from './useUploadFields';

const caches: QueryClient[] = [];
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  vi.unstubAllGlobals();
});

class ReadableFile extends File {
  override arrayBuffer(): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) resolve(reader.result);
        else reject(new Error('The file reader did not return bytes.'));
      };
      reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
      reader.readAsArrayBuffer(this);
    });
  }
}

function deferred<Value>() {
  let resolve: (value: Value) => void = () => {
    throw new Error('Deferred request was not initialized.');
  };
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture(file: File, session: DocumentUploadSession) {
  const input: DurableUploadInput = {
    operationId: session.id,
    fileName: file.name,
    mimeType: file.type,
    byteLength: file.size,
    sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  };
  const awaiting: DurableUploadRecord = {
    input,
    state: 'awaiting_content',
    ownerMatches: true,
    contentAvailable: false,
    taskId: null,
    documentId: null,
    reason: null,
  };
  const admitted: DurableUploadRecord = { ...awaiting, state: 'admitted', contentAvailable: true };
  const accepted: DurableUploadRecord = { ...admitted, state: 'accepted', taskId: 'owner-task-1' };
  const unknown: DurableUploadRecord = {
    ...awaiting,
    state: 'outcome_unknown',
    blockedBy: 'dispatch_unproven',
    contentAvailable: true,
  };
  return { input, awaiting, admitted, accepted, unknown };
}

function proof(record: DurableUploadRecord): Response {
  return Response.json({ data: record });
}

function harness(
  respond: (request: Request, records: ReturnType<typeof fixture>) => Response | Promise<Response>
) {
  const file = new ReadableFile(['abc'], 'booking.pdf', { type: 'application/pdf' });
  const initial = createDocumentUploadSession(file);
  const records = fixture(file, initial);
  const persistence = createTestUploadJournal();
  const requests: Request[] = [];
  const policy: PaperlessStatusResponses[200] = {
    data: {
      configured: true,
      available: true,
      maxUploadBytes: 1000,
      allowedMimeTypes: ['application/pdf'],
      baseUrl: null,
      documentCount: null,
    },
  };
  const fetcher: typeof globalThis.fetch = async (resource, init) => {
    const request = new Request(resource, init);
    requests.push(request);
    if (request.url.endsWith('/paperless/status')) return Response.json(policy);
    return respond(request, records);
  };
  const client = createClient({ baseUrl: 'https://owner-a.test/documents-api', fetch: fetcher });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  const storage = renderHook(() => useState(initial));
  const mount = (beforeRequest?: () => void) =>
    renderHook(
      ({ session }: { session: DocumentUploadSession }) =>
        useDocumentUpload({
          session,
          onSessionChange: storage.result.current[1],
          documentsClient: client,
          journal: persistence.journal,
          beforeRequest,
        }),
      {
        initialProps: { session: storage.result.current[0] },
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={cache}>{children}</QueryClientProvider>
        ),
      }
    );
  const uploads = () =>
    requests
      .filter((request) => !request.url.endsWith('/paperless/status'))
      .map((request) => `${request.method} ${new URL(request.url).pathname}`);
  return { file, initial, records, requests, client, cache, storage, mount, uploads };
}

it('retains a lost dispatch intent across unmount and cache eviction and recovers through GET only', async () => {
  const owner = harness((request, records) => {
    if (request.method === 'GET') return proof(records.unknown);
    if (request.method === 'PUT') return proof(records.admitted);
    if (request.url.endsWith('/dispatch')) throw new Error('dispatch response lost');
    return proof(records.awaiting);
  });
  const first = owner.mount();
  await waitFor(() => expect(first.result.current.unavailable).toBe(false));
  act(() => first.result.current.actions.submitUpload());
  await waitFor(() => expect(owner.initial.uncertain).toBe(true));
  await waitFor(() => expect(owner.initial.uploadPending).toBe(false));
  first.unmount();
  owner.cache.clear();
  const reopened = owner.mount();
  await waitFor(() => expect(reopened.result.current.unavailable).toBe(false));
  expect(reopened.result.current.fields.file).toBe(owner.file);
  expect(owner.storage.result.current[0].id).toBe(owner.initial.id);
  expect(owner.uploads()).toEqual([
    'POST /documents-api/paperless/uploads',
    `PUT /documents-api/paperless/uploads/${owner.initial.id}/content`,
    `POST /documents-api/paperless/uploads/${owner.initial.id}/dispatch`,
  ]);
  act(() => reopened.result.current.actions.submitUpload());
  expect(owner.uploads()).toHaveLength(3);
  act(() => reopened.result.current.actions.recoverSelection());
  await waitFor(() => expect(owner.uploads()).toHaveLength(4));
  await waitFor(() => expect(owner.initial.uploadPending).toBe(false));
  expect(owner.uploads()[3]).toBe(`GET /documents-api/paperless/uploads/${owner.initial.id}`);
  expect(owner.initial.taskId).toBeNull();
  expect(owner.initial.uncertain).toBe(true);
});

it('claims one create, content PUT and dispatch when two active views share a session', async () => {
  const owner = harness(async (request, records) => {
    if (request.method === 'GET') return proof(records.accepted);
    if (request.method === 'PUT') return proof(records.admitted);
    if (request.url.endsWith('/dispatch')) return proof(records.accepted);
    expect(await request.json()).toEqual(records.input);
    return proof(records.awaiting);
  });
  const first = owner.mount();
  const second = owner.mount();
  await waitFor(() =>
    expect(first.result.current.unavailable || second.result.current.unavailable).toBe(false)
  );
  act(() => {
    first.result.current.actions.submitUpload();
    second.result.current.actions.submitUpload();
  });
  await waitFor(() => expect(owner.initial.taskId).toBe(owner.records.accepted.taskId));
  expect(owner.uploads().filter((request) => !request.startsWith('GET '))).toEqual([
    'POST /documents-api/paperless/uploads',
    `PUT /documents-api/paperless/uploads/${owner.initial.id}/content`,
    `POST /documents-api/paperless/uploads/${owner.initial.id}/dispatch`,
  ]);
  expect(first.result.current.fields.file).toBe(owner.file);
  expect(second.result.current.fields.file).toBe(owner.file);
});

it('delivers late acceptance only to the old receipt after replacing its selected File', async () => {
  const dispatch = deferred<Response>();
  const owner = harness((request, records) => {
    if (request.method === 'GET') return proof(records.accepted);
    if (request.method === 'PUT') return proof(records.admitted);
    return request.url.endsWith('/dispatch') ? dispatch.promise : proof(records.awaiting);
  });
  const view = owner.mount();
  await waitFor(() => expect(view.result.current.unavailable).toBe(false));
  act(() => view.result.current.actions.submitUpload());
  await waitFor(() => expect(owner.uploads()).toHaveLength(3));
  const replacement = new ReadableFile(['abc'], 'replacement.pdf', { type: 'application/pdf' });
  act(() => view.result.current.fields.setFile(replacement));
  view.rerender({ session: owner.storage.result.current[0] });
  const next = owner.storage.result.current[0];
  await act(async () => dispatch.resolve(proof(owner.records.accepted)));
  await waitFor(() => expect(owner.initial.taskId).toBe(owner.records.accepted.taskId));
  expect(owner.initial.taskReceipt?.taskId).toBe(owner.records.accepted.taskId);
  expect(next.id).not.toBe(owner.initial.id);
  expect(next.file).toBe(replacement);
  expect(next.taskId).toBeNull();
  expect(next.taskReceipt).toBeNull();
  expect(next.uncertain).toBe(false);
  expect(view.result.current.documentId).toBeUndefined();
  expect(owner.uploads()).toHaveLength(3);
});

it.each(['before submit', 'after hashing'])(
  'sends no request to a mutated owner origin %s',
  async (timing) => {
    const owner = harness((_request, records) => proof(records.awaiting));
    let flipAtFence = false;
    const flipOrigin = () =>
      owner.client.setConfig({ baseUrl: 'https://owner-b.test/documents-api' });
    const view = owner.mount(() => {
      if (flipAtFence) {
        flipAtFence = false;
        flipOrigin();
      }
    });
    await waitFor(() => expect(view.result.current.unavailable).toBe(false));
    if (timing === 'before submit') flipOrigin();
    else flipAtFence = true;
    act(() => view.result.current.actions.submitUpload());
    await waitFor(() => expect(owner.initial.uploadError).not.toBeNull());
    await waitFor(() => expect(owner.initial.uploadPending).toBe(false));
    expect(owner.uploads()).toEqual([]);
    expect(
      owner.requests.every((request) => new URL(request.url).origin === 'https://owner-a.test')
    ).toBe(true);
    expect(owner.initial.taskId).toBeNull();
    expect(owner.initial.file).toBe(owner.file);
  }
);

it('retains a verified original but does not link it through a different configured Paperless archive', async () => {
  let matches = false;
  const owner = harness((request, records) => {
    if (request.method === 'PUT') return proof(records.admitted);
    if (request.method === 'GET' || request.url.endsWith('/dispatch'))
      return proof({ ...records.accepted, state: 'done', documentId: 91, ownerMatches: matches });
    return proof(records.awaiting);
  });
  const view = owner.mount();
  await waitFor(() => expect(view.result.current.unavailable).toBe(false));
  act(() => view.result.current.actions.submitUpload());
  await waitFor(() => expect(owner.initial.taskReceipt?.result.documentId).toBe(91));
  expect(view.result.current.documentId).toBeUndefined();
  expect(view.result.current.error).toContain('original Documents archive');
  matches = true;
  await act(async () => {
    await view.result.current.taskQuery.refetch();
  });
  await waitFor(() => expect(view.result.current.documentId).toBe(91));
  expect(owner.uploads().filter((request) => !request.startsWith('GET '))).toHaveLength(3);
});
