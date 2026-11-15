import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createClient } from '../trips-api/client';
import { DocumentUploadProvider } from './DocumentUploadProvider';
import {
  createDurableUploadWire,
  readableUploadFile,
  uploadWebCrypto,
} from './durable-upload-wire-test-utils';
import { createTripDocumentUploadSession } from './trip-document-upload-session';
import { TripDocumentUpload } from './TripDocumentUpload';

import type { TripDocumentUploadSession } from './trip-document-upload-session';

const caches: QueryClient[] = [];
beforeEach(() => vi.stubGlobal('crypto', uploadWebCrypto));
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fixture() {
  const wire = createDurableUploadWire({
    baseUrl: 'https://pops.example/documents-api',
    deferReads: true,
  });
  const outcomes = new Map<string, { taskId: string; reason: string } | { documentId: number }>();
  const appendReads = wire.reads.push.bind(wire.reads);
  vi.spyOn(wire.reads, 'push').mockImplementation((...reads) => {
    const length = appendReads(...reads);
    for (const read of reads) {
      const outcome = outcomes.get(read.input.operationId);
      if (outcome === undefined) throw new Error('Missing explicit owner outcome');
      if ('documentId' in outcome) read.done(outcome.documentId);
      else
        read.reply({
          input: read.input,
          ownerMatches: true,
          state: 'failed',
          taskId: outcome.taskId,
          documentId: null,
          reason: outcome.reason,
          contentAvailable: true,
        });
    }
    return length;
  });
  const links: unknown[] = [];
  const tripsClient = createClient({
    baseUrl: 'https://pops.example/trips-api',
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const body: unknown = await request.json();
      links.push(body);
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
  const context = {
    tripId: 4,
    target: { kind: 'event' as const, id: 8 },
    documentsClient: wire.client,
    tripsClient,
  };
  const journal = wire.createJournal({
    tripId: 4,
    target: context.target,
    documentsOrigin: 'https://pops.example/documents-api',
    tripsOrigin: 'https://pops.example/trips-api',
  });
  const session = createTripDocumentUploadSession(context);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  const mount = (queue: TripDocumentUploadSession = session) =>
    render(
      <QueryClientProvider client={cache}>
        <DocumentUploadProvider
          host={wire.host}
          tripId={4}
          tripsClient={tripsClient}
          documentsClient={wire.client}
        >
          <TripDocumentUpload {...context} session={queue} />
        </DocumentUploadProvider>
      </QueryClientProvider>
    );
  return { wire, outcomes, links, context, journal, session, mount };
}

async function failUpload(owner: ReturnType<typeof fixture>, name: string, index: number) {
  await userEvent.click(
    within(screen.getByRole('article', { name: `Selected file ${name}` })).getByRole('button', {
      name: 'Send to Documents',
    })
  );
  await waitFor(() => expect(owner.wire.dispatches[index]).toBeDefined());
  const dispatch = owner.wire.dispatches[index];
  if (dispatch === undefined) throw new Error('Missing dispatch');
  owner.outcomes.set(dispatch.input.operationId, {
    taskId: `failed-task-${index}`,
    reason: `Rejected ${name}`,
  });
  await act(async () => dispatch.accept(`failed-task-${index}`));
  await screen.findByText(`Documents could not accept this file: Rejected ${name}`);
  return dispatch.input.operationId;
}

it('dismisses only the explicitly removed failed operation across verification and fresh queues, preserving an unrelated failure and same-name successor', async () => {
  const owner = fixture();
  act(() =>
    owner.session.addFiles([
      readableUploadFile('first', 'same.pdf'),
      readableUploadFile('other', 'unrelated.pdf'),
    ])
  );
  const view = owner.mount();
  const removedId = await failUpload(owner, 'same.pdf', 0);
  const retainedId = await failUpload(owner, 'unrelated.pdf', 1);
  expect(
    owner.journal
      .list()
      .map((input) => input.operationId)
      .toSorted()
  ).toEqual([removedId, retainedId].toSorted());
  await userEvent.click(
    within(screen.getByRole('article', { name: 'Selected file same.pdf' })).getByRole('button', {
      name: 'Remove same.pdf',
    })
  );
  await waitFor(() =>
    expect(owner.journal.list().map((input) => input.operationId)).toEqual([retainedId])
  );
  await act(async () => {
    await owner.wire.host.verify();
  });
  expect(screen.queryByRole('article', { name: 'Selected file same.pdf' })).not.toBeInTheDocument();
  expect(screen.getByRole('article', { name: 'Selected file unrelated.pdf' })).toBeVisible();
  view.unmount();
  const fresh = createTripDocumentUploadSession(owner.context);
  owner.mount(fresh);
  await screen.findByText('Documents could not accept this file: Rejected unrelated.pdf');
  expect(screen.queryByRole('article', { name: 'Selected file same.pdf' })).not.toBeInTheDocument();
  act(() => fresh.addFiles([readableUploadFile('replacement', 'same.pdf')]));
  await userEvent.click(
    within(screen.getByRole('article', { name: 'Selected file same.pdf' })).getByRole('button', {
      name: 'Send to Documents',
    })
  );
  await waitFor(() => expect(owner.wire.dispatches[2]).toBeDefined());
  const next = owner.wire.dispatches[2];
  if (next === undefined) throw new Error('Missing successor dispatch');
  expect(next.input.operationId).not.toBe(removedId);
  expect(next.input.sha256).not.toBe(owner.wire.dispatches[0]?.input.sha256);
  owner.outcomes.set(next.input.operationId, { documentId: 91 });
  await act(async () => next.accept('successor-task'));
  await userEvent.click(await screen.findByRole('button', { name: 'Link file' }));
  await waitFor(() =>
    expect(owner.links).toEqual([{ documentId: 91, targetKind: 'event', targetId: 8 }])
  );
  await act(async () => {
    await owner.wire.host.verify();
  });
  await waitFor(() =>
    expect(
      screen.queryByRole('article', { name: 'Selected file same.pdf' })
    ).not.toBeInTheDocument()
  );
  expect(owner.journal.list().map((input) => input.operationId)).toEqual([retainedId]);
  expect(owner.wire.createCount()).toBe(3);
  expect(owner.wire.putCount()).toBe(3);
  expect(owner.wire.dispatchCount()).toBe(3);
});

it('retains the failed row and exact descriptor when storage removal fails, then retries Remove without resending', async () => {
  const owner = fixture();
  act(() => owner.session.addFiles([readableUploadFile('first', 'same.pdf')]));
  owner.mount();
  const operationId = await failUpload(owner, 'same.pdf', 0);
  const remove = vi.spyOn(owner.wire.persistence.lease, 'remove').mockImplementation(() => {
    throw new Error('Storage refused removal');
  });
  await userEvent.click(screen.getByRole('button', { name: 'Remove same.pdf' }));
  await screen.findByText(
    'The failed upload could not be removed from recovery storage. Retry Remove after verifying sign-in and browser storage.'
  );
  expect(screen.getByRole('article', { name: 'Selected file same.pdf' })).toBeVisible();
  expect(owner.journal.list().map((input) => input.operationId)).toEqual([operationId]);
  remove.mockRestore();
  await userEvent.click(screen.getByRole('button', { name: 'Remove same.pdf' }));
  await waitFor(() =>
    expect(
      screen.queryByRole('article', { name: 'Selected file same.pdf' })
    ).not.toBeInTheDocument()
  );
  expect(owner.journal.list()).toEqual([]);
  expect(owner.wire.createCount()).toBe(1);
  expect(owner.wire.putCount()).toBe(1);
  expect(owner.wire.dispatchCount()).toBe(1);
});
