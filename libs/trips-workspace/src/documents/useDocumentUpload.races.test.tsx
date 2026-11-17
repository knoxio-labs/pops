import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createDurableUploadWire,
  readableUploadFile,
  uploadWebCrypto,
} from './durable-upload-wire-test-utils';
import { documentQueryKeys } from './query-keys';
import { useDocumentUpload } from './useDocumentUpload';
import { createDocumentUploadSession } from './useUploadFields';

import type { ReactNode } from 'react';

import type { PendingUploadDispatch } from './durable-upload-wire-test-utils';
import type { DocumentUploadSession } from './useUploadFields';

const caches: QueryClient[] = [];
beforeEach(() => {
  vi.stubGlobal('crypto', uploadWebCrypto);
});
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  vi.unstubAllGlobals();
});

function harness(file: File, deferTasks = false) {
  const wire = createDurableUploadWire({ deferReads: deferTasks });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
  caches.push(cache);
  const storage = renderHook(() => useState(createDocumentUploadSession(file)));
  const mount = (queryCache = cache) =>
    renderHook(
      ({ session }: { session: DocumentUploadSession }) => {
        const controller = useDocumentUpload({
          session,
          onSessionChange: storage.result.current[1],
          documentsClient: wire.client,
          journal: wire.persistence.journal,
        });
        return { ...controller, taskFetchStatus: controller.taskQuery.fetchStatus };
      },
      {
        initialProps: { session: storage.result.current[0] },
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={queryCache}>{children}</QueryClientProvider>
        ),
      }
    );
  return {
    ...wire,
    storage,
    mount,
    cache,
    postCount: wire.dispatchCount,
    expireTasks: wire.failReads,
  };
}

function pdf(name: string): File {
  return readableUploadFile('file', name);
}
async function accept(dispatches: readonly PendingUploadDispatch[]): Promise<void> {
  await act(async () => {
    for (const dispatch of dispatches) dispatch.accept('first-task');
  });
}
function taskKey(owner: ReturnType<typeof harness>, baseUrl = owner.client.getConfig().baseUrl) {
  const [kind] = documentQueryKeys.task(owner.client, 'first-task');
  return [
    kind,
    baseUrl,
    owner.storage.result.current[0].intent.durable.persistenceBinding(),
    'first-task',
  ];
}

