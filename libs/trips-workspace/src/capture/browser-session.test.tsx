import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import {
  loadPaperlessTask,
  loadPaperlessUploadPolicy,
  uploadPaperlessDocument,
} from '../documents/api';
import { useDocumentUpload } from '../documents/useDocumentUpload';
import { findCaptureSession, retainCaptureSession } from './browser-session';
import { captureResult, captureSource, deferred } from './test-utils';

import type { ReactNode } from 'react';

import type { CaptureBrowserSession } from './browser-session';

vi.mock('../documents/api', async (original) => ({
  ...(await original<typeof import('../documents/api')>()),
  loadPaperlessTask: vi.fn(),
  loadPaperlessUploadPolicy: vi.fn(),
  uploadPaperlessDocument: vi.fn(),
}));

function uploadView(
  session: CaptureBrowserSession,
  id: string,
  cache: QueryClient
): ReturnType<typeof renderHook<ReturnType<typeof useDocumentUpload>, undefined>> {
  return renderHook(
    () => {
      const retained = session.upload(id);
      if (!retained) throw new Error('Missing upload');
      return useDocumentUpload({ session: retained, onSessionChange: session.updateUpload(id) });
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={cache}>{children}</QueryClientProvider>
      ),
    }
  );
}

it('retains actual upload receipts before acceptance and after unmount without collapsing matching filenames', async () => {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const accepted = deferred<string>();
  vi.mocked(loadPaperlessUploadPolicy).mockResolvedValue({
    configured: true,
    available: true,
    maxUploadBytes: 1000,
    allowedMimeTypes: ['application/pdf'],
  });
  vi.mocked(loadPaperlessTask).mockResolvedValue({
    state: 'pending',
    documentId: null,
    reason: null,
  });
  vi.mocked(uploadPaperlessDocument).mockReturnValue(accepted.promise);
  const session = retainCaptureSession(cache, { tripId: 1 }, captureSource(), {
    perform: async (request) => captureResult(request),
  });
  const file = new File(['bytes'], 'same.pdf', { type: 'application/pdf' });
  session.addFile(file);
  session.addFile(new File(['different bytes'], 'same.pdf', { type: 'application/pdf' }));
  const [first, second] = session.editor.getState().draft.selections;
  if (!first || !second) throw new Error('Missing selections');
  const mounted = uploadView(session, first.id, cache);
  await waitFor(() => expect(mounted.result.current.policy).not.toBeNull());
  act(() => mounted.result.current.actions.submitUpload());
  expect(session.upload(first.id)?.uploadPending).toBe(true);
  await waitFor(() => expect(uploadPaperlessDocument).toHaveBeenCalledTimes(1));
  mounted.unmount();
  const remounted = uploadView(session, first.id, cache);
  act(() => remounted.result.current.actions.submitUpload());
  expect(uploadPaperlessDocument).toHaveBeenCalledTimes(1);
  accepted.resolve('accepted');
  await waitFor(() => expect(session.upload(first.id)?.taskId).toBe('accepted'));
  expect(session.editor.getState().draft.selections[0]?.references).toEqual([
    { kind: 'task', taskId: 'accepted' },
  ]);
  expect(session.upload(first.id)?.file).toBe(file);
  expect(session.upload(second.id)?.taskId).toBeNull();
  expect(findCaptureSession(cache, { tripId: 1 })).toBe(session);
  expect(findCaptureSession(cache, { tripId: 2 })).toBeUndefined();
  expect(findCaptureSession(new QueryClient(), { tripId: 1 })).toBeUndefined();
  remounted.unmount();
  cache.clear();
});
