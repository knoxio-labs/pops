import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { client as defaultDocumentsClient } from '../documents-api/client.gen';
import { createClient as createTripsClient } from '../trips-api/client';
import { client as defaultTripsClient } from '../trips-api/client.gen';
import { DocumentUploadProvider } from './DocumentUploadProvider';
import {
  createDurableUploadWire,
  readableUploadFile,
  uploadWebCrypto,
} from './durable-upload-wire-test-utils';
import { documentQueryKeys } from './query-keys';
import { createTripDocumentUploadSession } from './trip-document-upload-session';
import { TripDocumentUpload } from './TripDocumentUpload';

import type { TripDocumentUploadSession } from './trip-document-upload-session';
import type { PaperlessSearchDocument } from './types';

const caches: QueryClient[] = [];
beforeEach(() => vi.stubGlobal('crypto', uploadWebCrypto));
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  vi.unstubAllGlobals();
});

function harness(searchResults: PaperlessSearchDocument[] = []) {
  const wire = createDurableUploadWire({
    baseUrl: 'https://pops.example/documents-api',
    searchResults,
  });
  const links: unknown[] = [];
  const documentsClient = wire.client;
  const tripsClient = createTripsClient({
    baseUrl: 'https://pops.example/trips-api',
    fetch: async (resource, init) => {
      const request = new Request(resource, init);
      links.push({ url: request.url, body: await request.json() });
      return Response.json(
        {
          id: 1,
          tripId: 4,
          documentId: 91,
          targetKind: 'event',
          targetId: 8,
          createdAt: '2026-11-09T00:00:00Z',
        },
        { status: 201 }
      );
    },
  });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  const session = createTripDocumentUploadSession({
    tripId: 4,
    target: { kind: 'event', id: 8 },
    documentsClient,
    tripsClient,
  });
  const tree = (retained: TripDocumentUploadSession) => (
    <QueryClientProvider client={cache}>
      <DocumentUploadProvider
        tripId={4}
        host={wire.host}
        documentsClient={documentsClient}
        tripsClient={tripsClient}
      >
        <TripDocumentUpload {...retained.context} session={retained} />
      </DocumentUploadProvider>
    </QueryClientProvider>
  );
  return {
    wire,
    mount: (retained: TripDocumentUploadSession = session) => render(tree(retained)),
    tree,
    dispatches: wire.dispatches,
    session,
    cache,
    links,
    get reads() {
      return wire.requests
        .filter((request) => request.method === 'GET')
        .map((request) => request.url);
    },
    posts: wire.dispatchCount,
    expireTask: wire.failReads,
  };
}

async function dispatchAt(owner: ReturnType<typeof harness>, index = 0) {
  await waitFor(() => expect(owner.dispatches[index]).toBeDefined());
  const dispatch = owner.dispatches[index];
  if (dispatch === undefined) throw new Error('Upload dispatch missing.');
  return dispatch;
}

function taskKey(owner: ReturnType<typeof harness>, taskId: string) {
  const client = owner.session.context.documentsClient;
  const [kind, origin] = documentQueryKeys.task(client, '');
  const upload = owner.session.read()[0]?.upload;
  if (upload === undefined) throw new Error('Retained upload missing.');
  return [kind, origin, upload.intent.durable.persistenceBinding(), taskId];
}

async function selectFile(start = true): Promise<void> {
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /^Upload a file/ })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    )
  );
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error('File upload was not mounted');
  await userEvent.upload(input, readableUploadFile('agenda', 'agenda.pdf'));
  if (start) await userEvent.click(screen.getByRole('button', { name: 'Send to Documents' }));
}

it('renders a context error and restores the same File, task and receipt after the original owner returns', async () => {
  const owner = harness();
  const view = owner.mount();
  await selectFile();
  const respond = await dispatchAt(owner);
  if (respond === undefined) throw new Error('Upload acceptance missing');
  await act(async () => respond.accept('accepted-8'));
  await screen.findByRole('button', { name: 'Link file' });
  const before = owner.session.read()[0]?.upload;
  const trips = owner.session.context.tripsClient;
  if (!trips || !before) throw new Error('Original upload context missing');
  const content = () => owner.tree(owner.session);
  trips.setConfig({ baseUrl: 'https://other.example/trips-api' });
  view.rerender(content());
  expect(screen.getByRole('alert')).toHaveTextContent('connection changed');
  expect(screen.queryByRole('button', { name: 'Link file' })).not.toBeInTheDocument();
  expect(owner.session.read()[0]?.upload.file).toBe(before.file);
  trips.setConfig({ baseUrl: 'https://pops.example/trips-api' });
  view.rerender(content());
  await screen.findByRole('button', { name: 'Link file' });
  expect(owner.session.read()[0]?.upload.file).toBe(before.file);
  expect(owner.session.read()[0]?.upload.taskId).toBe('accepted-8');
  expect(owner.session.read()[0]?.upload.taskReceipt).toEqual(before.taskReceipt);
  expect(owner.posts()).toBe(1);
  expect(owner.links).toEqual([]);
  expect(owner.reads.some((url) => url.includes('other.example'))).toBe(false);
});

