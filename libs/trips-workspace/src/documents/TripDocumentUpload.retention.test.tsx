import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { createClient } from '../documents-api/client';
import { createClient as createTripsClient } from '../trips-api/client';
import { createTripDocumentUploadSession } from './trip-document-upload-session';
import { TripDocumentUpload } from './TripDocumentUpload';

import type { TripDocumentUploadSession } from './trip-document-upload-session';

const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
});

function harness() {
  const responses: Array<(response: Response) => void> = [];
  let posts = 0;
  let taskUnavailable = false;
  const links: unknown[] = [];
  const documentsClient = createClient({
    baseUrl: 'https://pops.example/documents-api',
    fetch: vi.fn<typeof fetch>(async (input) => {
      const request = input instanceof Request ? input : new Request(input);
      if (request.method === 'POST') {
        posts += 1;
        return new Promise<Response>((resolve) => responses.push(resolve));
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
    posts: () => posts,
    expireTask: () => {
      taskUnavailable = true;
    },
  };
}

async function selectFile(): Promise<void> {
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /^Upload a file/ })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    )
  );
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error('File upload was not mounted');
  await userEvent.upload(input, new File(['agenda'], 'agenda.pdf', { type: 'application/pdf' }));
  await userEvent.click(screen.getByRole('button', { name: 'Send to Documents' }));
}

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
