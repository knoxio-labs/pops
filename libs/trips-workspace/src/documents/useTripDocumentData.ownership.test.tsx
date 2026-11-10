import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { createClient as createDocumentsClient } from '../documents-api/client';
import { createClient } from '../trips-api/client';
import { documentQueryKeys } from './query-keys';
import { useTripDocumentData } from './useTripDocumentData';

import type { PropsWithChildren } from 'react';

import type { TripDocumentAssociation } from './types';

const originA = 'https://trips-a.example';
const originB = 'https://trips-b.example';
const association: TripDocumentAssociation = {
  id: 1,
  tripId: 7,
  documentId: 99,
  targetKind: 'event',
  targetId: 8,
  createdAt: '',
};
afterEach(cleanup);

function deferred<Value>() {
  let resolve: (value: Value) => void = () => {
    throw new Error('Deferred read was not initialized.');
  };
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture(options: { deleteReply?: Promise<Response>; heldVisit?: Promise<Response> } = {}) {
  const requests: Request[] = [];
  let visits = 0;
  const client = createClient({
    baseUrl: originA,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      const path = new URL(request.url).pathname;
      if (request.method === 'DELETE')
        return options.deleteReply ?? new Response(null, { status: 204 });
      if (path.endsWith('/document-associations'))
        return Response.json({ associations: [association] });
      if (path.endsWith('/visits')) {
        visits++;
        if (visits === 2 && options.heldVisit) return options.heldVisit;
        return Response.json({ visits: [] });
      }
      if (path === '/places') return Response.json({ places: [] });
      if (path.endsWith('/stays')) return Response.json({ stays: [] });
      if (path.endsWith('/events')) return Response.json({ events: [] });
      if (path.endsWith('/journeys')) return Response.json({ journeys: [] });
      throw new Error(`Unexpected fictional path ${path}`);
    },
  });
  const documents = createDocumentsClient({
    baseUrl: 'https://documents.example',
    fetch: async () =>
      Response.json({
        data: {
          id: 99,
          title: 'Original',
          originalFileName: 'proof.pdf',
          created: '',
          thumbnailUrl: '',
        },
      }),
  });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
  return { client, documents, cache, wrapper, requests, visits: () => visits };
}

it('rejects unlink at a changed owner before any DELETE dispatch', async () => {
  const owner = fixture();
  const view = renderHook(
    () => useTripDocumentData(7, owner.client, owner.documents, { kind: 'event', id: 8 }),
    owner
  );
  await waitFor(() => expect(view.result.current.associations).toHaveLength(1));
  owner.client.setConfig({ baseUrl: originB });
  await act(async () => {
    await expect(view.result.current.unlinkMutation.mutateAsync(1)).rejects.toMatchObject({
      code: 'web.source.context_changed',
    });
  });
  expect(owner.requests.filter((request) => request.method === 'DELETE')).toEqual([]);
  expect(view.result.current.associations).toEqual([association]);
  owner.cache.clear();
});

it('invalidates only the captured A association key after an already dispatched unlink settles', async () => {
  const reply = deferred<Response>();
  const owner = fixture({ deleteReply: reply.promise });
  const keyA = documentQueryKeys.associations(owner.client, 7);
  const view = renderHook(
    () => useTripDocumentData(7, owner.client, owner.documents, { kind: 'event', id: 8 }),
    owner
  );
  await waitFor(() => expect(view.result.current.associations).toHaveLength(1));
  let pending: Promise<void> = Promise.resolve();
  act(() => {
    pending = view.result.current.unlinkMutation.mutateAsync(1);
  });
  await waitFor(() =>
    expect(owner.requests.some((request) => request.method === 'DELETE')).toBe(true)
  );
  owner.client.setConfig({ baseUrl: originB });
  const keyB = documentQueryKeys.associations(owner.client, 7);
  owner.cache.setQueryData(keyB, ['Independent B cache']);
  await act(async () => {
    reply.resolve(new Response(null, { status: 204 }));
    await pending;
  });
  expect(owner.cache.getQueryState(keyA)?.isInvalidated).toBe(true);
  expect(owner.cache.getQueryState(keyB)?.isInvalidated).toBe(false);
  expect(owner.cache.getQueryData(keyB)).toEqual(['Independent B cache']);
  expect(owner.requests.filter((request) => new URL(request.url).origin === originB)).toEqual([]);
  owner.cache.clear();
});

it('rechecks the target-name owner after an awaited first read and never caches a mixed-origin projection', async () => {
  const first = deferred<Response>();
  const owner = fixture({ heldVisit: first.promise });
  const key = [...documentQueryKeys.routeVisits(owner.client, 7), 'targetNames'];
  const view = renderHook(() => useTripDocumentData(7, owner.client, owner.documents), owner);
  await waitFor(() => expect(owner.visits()).toBe(2));
  owner.client.setConfig({ baseUrl: originB });
  await act(async () => {
    first.resolve(Response.json({ visits: [] }));
  });
  await waitFor(() => expect(view.result.current.targetNamesQuery.isError).toBe(true));
  expect(owner.requests.filter((request) => new URL(request.url).origin === originB)).toEqual([]);
  expect(owner.cache.getQueryData(key)).toBeUndefined();
  expect(view.result.current.associations).toEqual([association]);
  owner.cache.clear();
});
