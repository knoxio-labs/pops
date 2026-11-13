import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { DocumentUploadProvider } from '../documents/DocumentUploadProvider';
import {
  createDurableUploadWire,
  readableUploadFile,
  uploadWebCrypto,
} from '../documents/durable-upload-wire-test-utils';
import { createClient as createTripsClient } from '../trips-api/client';
import { CaptureBrowserSession } from './browser-session';
import { CaptureUpload } from './CaptureUpload';
import { captureResult, captureSource } from './test-utils';

const caches: QueryClient[] = [];
beforeEach(() => vi.stubGlobal('crypto', uploadWebCrypto));
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  vi.unstubAllGlobals();
});

it('keeps UUID recovery bound to the original Documents owner without losing the selected File', async () => {
  const user = userEvent.setup();
  const origin = 'https://owner.example/documents-api';
  const owner = createDurableUploadWire({ baseUrl: origin });
  const client = owner.client;
  const tripsClient = createTripsClient({ baseUrl: 'https://owner.example/trips-api' });
  const session = new CaptureBrowserSession(captureSource(), 1, async (request) =>
    captureResult(request)
  );
  const file = readableUploadFile('original bytes', 'same.pdf');
  session.addFile(file);
  const selection = session.editor.getState().draft.selections[0];
  if (selection === undefined) throw new Error('Missing file selection');
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  render(
    <QueryClientProvider client={cache}>
      <DocumentUploadProvider
        tripId={1}
        host={owner.host}
        documentsClient={client}
        tripsClient={tripsClient}
      >
        <CaptureUpload
          session={session}
          selection={selection}
          documentsClient={client}
          locked={false}
        />
      </DocumentUploadProvider>
    </QueryClientProvider>
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Send to Documents' })).toBeEnabled()
  );
  await user.click(screen.getByRole('button', { name: 'Send to Documents' }));
  await waitFor(() => expect(owner.dispatches).toHaveLength(1));
  const dispatch = owner.dispatches[0];
  if (dispatch === undefined) throw new Error('Original durable dispatch missing.');
  await act(async () => dispatch.fail(new Error('Acceptance response lost')));
  await screen.findByRole('button', { name: 'Check upload status' });
  client.setConfig({ baseUrl: 'https://other.example/documents-api' });
  const requestCount = owner.requests.length;
  await user.click(screen.getByRole('button', { name: 'Check upload status' }));
  await waitFor(() => expect(session.upload(selection.id)?.uploadPending).toBe(false));
  expect(session.editor.getState().draft.selections[0]?.references).toEqual([]);
  expect(session.upload(selection.id)?.file).toBe(file);
  expect(session.upload(selection.id)?.uncertain).toBe(true);
  expect(owner.requests).toHaveLength(requestCount);
  client.setConfig({ baseUrl: origin });
  owner.records.set(dispatch.input.operationId, {
    input: dispatch.input,
    ownerMatches: true,
    state: 'done',
    contentAvailable: true,
    taskId: 'accepted-original-task',
    documentId: 91,
    reason: null,
  });
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  await user.click(await screen.findByRole('button', { name: 'Check upload status' }));
  await waitFor(() =>
    expect(session.editor.getState().draft.selections[0]?.references).toEqual([
      { kind: 'task', taskId: 'accepted-original-task' },
      { kind: 'document', documentId: 91, taskId: 'accepted-original-task' },
    ])
  );
  expect(session.upload(selection.id)?.intent.durable.readInput()).toEqual(dispatch.input);
  expect(session.upload(selection.id)?.file).toBe(file);
  expect(owner.createCount()).toBe(1);
  expect(owner.putCount()).toBe(1);
  expect(owner.dispatchCount()).toBe(1);
  expect(
    owner.requests
      .filter((request) => request.method === 'GET')
      .every((request) => !request.url.includes('/paperless/search'))
  ).toBe(true);
});
