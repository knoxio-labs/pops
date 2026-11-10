import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@pops/pillar-sdk/client';

import {
  associatePaperlessDocument,
  loadPaperlessTask,
  loadPaperlessUploadPolicy,
  uploadPaperlessDocument,
} from './api';
import { useDocumentUpload } from './useDocumentUpload';
import { createDocumentUploadSession } from './useUploadFields';

import type { ReactNode } from 'react';

import type { DocumentUploadSession } from './useUploadFields';

vi.mock('./api', () => ({
  associatePaperlessDocument: vi.fn(),
  loadPaperlessTask: vi.fn(),
  loadPaperlessUploadPolicy: vi.fn(),
  uploadPaperlessDocument: vi.fn(),
}));

const upload = vi.mocked(uploadPaperlessDocument);
const task = vi.mocked(loadPaperlessTask);
const caches: QueryClient[] = [];

beforeEach(() => {
  vi.mocked(loadPaperlessUploadPolicy).mockResolvedValue({
    configured: true,
    available: true,
    maxUploadBytes: 1000,
    allowedMimeTypes: ['application/pdf'],
  });
});

afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  vi.resetAllMocks();
});

function mountOwner(file: File) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 60_000 }, mutations: { retry: 2 } },
  });
  caches.push(cache);
  const storage = renderHook(() => useState(createDocumentUploadSession(file)));
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
  const mountView = () =>
    renderHook(
      ({ session }: { session: DocumentUploadSession }) =>
        useDocumentUpload({ session, onSessionChange: storage.result.current[1] }),
      {
        initialProps: { session: storage.result.current[0] },
        wrapper: Wrapper,
      }
    );
  return { storage, mountView };
}

function pdf(contents: string): File {
  return new File([contents], 'same.pdf', { type: 'application/pdf', lastModified: 1 });
}

describe('controlled Documents owner uploads', () => {
  it('retains the exact File and pending POST across unmount, then keeps the accepted task without reupload', async () => {
    let accept: ((id: string) => void) | undefined;
    upload.mockImplementation(
      () =>
        new Promise((resolve) => {
          accept = resolve;
        })
    );
    task.mockResolvedValue({ state: 'done', documentId: 91, reason: null });
    const file = pdf('one');
    const { storage, mountView } = mountOwner(file);
    const originalView = mountView();
    await waitFor(() => expect(originalView.result.current.unavailable).toBe(false));
    act(() => {
      originalView.result.current.actions.submitUpload();
      originalView.result.current.actions.submitUpload();
    });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(storage.result.current[0].file).toBe(file);
    expect(storage.result.current[0].uploadPending).toBe(true);
    originalView.unmount();
    const restoredView = mountView();
    act(() => restoredView.result.current.actions.submitUpload());
    expect(upload).toHaveBeenCalledTimes(1);
    const resolveAcceptance = accept;
    if (resolveAcceptance === undefined) throw new Error('Upload acceptance was not captured');
    await act(async () => resolveAcceptance('owner-task'));
    expect(storage.result.current[0].taskId).toBe('owner-task');
    expect(storage.result.current[0].uploadPending).toBe(false);
    restoredView.rerender({ session: storage.result.current[0] });
    await waitFor(() => expect(restoredView.result.current.documentId).toBe(91));
    act(() => restoredView.result.current.actions.submitUpload());
    expect(upload).toHaveBeenCalledTimes(1);
    expect(storage.result.current[0].taskId).toBe('owner-task');
    expect(storage.result.current[0].file).toBe(file);
    expect(associatePaperlessDocument).not.toHaveBeenCalled();
  });

  it('retries a definitely rejected file independently while never resending another accepted file', async () => {
    const first = pdf('one');
    const second = pdf('two');
    let secondAttempts = 0;
    upload.mockImplementation(async (file) => {
      if (file === first) return 'first-task';
      secondAttempts += 1;
      if (secondAttempts === 1)
        throw new ApiError({
          code: 'paperless.invalid_upload',
          kind: 'client',
          message: 'Rejected',
          retryable: false,
          status: 422,
        });
      return 'second-task';
    });
    task.mockImplementation(async (id) => ({
      state: 'duplicate',
      documentId: id === 'first-task' ? 91 : 92,
      reason: null,
    }));
    const a = mountOwner(first);
    const b = mountOwner(second);
    const viewA = a.mountView();
    const viewB = b.mountView();
    await waitFor(() =>
      expect(viewA.result.current.unavailable || viewB.result.current.unavailable).toBe(false)
    );
    act(() => {
      viewA.result.current.actions.submitUpload();
      viewB.result.current.actions.submitUpload();
    });
    await waitFor(() => expect(b.storage.result.current[0].uploadRejected).toBe(true));
    expect(a.storage.result.current[0].taskId).toBe('first-task');
    viewA.rerender({ session: a.storage.result.current[0] });
    viewB.rerender({ session: b.storage.result.current[0] });
    act(() => {
      viewA.result.current.actions.submitUpload();
      viewB.result.current.actions.submitUpload();
    });
    await waitFor(() => expect(b.storage.result.current[0].taskId).toBe('second-task'));
    expect(upload.mock.calls.map(([file]) => file)).toEqual([first, second, second]);
    expect(b.storage.result.current[0].file).toBe(second);
    expect(associatePaperlessDocument).not.toHaveBeenCalled();
  });

  it('retains an uncertain response across remount and does not treat a pending task identity as an original', async () => {
    upload.mockRejectedValue(new Error('unrecognized upload response'));
    const { storage, mountView } = mountOwner(pdf('one'));
    const view = mountView();
    await waitFor(() => expect(view.result.current.unavailable).toBe(false));
    act(() => view.result.current.actions.submitUpload());
    await waitFor(() => expect(storage.result.current[0].uncertain).toBe(true));
    view.unmount();
    const restored = mountView();
    act(() => restored.result.current.actions.submitUpload());
    expect(upload).toHaveBeenCalledTimes(1);
    expect(restored.result.current.documentId).toBeUndefined();
    task.mockResolvedValue({ state: 'pending', documentId: 91, reason: null });
    act(() => restored.result.current.fields.setTaskId('recovered-task'));
    restored.rerender({ session: storage.result.current[0] });
    await waitFor(() => expect(task).toHaveBeenCalledWith('recovered-task', undefined));
    expect(restored.result.current.documentId).toBeUndefined();
    expect(storage.result.current[0].taskId).toBe('recovered-task');
  });
});
