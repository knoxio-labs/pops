import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { createClient } from '../documents-api/client';
import { client as defaultDocumentsClient } from '../documents-api/client.gen';
import { createClient as createTripsClient } from '../trips-api/client';
import { documentQueryKeys } from './query-keys';
import { createTripDocumentUploadSession } from './trip-document-upload-session';
import { TripDocumentUpload } from './TripDocumentUpload';

import type { TripDocumentUploadSession } from './trip-document-upload-session';
import type { PaperlessSearchDocument } from './types';

const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
});

function harness(searchResults: PaperlessSearchDocument[] = []) {
  const responses: Array<(response: Response) => void> = [];
  let posts = 0;
  let taskUnavailable = false;
  const links: unknown[] = [];
  const reads: string[] = [];
  const documentsClient = createClient({
    baseUrl: 'https://pops.example/documents-api',
    fetch: vi.fn<typeof fetch>(async (input) => {
      const request = input instanceof Request ? input : new Request(input);
      if (request.method === 'POST') {
        posts += 1;
        return new Promise<Response>((resolve) => responses.push(resolve));
      }
      reads.push(request.url);
      if (request.url.includes('/paperless/search')) return Response.json({ data: searchResults });
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
        if (taskUnavailable) throw new Error('Owner task expired');
        return Response.json({ data: { state: 'done', documentId: 91, reason: null } });
      }
      throw new Error('Unexpected owner request');
    }),
  });
  const tripsClient = createTripsClient({
    baseUrl: 'https://pops.example/trips-api',
    fetch: vi.fn<typeof fetch>(async (input) => {
      const request = input instanceof Request ? input : new Request(input);
      links.push({ url: request.url, body: await request.json() });
      return Response.json(
        {
          id: 1,
          tripId: 4,
          documentId: 91,
          targetKind: 'event',
          targetId: 8,
          createdAt: '',
        },
        { status: 201 }
      );
    }),
  });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  const session = createTripDocumentUploadSession({
    tripId: 4,
    target: { kind: 'event', id: 8 },
    documentsClient,
    tripsClient,
  });
  const mount = (retained: TripDocumentUploadSession = session) =>
    render(
      <QueryClientProvider client={cache}>
        <TripDocumentUpload {...retained.context} session={retained} />
      </QueryClientProvider>
    );
  return {
    mount,
    responses,
    session,
    cache,
    links,
    reads,
    posts: () => posts,
    expireTask: () => {
      taskUnavailable = true;
    },
  };
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
  await userEvent.upload(input, new File(['agenda'], 'agenda.pdf', { type: 'application/pdf' }));
  if (start) await userEvent.click(screen.getByRole('button', { name: 'Send to Documents' }));
}

it('renders a context error and restores the same File, task and receipt after the original owner returns', async () => {
  const owner = harness();
  const view = owner.mount();
  await selectFile();
  const respond = owner.responses[0];
  if (respond === undefined) throw new Error('Upload acceptance missing');
  await act(async () =>
    respond(Response.json({ data: { taskId: 'accepted-8' } }, { status: 202 }))
  );
  await screen.findByRole('button', { name: 'Link file' });
  const before = owner.session.read()[0]?.upload;
  const trips = owner.session.context.tripsClient;
  if (!trips || !before) throw new Error('Original upload context missing');
  const content = () => (
    <QueryClientProvider client={owner.cache}>
      <TripDocumentUpload {...owner.session.context} session={owner.session} />
    </QueryClientProvider>
  );
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
  expect(await screen.findByRole('alert')).toHaveTextContent('connection changed');
  expect(owner.session.read()[0]?.upload.uncertain).toBe(false);
});

it('blocks task lookup at a changed owner while retaining an acceptance from the original request', async () => {
  const owner = harness();
  owner.mount();
  await selectFile();
  const respond = owner.responses[0];
  if (respond === undefined) throw new Error('Upload acceptance missing');
  owner.session.context.documentsClient?.setConfig({
    baseUrl: 'https://other.example/documents-api',
  });
  await act(async () =>
    respond(Response.json({ data: { taskId: 'accepted-8' } }, { status: 202 }))
  );
  await screen.findByRole('button', { name: 'Retry status check' });
  expect(owner.reads.some((url) => url.includes('other.example'))).toBe(false);
  expect(owner.session.read()[0]?.upload.taskId).toBe('accepted-8');
});

it('checks the captured Trips owner immediately before linking a completed original', async () => {
  const owner = harness();
  owner.mount();
  await selectFile();
  const respond = owner.responses[0];
  if (respond === undefined) throw new Error('Upload acceptance missing');
  await act(async () =>
    respond(Response.json({ data: { taskId: 'accepted-8' } }, { status: 202 }))
  );
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
  const respond = owner.responses[0];
  if (respond === undefined) throw new Error('Upload acceptance missing');
  await act(async () =>
    respond(Response.json({ data: { taskId: 'accepted-8' } }, { status: 202 }))
  );
  await screen.findByRole('button', { name: 'Link file' });
  const client = owner.session.context.documentsClient;
  if (client === undefined) throw new Error('Owner client missing');
  client.setConfig({ baseUrl: 'https://other.example/documents-api' });
  await userEvent.click(screen.getByRole('button', { name: 'Link file' }));
  await screen.findByText('The trip, item or document connection changed for this upload.');
  expect(owner.cache.getQueryData(documentQueryKeys.task(client, 'accepted-8'))).toBeUndefined();
  cleanup();
  owner.cache.clear();
  client.setConfig({ baseUrl: 'https://pops.example/documents-api' });
  owner.expireTask();
  owner.mount();
  await screen.findByRole('button', { name: 'Retry status check' });
  expect(owner.session.read()[0]?.upload.taskReceipt?.result.documentId).toBe(91);
  expect(owner.cache.getQueryData(documentQueryKeys.task(client, 'accepted-8'))).toEqual({
    state: 'done',
    documentId: 91,
    reason: null,
  });
  expect(owner.posts()).toBe(1);
});

