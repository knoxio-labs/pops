import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createDurableUploadWire,
  readableUploadFile,
  uploadWebCrypto,
} from './durable-upload-wire-test-utils';
import { useDocumentUpload } from './useDocumentUpload';
import { createDocumentUploadSession } from './useUploadFields';

import type { ReactNode } from 'react';

import type { DurableUploadRecord } from './durable-upload-api';
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

function mountOwner(file: File, wire = createDurableUploadWire()) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 60_000 }, mutations: { retry: 2 } },
  });
  caches.push(cache);
  const storage = renderHook(() => useState(createDocumentUploadSession(file)));
  const mountView = () =>
    renderHook(
      ({ session }: { session: DocumentUploadSession }) =>
        useDocumentUpload({
          session,
          onSessionChange: storage.result.current[1],
          documentsClient: wire.client,
          journal: wire.persistence.journal,
        }),
      {
        initialProps: { session: storage.result.current[0] },
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={cache}>{children}</QueryClientProvider>
        ),
      }
    );
  return { storage, mountView, wire };
}

function pdf(contents: string): File {
  return readableUploadFile(contents, 'same.pdf');
}

describe('controlled Documents owner uploads', () => {
  it('retains the exact File and pending dispatch across unmount, then keeps the accepted task without reupload', async () => {
    const file = pdf('one');
    const { storage, mountView, wire } = mountOwner(file);
    const originalView = mountView();
    await waitFor(() => expect(originalView.result.current.unavailable).toBe(false));
    act(() => {
      originalView.result.current.actions.submitUpload();
      originalView.result.current.actions.submitUpload();
    });
    await waitFor(() => expect(wire.dispatches).toHaveLength(1));
    expect(storage.result.current[0].file).toBe(file);
    expect(storage.result.current[0].uploadPending).toBe(true);
    originalView.unmount();
    const restoredView = mountView();
    act(() => restoredView.result.current.actions.submitUpload());
    expect(wire.dispatchCount()).toBe(1);
    const dispatch = wire.dispatches[0];
    if (dispatch === undefined) throw new Error('Owner dispatch missing.');
    await act(async () => dispatch.accept('owner-task'));
    expect(storage.result.current[0].taskId).toBe('owner-task');
    expect(storage.result.current[0].uploadPending).toBe(false);
    restoredView.rerender({ session: storage.result.current[0] });
    await waitFor(() => expect(restoredView.result.current.documentId).toBe(91));
    act(() => restoredView.result.current.actions.submitUpload());
    expect(wire.createCount()).toBe(1);
    expect(wire.putCount()).toBe(1);
    expect(wire.dispatchCount()).toBe(1);
    expect(storage.result.current[0].taskId).toBe('owner-task');
    expect(storage.result.current[0].file).toBe(file);
    expect(
      wire.requests.every((request) =>
        new URL(request.url).pathname.startsWith('/documents-api/paperless/')
      )
    ).toBe(true);
  });

  it('requires canonical GET before explicitly retrying a rejected file without resending an accepted file', async () => {
    const first = pdf('one');
    const second = pdf('two');
    const a = mountOwner(
      first,
      createDurableUploadWire({ deferDispatch: false, taskId: 'first-task' })
    );
    const b = mountOwner(second, createDurableUploadWire({ documentId: 92 }));
    const viewA = a.mountView();
    const viewB = b.mountView();
    await waitFor(() =>
      expect(viewA.result.current.unavailable || viewB.result.current.unavailable).toBe(false)
    );
    act(() => {
      viewA.result.current.actions.submitUpload();
      viewB.result.current.actions.submitUpload();
    });
    await waitFor(() => expect(b.wire.dispatches).toHaveLength(1));
    const rejected = b.wire.dispatches[0];
    if (rejected === undefined) throw new Error('Rejected dispatch missing.');
    await act(async () =>
      rejected.reject(422, {
        code: 'documents.upload.invalid',
        message: 'Rejected',
        retryable: false,
        requestId: 'rejected-upload-test',
      })
    );
    await waitFor(() => expect(b.storage.result.current[0].uncertain).toBe(true));
    await waitFor(() => expect(a.storage.result.current[0].taskId).toBe('first-task'));
    viewA.rerender({ session: a.storage.result.current[0] });
    viewB.rerender({ session: b.storage.result.current[0] });
    act(() => {
      viewA.result.current.actions.submitUpload();
      viewB.result.current.actions.submitUpload();
    });
    expect(b.wire.dispatchCount()).toBe(1);
    act(() => viewB.result.current.actions.recoverSelection());
    await waitFor(() => expect(b.storage.result.current[0].uncertain).toBe(false));
    await waitFor(() => expect(b.storage.result.current[0].uploadPending).toBe(false));
    expect(
      b.wire.requests.some(
        (request) =>
          request.method === 'GET' && request.url.endsWith(`/uploads/${rejected.input.operationId}`)
      )
    ).toBe(true);
    act(() => viewB.result.current.actions.submitUpload());
    await waitFor(() => expect(b.wire.dispatches).toHaveLength(2));
    const retried = b.wire.dispatches[1];
    if (retried === undefined) throw new Error('Explicit dispatch retry missing.');
    expect(retried.input).toEqual(rejected.input);
    await act(async () => retried.accept('second-task'));
    await waitFor(() => expect(b.storage.result.current[0].taskId).toBe('second-task'));
    expect(a.wire.dispatchCount()).toBe(1);
    expect(b.wire.createCount()).toBe(1);
    expect(b.wire.putCount()).toBe(1);
    expect(b.storage.result.current[0].file).toBe(second);
  });

  it('retains uncertainty across remount and admits a recovered task only from canonical owner proof', async () => {
    const { storage, mountView, wire } = mountOwner(
      pdf('one'),
      createDurableUploadWire({ readState: 'accepted' })
    );
    const view = mountView();
    await waitFor(() => expect(view.result.current.unavailable).toBe(false));
    act(() => view.result.current.actions.submitUpload());
    await waitFor(() => expect(wire.dispatches).toHaveLength(1));
    const dispatch = wire.dispatches[0];
    if (dispatch === undefined) throw new Error('Owner dispatch missing.');
    await act(async () => dispatch.fail(new Error('unrecognized upload response')));
    await waitFor(() => expect(storage.result.current[0].uncertain).toBe(true));
    view.unmount();
    const restored = mountView();
    act(() => restored.result.current.actions.submitUpload());
    expect(wire.dispatchCount()).toBe(1);
    expect(restored.result.current.documentId).toBeUndefined();
    const accepted: DurableUploadRecord = {
      input: dispatch.input,
      ownerMatches: true,
      state: 'accepted',
      contentAvailable: true,
      taskId: 'recovered-task',
      documentId: null,
      reason: null,
    };
    wire.records.set(dispatch.input.operationId, accepted);
    act(() => restored.result.current.actions.recoverSelection());
    await waitFor(() => expect(storage.result.current[0].taskId).toBe('recovered-task'));
    expect(restored.result.current.documentId).toBeUndefined();
    expect(storage.result.current[0].taskId).toBe('recovered-task');
    expect(wire.dispatchCount()).toBe(1);
  });
});
