import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createClient } from '../documents-api/client';
import { documentQueryKeys } from './query-keys';
import { useDocumentUpload } from './useDocumentUpload';
import { createDocumentUploadSession } from './useUploadFields';

import type { ReactNode } from 'react';

import type { DocumentUploadSession } from './useUploadFields';

const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
});

function harness(file: File, deferTasks = false) {
  const responses: Array<(response: Response) => void> = [];
  const failures: Array<(error: Error) => void> = [];
  const taskResponses: Array<(response: Response) => void> = [];
  let taskUnavailable = false;
  let postCount = 0;
  const client = createClient({
    baseUrl: 'https://pops.example/documents-api',
    fetch: vi.fn<typeof fetch>(async (input) => {
      const request = input instanceof Request ? input : new Request(input);
      if (request.method === 'POST') {
        postCount += 1;
        return new Promise<Response>((resolve, reject) => {
          responses.push(resolve);
          failures.push(reject);
        });
      }
      if (request.url.endsWith('/paperless/status'))
        return Response.json({
          data: {
            configured: true,
            available: true,
            maxUploadBytes: 1000,
            allowedMimeTypes: ['application/pdf'],
          },
        });
      if (request.url.includes('/paperless/tasks/')) {
        if (taskUnavailable) throw new Error('Task owner unavailable');
        if (deferTasks) return new Promise<Response>((resolve) => taskResponses.push(resolve));
        return Response.json({ data: { state: 'done', documentId: 91, reason: null } });
      }
      throw new Error('Unexpected owner request');
    }),
  });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
  caches.push(cache);
  const storage = renderHook(() => useState(createDocumentUploadSession(file)));
  const mount = (queryCache = cache) =>
    renderHook(
      ({ session }: { session: DocumentUploadSession }) =>
        useDocumentUpload({
          session,
          onSessionChange: storage.result.current[1],
          documentsClient: client,
        }),
      {
        initialProps: { session: storage.result.current[0] },
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={queryCache}>{children}</QueryClientProvider>
        ),
      }
    );
  return {
    storage,
    mount,
    cache,
    client,
    postCount: () => postCount,
    responses,
    failures,
    taskResponses,
    expireTasks: () => {
      taskUnavailable = true;
    },
  };
}

function pdf(name: string): File {
  return new File(['file'], name, { type: 'application/pdf' });
}

async function accept(responses: Array<(response: Response) => void>): Promise<void> {
  await act(async () => {
    for (const respond of responses)
      respond(Response.json({ data: { taskId: 'first-task' } }, { status: 202 }));
  });
}