describe('owner upload intent races through the actual client', () => {
  it('keeps a retained task in its captured owner cache across unmount and transport mutation', async () => {
    const owner = harness(pdf('first.pdf'));
    const first = owner.mount();
    await waitFor(() => expect(first.result.current.unavailable).toBe(false));
    act(() => first.result.current.actions.submitUpload());
    await waitFor(() => expect(owner.dispatches).toHaveLength(1));
    await accept(owner.dispatches);
    await waitFor(() => expect(first.result.current.documentId).toBe(91));
    const originalKey = taskKey(owner);
    first.unmount();
    owner.cache.clear();
    owner.client.setConfig({ baseUrl: 'https://other.example/documents-api' });
    const reopened = owner.mount();
    await waitFor(() => expect(reopened.result.current.taskQuery.fetchStatus).toBe('idle'));
    expect(owner.cache.getQueryData(taskKey(owner))).toBeUndefined();
    expect(reopened.result.current.taskQuery.isError).toBe(true);
    expect(owner.cache.getQueryData(originalKey)).toEqual({
      state: 'done',
      documentId: 91,
      reason: null,
    });
    expect(reopened.result.current.documentId).toBeUndefined();
    expect(owner.storage.result.current[0].taskReceipt?.result.documentId).toBe(91);
    expect(
      owner.requests.every((request) => new URL(request.url).origin === 'https://owner-a.test')
    ).toBe(true);
    expect(owner.postCount()).toBe(1);
  });
  it('preserves a verified original after later pending proof, cache eviction and an unavailable owner lookup', async () => {
    const owner = harness(pdf('first.pdf'), true);
    const first = owner.mount();
    await waitFor(() => expect(first.result.current.unavailable).toBe(false));
    act(() => first.result.current.actions.submitUpload());
    await waitFor(() => expect(owner.dispatches).toHaveLength(1));
    await accept(owner.dispatches);
    first.rerender({ session: owner.storage.result.current[0] });
    await waitFor(() => expect(owner.reads).toHaveLength(1));
    const original = owner.reads[0];
    if (original === undefined) throw new Error('Owner original lookup missing.');
    await act(async () => original.done(91));
    await waitFor(() => expect(first.result.current.documentId).toBe(91));
    first.unmount();
    const freshCache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    caches.push(freshCache);
    const priorReadCount = owner.reads.length;
    const second = owner.mount(freshCache);
    await waitFor(() => expect(owner.reads.length).toBeGreaterThan(priorReadCount));
    const later = owner.reads[priorReadCount];
    if (later === undefined) throw new Error('Later owner lookup missing.');
    await act(async () => later.pending());
    expect(owner.reads).toHaveLength(priorReadCount + 1);
    await waitFor(() => expect(second.result.current.taskFetchStatus).toBe('idle'));
    expect(second.result.current.documentId).toBe(91);
    expect(owner.storage.result.current[0].taskReceipt?.result.documentId).toBe(91);
    second.unmount();
    owner.cache.clear();
    freshCache.clear();
    owner.expireTasks();
    const reopened = owner.mount();
    await waitFor(() => expect(reopened.result.current.taskQuery.isError).toBe(true));
    expect(reopened.result.current.documentId).toBe(91);
    expect(owner.createCount()).toBe(1);
    expect(owner.putCount()).toBe(1);
    expect(owner.postCount()).toBe(1);
  });
  it('retains a late owner result only on its accepted task and originating File generation', async () => {
    const file = pdf('first.pdf');
    const owner = harness(file, true);
    const view = owner.mount();
    await waitFor(() => expect(view.result.current.unavailable).toBe(false));
    const firstSession = owner.storage.result.current[0];
    act(() => view.result.current.actions.submitUpload());
    await waitFor(() => expect(owner.dispatches).toHaveLength(1));
    await accept(owner.dispatches);
    view.rerender({ session: owner.storage.result.current[0] });
    await waitFor(() => expect(owner.reads).toHaveLength(1));
    const beforeWrongTask = firstSession.taskReceipt;
    act(() =>
      view.result.current.fields.setTaskReceipt('different-task', {
        state: 'done',
        documentId: 999,
        reason: null,
      })
    );
    expect(firstSession.taskReceipt).toEqual(beforeWrongTask);
    act(() => owner.storage.result.current[1](createDocumentUploadSession(file)));
    view.rerender({ session: owner.storage.result.current[0] });
    const complete = owner.reads[0];
    if (complete === undefined) throw new Error('Owner task was not captured');
    view.unmount();
    await act(async () => complete.done(91));
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
      await accept(owner.dispatches);
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
      for (const dispatch of owner.dispatches) dispatch.fail(new Error('connection closed'));
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
    await accept(owner.dispatches);
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
    await accept(owner.dispatches);
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
      const respond = owner.dispatches[0];
      if (respond === undefined) throw new Error('First owner request was not captured');
      await act(async () => {
        if (outcome === 'accept') respond.accept('first-task');
        else respond.fail(new Error('connection closed'));
      });
      expect(owner.storage.result.current[0].uploadPending).toBe(true);
      expect(owner.storage.result.current[0].taskId).toBeNull();
      expect(owner.storage.result.current[0].uncertain).toBe(false);
      view.rerender({ session: owner.storage.result.current[0] });
      act(() => view.result.current.actions.submitUpload());
      expect(owner.postCount()).toBe(2);
      const secondResponse = owner.dispatches[1];
      if (secondResponse === undefined) throw new Error('Second owner request was not captured');
      await act(async () => secondResponse.accept('second-task'));
      expect(owner.storage.result.current[0].taskId).toBe('second-task');
    }
  );

  it('claims one upstream dispatch synchronously when two views share the same file intent', async () => {
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
    await waitFor(() => expect(owner.dispatches.length).toBeGreaterThan(0));
    await accept(owner.dispatches);
    expect(owner.postCount()).toBe(1);
    expect(owner.storage.result.current[0].taskId).toBe('first-task');
  });
});