it('does not search a changed owner to recover an uncertain original', async () => {
  const owner = harness();
  owner.mount();
  await selectFile();
  const respond = owner.responses[0];
  if (respond === undefined) throw new Error('Upload acceptance missing');
  await act(async () => respond(Response.json({ message: 'Interrupted' }, { status: 503 })));
  await screen.findByRole('button', { name: 'Search Documents for agenda.pdf' });
  owner.session.context.documentsClient?.setConfig({
    baseUrl: 'https://other.example/documents-api',
  });
  await userEvent.click(screen.getByRole('button', { name: 'Search Documents for agenda.pdf' }));
  await act(async () => undefined);
  expect(owner.reads.some((url) => url.includes('other.example'))).toBe(false);
  expect(owner.session.read()[0]?.upload.uncertain).toBe(true);
});

it('blocks replacement-file recovery when the owner changes after a no-results search', async () => {
  const owner = harness();
  owner.mount();
  await selectFile();
  const respond = owner.responses[0];
  if (respond === undefined) throw new Error('Upload acceptance missing');
  await act(async () => respond(Response.json({ message: 'Interrupted' }, { status: 503 })));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Search Documents for agenda.pdf' })
  );
  const recovery = await screen.findByRole('button', {
    name: 'No original found; choose a different file',
  });
  const file = owner.session.read()[0]?.upload.file;
  owner.session.context.documentsClient?.setConfig({
    baseUrl: 'https://other.example/documents-api',
  });
  await userEvent.click(recovery);
  expect(owner.session.read()[0]?.upload.file).toBe(file);
  expect(owner.session.read()[0]?.upload.uncertain).toBe(true);
  expect(owner.reads.some((url) => url.includes('other.example'))).toBe(false);
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
  const beforeBase = defaultDocumentsClient.getConfig().baseUrl;
  const beforeFetch = defaultDocumentsClient.getConfig().fetch;
  let posts = 0;
  const cache = new QueryClient();
  caches.push(cache);
  defaultDocumentsClient.setConfig({
    baseUrl: 'https://default-a.example/documents-api',
    fetch: vi.fn<typeof fetch>(async (input) => {
      const request = input instanceof Request ? input : new Request(input);
      if (request.method === 'POST') {
        posts += 1;
        return Response.json({ data: { taskId: 'accepted' } }, { status: 202 });
      }
      return Response.json({
        data: {
          configured: true,
          available: true,
          maxUploadBytes: 1000,
          allowedMimeTypes: ['application/pdf'],
        },
      });
    }),
  });
  try {
    const session = createTripDocumentUploadSession({
      tripId: 4,
      target: { kind: 'event', id: 8 },
    });
    render(
      <QueryClientProvider client={cache}>
        <TripDocumentUpload {...session.context} session={session} />
      </QueryClientProvider>
    );
    await selectFile(false);
    defaultDocumentsClient.setConfig({ baseUrl: 'https://default-b.example/documents-api' });
    await userEvent.click(screen.getByRole('button', { name: 'Send to Documents' }));
    expect(posts).toBe(0);
    expect(await screen.findByRole('alert')).toHaveTextContent('connection changed');
  } finally {
    cleanup();
    defaultDocumentsClient.setConfig({ baseUrl: beforeBase, fetch: beforeFetch });
  }
});

it('retains a late accepted original when its upload view closes before the 202 response', async () => {
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
  const respond = owner.responses[0];
  if (respond === undefined) throw new Error('Upload acceptance was not captured');
  await act(async () =>
    respond(Response.json({ data: { taskId: 'accepted-8' } }, { status: 202 }))
  );
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
  const respond = owner.responses[0];
  if (respond === undefined) throw new Error('Upload acceptance was not captured');
  await act(async () =>
    respond(Response.json({ data: { taskId: 'accepted-8' } }, { status: 202 }))
  );
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
  const files = [1, 2].map(
    (size) => new File(['x'.repeat(size)], 'same.pdf', { type: 'application/pdf' })
  );
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
  const [first, second] = owner.responses;
  if (first === undefined || second === undefined)
    throw new Error('Owner uploads were not captured');
  await act(async () => {
    first(Response.json({ data: { taskId: 'accepted-8' } }, { status: 202 }));
    second(Response.json({ message: 'Upload interrupted' }, { status: 503 }));
  });
  expect(
    await screen.findByRole('button', { name: 'Search Documents for same.pdf' })
  ).toBeVisible();
  expect(await screen.findByRole('button', { name: 'Link file' })).toBeVisible();
  view.unmount();
  owner.cache.clear();
  owner.mount();
  expect(await screen.findByRole('button', { name: 'Link file' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Search Documents for same.pdf' })).toBeVisible();
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
  await userEvent.upload(input, new File(['a'], 'a.pdf', { type: 'application/pdf' }));
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
  const respond = owner.responses[0];
  if (respond === undefined) throw new Error('Upload acceptance was not captured');
  await act(async () =>
    respond(Response.json({ data: { taskId: 'accepted-8' } }, { status: 202 }))
  );
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