describe('owner upload intent races through the actual client', () => {
  it('preserves a verified original after an older view returns pending, cache eviction and unavailable lookup', async () => {
    const owner = harness(pdf('first.pdf'), true);
    const first = owner.mount();
    await waitFor(() => expect(first.result.current.unavailable).toBe(false));
    act(() => first.result.current.actions.submitUpload());
    await waitFor(() => expect(owner.responses).toHaveLength(1));
    await accept(owner.responses);
    first.rerender({ session: owner.storage.result.current[0] });
    await waitFor(() => expect(owner.taskResponses).toHaveLength(1));
    first.unmount();
    const freshCache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    caches.push(freshCache);
    const second = owner.mount(freshCache);
    await waitFor(() => expect(owner.taskResponses).toHaveLength(2));
    const [oldResult, newResult] = owner.taskResponses;
    if (oldResult === undefined || newResult === undefined) throw new Error('Task lookups missing');
    await act(async () =>
      newResult(Response.json({ data: { state: 'done', documentId: 91, reason: null } }))
    );
    await waitFor(() => expect(second.result.current.documentId).toBe(91));
    await act(async () =>
      oldResult(Response.json({ data: { state: 'pending', documentId: null, reason: null } }))
    );
    await waitFor(() =>
      expect(
        owner.cache.getQueryState(documentQueryKeys.task(owner.client, 'first-task'))?.fetchStatus
      ).toBe('idle')
    );
    expect(owner.storage.result.current[0].taskReceipt?.result.documentId).toBe(91);
    second.unmount();
    owner.cache.clear();
    freshCache.clear();
    owner.expireTasks();
    const reopened = owner.mount();
    await waitFor(() => expect(reopened.result.current.taskQuery.isError).toBe(true));
    expect(reopened.result.current.documentId).toBe(91);
    expect(owner.postCount()).toBe(1);
  });
  it('retains a late owner result only on its accepted task and originating File generation', async () => {
    const file = pdf('first.pdf');
    const owner = harness(file, true);
    const view = owner.mount();
    await waitFor(() => expect(view.result.current.unavailable).toBe(false));
    const firstSession = owner.storage.result.current[0];
    act(() => view.result.current.actions.submitUpload());
    await waitFor(() => expect(owner.responses).toHaveLength(1));
    await accept(owner.responses);
    view.rerender({ session: owner.storage.result.current[0] });
    await waitFor(() => expect(owner.taskResponses).toHaveLength(1));
    act(() =>
      view.result.current.fields.setTaskReceipt('different-task', {
        state: 'done',
        documentId: 999,
        reason: null,
      })
    );
    expect(firstSession.taskReceipt).toBeNull();
    act(() => owner.storage.result.current[1](createDocumentUploadSession(file)));
    view.rerender({ session: owner.storage.result.current[0] });
    const complete = owner.taskResponses[0];
    if (complete === undefined) throw new Error('Owner task was not captured');
    view.unmount();
    await act(async () =>
      complete(Response.json({ data: { state: 'done', documentId: 91, reason: null } }))
    );
    await waitFor(() => expect(firstSession.taskReceipt?.result.documentId).toBe(91));
    expect(firstSession.taskReceipt?.taskId).toBe('first-task');
    expect(owner.storage.result.current[0].taskReceipt).toBeNull();
    expect(owner.storage.result.current[0].id).not.toBe(firstSession.id);
  });
  it.each([false, true])(
    'binds late acceptance to the originating intent, including same-File ABA: %s',
    async (sameFile) => {
      const firstFile = pdf('first.pdf');
      const secondFile = sameFile ? firstFile : pdf('second.pdf');
      const owner = harness(firstFile);
      const view = owner.mount();
      await waitFor(() => expect(view.result.current.unavailable).toBe(false));
      const firstSession = owner.storage.result.current[0];
      act(() => view.result.current.actions.submitUpload());
      await waitFor(() => expect(owner.postCount()).toBe(1));
      act(() => owner.storage.result.current[1](createDocumentUploadSession(secondFile)));
      view.rerender({ session: owner.storage.result.current[0] });
      await accept(owner.responses);
      view.rerender({ session: owner.storage.result.current[0] });
      expect(owner.storage.result.current[0].file).toBe(secondFile);
      expect(owner.storage.result.current[0].taskId).toBeNull();
      expect(view.result.current.documentId).toBeUndefined();
      expect(firstSession.taskId).toBe('first-task');
      act(() => owner.storage.result.current[1](firstSession));
      view.rerender({ session: owner.storage.result.current[0] });
      await waitFor(() => expect(view.result.current.documentId).toBe(91));
      act(() => view.result.current.actions.submitUpload());
      expect(owner.postCount()).toBe(1);
    }
  );

  it('retains a late unknown rejection on the old intent without marking the replacement uncertain', async () => {
    const owner = harness(pdf('first.pdf'));
    const view = owner.mount();
    await waitFor(() => expect(view.result.current.unavailable).toBe(false));
    const firstSession = owner.storage.result.current[0];
    act(() => view.result.current.actions.submitUpload());
    await waitFor(() => expect(owner.postCount()).toBe(1));
    act(() => owner.storage.result.current[1](createDocumentUploadSession(pdf('second.pdf'))));
    view.rerender({ session: owner.storage.result.current[0] });
    await act(async () => {
      for (const fail of owner.failures) fail(new Error('connection closed'));
    });
    expect(owner.storage.result.current[0].uncertain).toBe(false);
    expect(owner.storage.result.current[0].uploadError).toBeNull();
    expect(firstSession.uncertain).toBe(true);
  });

  it('creates a new generation through public clear and same-File reselection while retaining the old receipt', async () => {
    const file = pdf('first.pdf');
    const owner = harness(file);
    const view = owner.mount();
    await waitFor(() => expect(view.result.current.unavailable).toBe(false));
    const firstSession = owner.storage.result.current[0];
    act(() => view.result.current.actions.submitUpload());
    await waitFor(() => expect(owner.postCount()).toBe(1));
    act(() => view.result.current.fields.clearSelectedFile());
    view.rerender({ session: owner.storage.result.current[0] });
    act(() => view.result.current.fields.setFile(file));
    view.rerender({ session: owner.storage.result.current[0] });
    expect(owner.storage.result.current[0].id).not.toBe(firstSession.id);
    await accept(owner.responses);
    expect(owner.storage.result.current[0].file).toBe(file);
    expect(owner.storage.result.current[0].taskId).toBeNull();
    expect(firstSession.taskId).toBe('first-task');
  });

  it('permits separate explicit intents for the same File object without a global file lock', async () => {
    const file = pdf('first.pdf');
    const owner = harness(file);
    const view = owner.mount();
    await waitFor(() => expect(view.result.current.unavailable).toBe(false));
    const firstSession = owner.storage.result.current[0];
    act(() => view.result.current.actions.submitUpload());
    await waitFor(() => expect(owner.postCount()).toBe(1));
    act(() => owner.storage.result.current[1](createDocumentUploadSession(file)));
    view.rerender({ session: owner.storage.result.current[0] });
    act(() => view.result.current.actions.submitUpload());
    await waitFor(() => expect(owner.postCount()).toBe(2));
    await accept(owner.responses);
    expect(owner.storage.result.current[0].id).not.toBe(firstSession.id);
    expect(owner.storage.result.current[0].taskId).toBe('first-task');
    expect(firstSession.taskId).toBe('first-task');
  });

  it.each(['accept', 'reject'])(
    'a late %s cannot release a replacement intent already uploading',
    async (outcome) => {
      const owner = harness(pdf('first.pdf'));
      const view = owner.mount();
      await waitFor(() => expect(view.result.current.unavailable).toBe(false));
      act(() => view.result.current.actions.submitUpload());
      await waitFor(() => expect(owner.postCount()).toBe(1));
      act(() => owner.storage.result.current[1](createDocumentUploadSession(pdf('second.pdf'))));
      view.rerender({ session: owner.storage.result.current[0] });
      act(() => view.result.current.actions.submitUpload());
      await waitFor(() => expect(owner.postCount()).toBe(2));
      const respond = owner.responses[0];
      const fail = owner.failures[0];
      if (respond === undefined || fail === undefined)
        throw new Error('First owner request was not captured');
      await act(async () => {
        if (outcome === 'accept')
          respond(Response.json({ data: { taskId: 'first-task' } }, { status: 202 }));
        else fail(new Error('connection closed'));
      });
      expect(owner.storage.result.current[0].uploadPending).toBe(true);
      expect(owner.storage.result.current[0].taskId).toBeNull();
      expect(owner.storage.result.current[0].uncertain).toBe(false);
      view.rerender({ session: owner.storage.result.current[0] });
      act(() => view.result.current.actions.submitUpload());
      expect(owner.postCount()).toBe(2);
      const secondResponse = owner.responses[1];
      if (secondResponse === undefined) throw new Error('Second owner request was not captured');
      await act(async () =>
        secondResponse(Response.json({ data: { taskId: 'second-task' } }, { status: 202 }))
      );
      expect(owner.storage.result.current[0].taskId).toBe('second-task');
    }
  );

  it('claims one POST synchronously when two views share the same file intent', async () => {
    const owner = harness(pdf('first.pdf'));
    const first = owner.mount();
    const second = owner.mount();
    await waitFor(() =>
      expect(first.result.current.unavailable || second.result.current.unavailable).toBe(false)
    );
    act(() => {
      first.result.current.actions.submitUpload();
      second.result.current.actions.submitUpload();
    });
    await waitFor(() => expect(owner.responses.length).toBeGreaterThan(0));
    await accept(owner.responses);
    expect(owner.postCount()).toBe(1);
    expect(owner.storage.result.current[0].taskId).toBe('first-task');
  });
});