it('rethrows unexpected context failures rather than treating them as an owner change', () => {
  const owner = harness();
  const unexpected = new Error('Unexpected session failure');
  const assertion = vi.spyOn(owner.session, 'assertContext').mockImplementation(() => {
    throw unexpected;
  });
  expect(() => owner.mount()).toThrow(unexpected);
  assertion.mockRestore();
  expect(owner.cache.getQueryCache().getAll()).toHaveLength(0);
});

it('checks the captured owner immediately before a private File POST after a client mutates without rendering', async () => {
  const owner = harness();
  owner.mount();
  await selectFile(false);
  owner.session.context.documentsClient?.setConfig({
    baseUrl: 'https://other.example/documents-api',
  });
  await userEvent.click(screen.getByRole('button', { name: 'Send to Documents' }));
  expect(owner.posts()).toBe(0);
  expect(await screen.findByRole('alert')).toHaveTextContent('another Documents owner');
  expect(owner.session.read()[0]?.upload.uncertain).toBe(false);
});

it('blocks task lookup at a changed owner while retaining an acceptance from the original request', async () => {
  const owner = harness();
  owner.mount();
  await selectFile();
  const respond = await dispatchAt(owner);
  if (respond === undefined) throw new Error('Upload acceptance missing');
  owner.session.context.documentsClient?.setConfig({
    baseUrl: 'https://other.example/documents-api',
  });
  await act(async () => respond.accept('accepted-8'));
  expect(await screen.findByRole('alert')).toHaveTextContent('another Documents owner');
  expect(owner.reads.some((url) => url.includes('other.example'))).toBe(false);
  expect(owner.session.read()[0]?.upload.taskId).toBe('accepted-8');
});

it('checks the captured Trips owner immediately before linking a completed original', async () => {
  const owner = harness();
  owner.mount();
  await selectFile();
  const respond = await dispatchAt(owner);
  if (respond === undefined) throw new Error('Upload acceptance missing');
  await act(async () => respond.accept('accepted-8'));
  await screen.findByRole('button', { name: 'Link file' });
  owner.session.context.tripsClient?.setConfig({ baseUrl: 'https://other.example/trips-api' });
  await userEvent.click(screen.getByRole('button', { name: 'Link file' }));
  expect(owner.links).toHaveLength(0);
  expect(owner.session.read()[0]?.upload.file).not.toBeNull();
});

