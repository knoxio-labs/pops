import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { DocumentUploadProvider } from '../documents/DocumentUploadProvider';
import {
  createDurableUploadWire,
  readableUploadFile,
  uploadWebCrypto,
} from '../documents/durable-upload-wire-test-utils';
import { useDocumentUpload } from '../documents/useDocumentUpload';
import { createClient as createTripsClient } from '../trips-api/client';
import { findCaptureSession, retainCaptureSession } from './browser-session';
import { captureResult, captureSource } from './test-utils';

import type { ReactNode } from 'react';

import type { CaptureBrowserSession } from './browser-session';

const caches: QueryClient[] = [];
beforeEach(() => vi.stubGlobal('crypto', uploadWebCrypto));
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  vi.unstubAllGlobals();
});

function uploadView(
  session: CaptureBrowserSession,
  id: string,
  cache: QueryClient,
  owner: ReturnType<typeof createDurableUploadWire>
) {
  const tripsClient = createTripsClient({ baseUrl: 'https://owner-a.test/trips-api' });
  return renderHook(
    () => {
      const retained = session.upload(id);
      if (retained === undefined) throw new Error('Missing upload');
      return useDocumentUpload({
        session: retained,
        onSessionChange: session.updateUpload(id),
        documentsClient: owner.client,
      });
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={cache}>
          <DocumentUploadProvider
            tripId={1}
            host={owner.host}
            documentsClient={owner.client}
            tripsClient={tripsClient}
          >
            {children}
          </DocumentUploadProvider>
        </QueryClientProvider>
      ),
    }
  );
}

it('retains actual durable upload receipts before acceptance and after unmount without collapsing matching filenames', async () => {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  caches.push(cache);
  const owner = createDurableUploadWire({ readState: 'accepted' });
  const perform = vi.fn(async (request: Parameters<typeof captureResult>[0]) =>
    captureResult(request)
  );
  const session = retainCaptureSession(cache, { tripId: 1 }, captureSource(), { perform });
  const file = readableUploadFile('bytes', 'same.pdf');
  session.addFile(file);
  session.addFile(readableUploadFile('different bytes', 'same.pdf'));
  const [first, second] = session.editor.getState().draft.selections;
  if (first === undefined || second === undefined) throw new Error('Missing selections');
  const mounted = uploadView(session, first.id, cache, owner);
  await waitFor(() => expect(mounted.result.current.policy).not.toBeNull());
  act(() => mounted.result.current.actions.submitUpload());
  expect(session.upload(first.id)?.uploadPending).toBe(true);
  await waitFor(() => expect(owner.dispatches).toHaveLength(1));
  const dispatch = owner.dispatches[0];
  if (dispatch === undefined) throw new Error('Original dispatch missing.');
  mounted.unmount();
  const remounted = uploadView(session, first.id, cache, owner);
  act(() => remounted.result.current.actions.submitUpload());
  expect(owner.dispatchCount()).toBe(1);
  await act(async () => dispatch.accept('accepted'));
  await waitFor(() => expect(session.upload(first.id)?.taskId).toBe('accepted'));
  expect(session.editor.getState().draft.selections[0]?.references).toEqual([
    { kind: 'task', taskId: 'accepted' },
  ]);
  expect(session.upload(first.id)?.file).toBe(file);
  expect(session.upload(first.id)?.intent.durable.readInput()).toEqual(dispatch.input);
  expect(session.upload(second.id)?.taskId).toBeNull();
  expect(findCaptureSession(cache, { tripId: 1 })).toBe(session);
  expect(findCaptureSession(cache, { tripId: 2 })).toBeUndefined();
  expect(findCaptureSession(new QueryClient(), { tripId: 1 })).toBeUndefined();
  expect(owner.createCount()).toBe(1);
  expect(owner.putCount()).toBe(1);
  expect(owner.dispatchCount()).toBe(1);
  expect(perform).not.toHaveBeenCalled();
});
