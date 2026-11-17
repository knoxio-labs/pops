import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';

import { createClient as createDocumentsClient } from '../documents-api/client';
import { createClient as createTripsClient } from '../trips-api/client';
import { DocumentUploadSession } from './document-upload-session';
import { createTestUploadJournal } from './durable-upload-test-utils';
import { useTripDocumentUpload } from './useTripDocumentUpload';

import type { ReactNode } from 'react';

import type { PaperlessStatusResponses } from '../documents-api/types.gen';
import type { DocumentAssociationsCreateResponses } from '../trips-api/types.gen';
import type { DurableUploadInput, DurableUploadRecord } from './durable-upload-api';

const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
});

async function fixture() {
  const target = { kind: 'stay', id: 8 } satisfies Parameters<
    typeof useTripDocumentUpload
  >[0]['target'];
  const owner = createTestUploadJournal({ target, tripsOrigin: 'https://owner-a.test/trips-api' });
  const input: DurableUploadInput = {
    operationId: crypto.randomUUID(),
    fileName: 'booking.pdf',
    mimeType: 'application/pdf',
    byteLength: 3,
    sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  };
  const done: DurableUploadRecord = {
    input,
    ownerMatches: true,
    state: 'done',
    contentAvailable: true,
    taskId: 'task-A',
    documentId: 77,
    reason: null,
  };
  const policy: PaperlessStatusResponses[200] = {
    data: {
      configured: true,
      available: true,
      baseUrl: null,
      documentCount: null,
      maxUploadBytes: 1000,
      allowedMimeTypes: ['application/pdf'],
    },
  };
  const documentsClient = createDocumentsClient({
    baseUrl: 'https://owner-a.test/documents-api',
    fetch: async (resource, init) =>
      new Request(resource, init).url.endsWith('/status')
        ? Response.json(policy)
        : Response.json({ data: done }),
  });
  const requests: Request[] = [];
  const association: DocumentAssociationsCreateResponses[201] = {
    id: 3,
    tripId: 7,
    documentId: 77,
    targetKind: 'stay',
    targetId: 8,
    createdAt: '2026-11-13T00:00:00.000Z',
  };
  const tripsClient = createTripsClient({
    baseUrl: 'https://owner-a.test/trips-api',
    fetch: async (resource, init) => {
      requests.push(new Request(resource, init));
      return Response.json(association, { status: 201 });
    },
  });
  owner.journal.admit(input);
  const initial = DocumentUploadSession.restore(input, owner.journal);
  let journal = owner.journal;
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  const view = renderHook(
    () => {
      const [session, setSession] = useState(initial);
      return useTripDocumentUpload({
        tripId: 7,
        target,
        tripsClient,
        documentsClient,
        storage: { session, onSessionChange: setSession, journal },
      });
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={cache}>{children}</QueryClientProvider>
      ),
    }
  );
  await waitFor(() => expect(view.result.current.documentId).toBe(77));
  return {
    owner,
    initial,
    view,
    requests,
    replace: (account: string, epoch: string) => {
      journal = createTestUploadJournal(
        { target, tripsOrigin: 'https://owner-a.test/trips-api' },
        { account, epoch }
      ).journal;
      view.rerender();
    },
  };
}

it('links the canonical original through the real generated client while its upload authority remains current', async () => {
  const context = await fixture();
  act(() => context.view.result.current.actions.associationMutation.mutate(77));
  await waitFor(() => expect(context.requests).toHaveLength(1));
  expect(context.requests[0]?.method).toBe('POST');
  expect(await context.requests[0]?.json()).toEqual({
    documentId: 77,
    targetKind: 'stay',
    targetId: 8,
  });
});

it.each(['B', 'A after B'])(
  'refuses the saved A association callback under %s even with identical clients/origins/trip/target',
  async (changed) => {
    const context = await fixture();
    const saved = context.view.result.current.actions.associationMutation.mutate;
    context.owner.retire();
    act(() => context.replace('account-b', 'epoch-b'));
    if (changed === 'A after B') act(() => context.replace('account-a', 'epoch-a2'));
    act(() => saved(77));
    await waitFor(() =>
      expect(context.view.result.current.actions.associationMutation.isError).toBe(true)
    );
    expect(context.requests).toEqual([]);
    expect(context.initial.intent.durable.readRecord()?.documentId).toBe(77);
    expect(context.initial.intent.durable.readRecord()?.taskId).toBe('task-A');
  }
);