it('does not seed another owner cache with a retained original after a mutable origin changes', async () => {
  const owner = harness();
  owner.mount();
  await selectFile();
  const respond = await dispatchAt(owner);
  if (respond === undefined) throw new Error('Upload acceptance missing');
  await act(async () => respond.accept('accepted-8'));
  await screen.findByRole('button', { name: 'Link file' });
  const client = owner.session.context.documentsClient;
  if (client === undefined) throw new Error('Owner client missing');
  client.setConfig({ baseUrl: 'https://other.example/documents-api' });
  await userEvent.click(screen.getByRole('button', { name: 'Link file' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('another Documents owner');
  expect(owner.cache.getQueryData(taskKey(owner, 'accepted-8'))).toBeUndefined();
  cleanup();
  owner.cache.clear();
  client.setConfig({ baseUrl: 'https://pops.example/documents-api' });
  owner.expireTask();
  owner.mount();
  await screen.findByRole('button', { name: 'Retry status check' });
  expect(owner.session.read()[0]?.upload.taskReceipt?.result.documentId).toBe(91);
  expect(owner.cache.getQueryData(taskKey(owner, 'accepted-8'))).toEqual({
    state: 'done',
    documentId: 91,
    reason: null,
  });
  expect(owner.posts()).toBe(1);
});

it('does not GET a changed owner to recover an uncertain original', async () => {
  const owner = harness();
  owner.mount();
  await selectFile();
  const dispatch = await dispatchAt(owner);
  await act(async () => dispatch.fail(new Error('Dispatch response lost')));
  await screen.findByRole('button', { name: 'Check upload status' });
  owner.session.context.documentsClient?.setConfig({
    baseUrl: 'https://other.example/documents-api',
  });
  const before = owner.reads.length;
  await userEvent.click(screen.getByRole('button', { name: 'Check upload status' }));
  await waitFor(() => expect(owner.session.read()[0]?.upload.uploadPending).toBe(false));
  expect(owner.reads).toHaveLength(before);
  expect(owner.reads.some((url) => url.includes('other.example'))).toBe(false);
  expect(owner.session.read()[0]?.upload.uncertain).toBe(true);
});

it('keeps the original File and immutable UUID locked after GET still cannot prove a dispatch outcome', async () => {
  const owner = harness();
  owner.mount();
  await selectFile();
  const dispatch = await dispatchAt(owner);
  await act(async () => dispatch.fail(new Error('Dispatch response lost')));
  const upload = owner.session.read()[0]?.upload;
  const file = upload?.file;
  const input = upload?.intent.durable.readInput();
  await userEvent.click(await screen.findByRole('button', { name: 'Check upload status' }));
  await waitFor(() => expect(upload?.uploadPending).toBe(false));
  expect(upload?.file).toBe(file);
  expect(upload?.intent.durable.readInput()).toEqual(input);
  expect(upload?.uncertain).toBe(true);
  expect(screen.queryByRole('button', { name: 'Remove agenda.pdf' })).not.toBeInTheDocument();
  expect(owner.posts()).toBe(1);
  expect(owner.wire.createCount()).toBe(1);
  expect(owner.wire.putCount()).toBe(1);
  expect(owner.reads.some((url) => url.includes('/paperless/search'))).toBe(false);
});

it('does not link a cached picker choice after the Trips transport changes without rendering', async () => {
  const owner = harness([
    { id: 91, title: 'Agenda', originalFileName: 'agenda.pdf', created: '', thumbnailUrl: '' },
  ]);
  owner.mount();
  await userEvent.click(screen.getByRole('button', { name: 'Choose existing document' }));
  await userEvent.type(screen.getByPlaceholderText('Search documents...'), 'agenda');
  const select = await screen.findByRole('button', { name: 'Link' });
  owner.session.context.tripsClient?.setConfig({ baseUrl: 'https://other.example/trips-api' });
  await userEvent.click(select);
  expect(owner.links).toHaveLength(0);
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be linked');
});

it('checks mutable default owner configuration immediately before uploading', async () => {
  const beforeDocuments = defaultDocumentsClient.getConfig();
  const beforeTrips = defaultTripsClient.getConfig();
  const wire = createDurableUploadWire({ baseUrl: 'https://default-a.example/documents-api' });
  const cache = new QueryClient();
  caches.push(cache);
  defaultDocumentsClient.setConfig({
    baseUrl: 'https://default-a.example/documents-api',
    fetch: wire.client.getConfig().fetch,
  });
  defaultTripsClient.setConfig({ baseUrl: 'https://default-a.example/trips-api' });
  try {
    const session = createTripDocumentUploadSession({
      tripId: 4,
      target: { kind: 'event', id: 8 },
    });
    render(
      <QueryClientProvider client={cache}>
        <DocumentUploadProvider tripId={4} host={wire.host}>
          <TripDocumentUpload {...session.context} session={session} />
        </DocumentUploadProvider>
      </QueryClientProvider>
    );
    await selectFile(false);
    defaultDocumentsClient.setConfig({ baseUrl: 'https://default-b.example/documents-api' });
    await userEvent.click(screen.getByRole('button', { name: 'Send to Documents' }));
    await screen.findByRole('alert');
    expect(wire.createCount()).toBe(0);
    expect(wire.putCount()).toBe(0);
    expect(wire.dispatchCount()).toBe(0);
    expect(session.read()[0]?.upload.uncertain).toBe(false);
  } finally {
    cleanup();
    defaultDocumentsClient.setConfig(beforeDocuments);
    defaultTripsClient.setConfig(beforeTrips);
  }
});

it('retains a late accepted original when its upload view closes before its durable dispatch acknowledgement', async () => {
  const owner = harness();
  const view = owner.mount();
  await selectFile();
  await waitFor(() => expect(owner.posts()).toBe(1));
  view.unmount();
  const other = owner.mount(
    createTripDocumentUploadSession({
      ...owner.session.context,
      target: { kind: 'stay', id: 8 },
    })
  );
  const respond = await dispatchAt(owner);
  if (respond === undefined) throw new Error('Upload acceptance was not captured');
  await act(async () => respond.accept('accepted-8'));
  expect(screen.queryByRole('button', { name: 'Link file' })).toBeNull();
  expect(screen.queryByRole('article')).toBeNull();
  other.unmount();
  owner.mount();
  expect(await screen.findByRole('button', { name: 'Link file' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Link file' }));
  await waitFor(() =>
    expect(owner.links).toEqual([
      {
        url: 'https://pops.example/trips-api/trips/4/document-associations',
        body: { documentId: 91, targetKind: 'event', targetId: 8 },
      },
    ])
  );
  expect(owner.posts()).toBe(1);
});

it('retains a verified original after closing the view and evicting its query cache', async () => {
  const owner = harness();
  const view = owner.mount();
  await selectFile();
  const respond = await dispatchAt(owner);
  if (respond === undefined) throw new Error('Upload acceptance was not captured');
  await act(async () => respond.accept('accepted-8'));
  expect(await screen.findByRole('button', { name: 'Link file' })).toBeVisible();
  const receipt = owner.session.read()[0]?.upload;
  expect(receipt?.taskReceipt?.result.documentId).toBe(91);
  view.unmount();
  owner.cache.clear();
  owner.expireTask();
  owner.mount();
  expect(await screen.findByRole('button', { name: 'Link file' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Send to Documents' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Link file' }));
  await waitFor(() => expect(owner.links).toHaveLength(1));
  expect(receipt?.taskId).toBe('accepted-8');
  expect(owner.posts()).toBe(1);
});

it('retains independent same-name files and an uncertain outcome across a modal remount', async () => {
  const owner = harness();
  const view = owner.mount();
  const files = [1, 2].map((size) => readableUploadFile('x'.repeat(size), 'same.pdf'));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /^Upload a file/ })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    )
  );
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error('File upload was not mounted');
  await userEvent.upload(input, files);
  expect(owner.session.read().map((intent) => intent.file)).toEqual(files);
  expect(new Set(owner.session.read().map((intent) => intent.id)).size).toBe(2);
  for (const button of screen.getAllByRole('button', { name: 'Send to Documents' }))
    await userEvent.click(button);
  await waitFor(() => expect(owner.posts()).toBe(2));
  const firstId = owner.session.read()[0]?.upload.id;
  const secondId = owner.session.read()[1]?.upload.id;
  const first = owner.dispatches.find((dispatch) => dispatch.input.operationId === firstId);
  const second = owner.dispatches.find((dispatch) => dispatch.input.operationId === secondId);
  if (first === undefined || second === undefined)
    throw new Error('Actual operation dispatches missing.');
  await act(async () => {
    first.accept('accepted-8');
    second.fail(new Error('Upload response lost'));
  });
  expect(await screen.findByRole('button', { name: 'Check upload status' })).toBeVisible();
  expect(await screen.findByRole('button', { name: 'Link file' })).toBeVisible();
  view.unmount();
  owner.cache.clear();
  owner.mount();
  expect(await screen.findByRole('button', { name: 'Link file' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Check upload status' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Send to Documents' })).toBeDisabled();
  expect(screen.getAllByRole('article')).toHaveLength(2);
  expect(owner.session.read()[0]?.upload.file).toBe(files[0]);
  expect(owner.session.read()[1]?.upload.file).toBe(files[1]);
  expect(owner.posts()).toBe(2);
});

it('synchronizes selections across two mounted views and shares the synchronous owner POST claim', async () => {
  const owner = harness();
  const first = owner.mount();
  const second = owner.mount();
  await waitFor(() =>
    expect(
      within(first.container).getByRole('button', { name: /^Upload a file/ })
    ).not.toHaveAttribute('aria-disabled', 'true')
  );
  const input = first.container.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error('File upload was not mounted');
  await userEvent.upload(input, readableUploadFile('a', 'a.pdf'));
  expect(
    within(second.container).getByRole('article', { name: 'Selected file a.pdf' })
  ).toBeVisible();
  const a = within(first.container).getByRole('button', { name: 'Send to Documents' });
  const b = within(second.container).getByRole('button', { name: 'Send to Documents' });
  act(() => {
    a.click();
    b.click();
  });
  await waitFor(() => expect(owner.posts()).toBe(1));
  expect(screen.getAllByRole('button', { name: 'Sending to Documents…' })).toHaveLength(2);
  const respond = await dispatchAt(owner);
  if (respond === undefined) throw new Error('Upload acceptance was not captured');
  await act(async () => respond.accept('accepted-8'));
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Link file' })).toHaveLength(2));
  expect(owner.posts()).toBe(1);
});

it('keeps the pending upload disabled after closing and reopening its view', async () => {
  const owner = harness();
  const view = owner.mount();
  await selectFile();
  await waitFor(() => expect(owner.posts()).toBe(1));
  view.unmount();
  owner.mount();
  expect(await screen.findByRole('button', { name: 'Sending to Documents…' })).toBeDisabled();
  expect(owner.posts()).toBe(1);
});
