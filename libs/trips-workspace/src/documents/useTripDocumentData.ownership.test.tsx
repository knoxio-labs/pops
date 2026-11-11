import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

it.each(['success', 'failure'] as const)(
  'preserves number-ID mutation variables and callbacks on %s',
  async (outcome) => {
    const response =
      outcome === 'success'
        ? new Response(null, { status: 204 })
        : Response.json(
            { code: 'trips.unlink.rejected', message: 'Refused', retryable: true },
            { status: 503 }
          );
    const owner = fixture({ deleteReply: Promise.resolve(response) });
    const view = renderHook(
      () => useTripDocumentData(7, owner.client, owner.documents, { kind: 'event', id: 8 }),
      owner
    );
    await waitFor(() => expect(view.result.current.associations).toHaveLength(1));
    const events: { kind: string; id: number }[] = [];
    await act(async () => {
      const pending = view.result.current.unlinkMutation.mutateAsync(1, {
        onSuccess: (_data, id) => events.push({ kind: 'success', id }),
        onError: (_error, id) => events.push({ kind: 'failure', id }),
        onSettled: (_data, _error, id) => events.push({ kind: 'settled', id }),
      });
      if (outcome === 'failure')
        await expect(pending).rejects.toMatchObject({ code: 'trips.unlink.rejected' });
      else await pending;
    });
    await waitFor(() => expect(view.result.current.unlinkMutation.variables).toBe(1));
    expect(view.result.current.unlinkMutation.isError).toBe(outcome === 'failure');
    expect(events).toEqual([
      { kind: outcome, id: 1 },
      { kind: 'settled', id: 1 },
    ]);
    owner.cache.clear();
  }
);

it('blocks callbacks from a closed view while another mounted view remains able to unlink', async () => {
  const owner = fixture();
  const first = renderHook(
    () => useTripDocumentData(7, owner.client, owner.documents, { kind: 'event', id: 8 }),
    owner
  );
  const other = renderHook(
    () => useTripDocumentData(7, owner.client, owner.documents, { kind: 'event', id: 8 }),
    owner
  );
  await waitFor(() => expect(first.result.current.associations).toHaveLength(1));
  const closed = first.result.current.unlinkMutation;
  first.unmount();
  await act(async () => {
    closed.mutate(1);
    await expect(closed.mutateAsync(1)).rejects.toMatchObject({ code: 'web.source.view_closed' });
  });
  expect(owner.cache.getMutationCache().getAll()).toHaveLength(0);
  await act(async () => {
    await other.result.current.unlinkMutation.mutateAsync(1);
  });
  expect(
    owner.requests
      .filter((request) => request.method === 'DELETE')
      .map((request) => new URL(request.url).pathname)
  ).toEqual(['/trips/7/document-associations/1']);
  owner.cache.clear();
});

function deferred<Value>() {
  let resolve: (value: Value) => void = () => {
    throw new Error('Deferred read was not initialized.');
  };
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture(
  options: {
    deleteReply?: Promise<Response>;
    heldVisit?: Promise<Response>;
    preparation?: Promise<void>;
  } = {}
) {
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
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    mutationCache: new MutationCache({ onMutate: () => options.preparation }),
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
  return { client, documents, cache, wrapper, requests, visits: () => visits };
}

it('does not retarget an A association after mutation preparation awaits and the rendered owner switches to B', async () => {
  const preparation = deferred<void>();
  const owner = fixture({ preparation: preparation.promise });
  const fetcher = owner.client.getConfig().fetch;
  if (!fetcher) throw new Error('Fictional transport missing');
  const other = createClient({ baseUrl: originB, fetch: fetcher });
  const view = renderHook(
    ({ client }) => useTripDocumentData(7, client, owner.documents, { kind: 'event', id: 8 }),
    { wrapper: owner.wrapper, initialProps: { client: owner.client } }
  );
  await waitFor(() => expect(view.result.current.associations).toHaveLength(1));
  let pending: Promise<void> = Promise.resolve();
  act(() => {
    pending = view.result.current.unlinkMutation.mutateAsync(1);
  });
  view.rerender({ client: other });
  await act(async () => {
    preparation.resolve(undefined);
    await pending.catch(() => undefined);
  });
  expect(owner.requests.filter((request) => request.method === 'DELETE')).toEqual([]);
  owner.cache.clear();
});

it('retains the invocation cache key when an A unlink settles after the rendered owner switches to B', async () => {
  const reply = deferred<Response>();
  const owner = fixture({ deleteReply: reply.promise });
  const fetcher = owner.client.getConfig().fetch;
  if (!fetcher) throw new Error('Fictional transport missing');
  const other = createClient({ baseUrl: originB, fetch: fetcher });
  const keyA = documentQueryKeys.associations(owner.client, 7);
  const keyB = documentQueryKeys.associations(other, 7);
  const view = renderHook(
    ({ client }) => useTripDocumentData(7, client, owner.documents, { kind: 'event', id: 8 }),
    { wrapper: owner.wrapper, initialProps: { client: owner.client } }
  );
  await waitFor(() => expect(view.result.current.associations).toHaveLength(1));
  let pending: Promise<void> = Promise.resolve();
  act(() => {
    pending = view.result.current.unlinkMutation.mutateAsync(1);
  });
  await waitFor(() =>
    expect(owner.requests.some((request) => request.method === 'DELETE')).toBe(true)
  );
  view.rerender({ client: other });
  await waitFor(() => expect(owner.cache.getQueryState(keyB)?.status).toBe('success'));
  const bReads = owner.requests.filter(
    (request) => request.method === 'GET' && new URL(request.url).origin === originB
  ).length;
  await act(async () => {
    reply.resolve(new Response(null, { status: 204 }));
    await pending;
  });
  expect(owner.cache.getQueryState(keyA)?.isInvalidated).toBe(true);
  expect(
    owner.requests.filter(
      (request) => request.method === 'GET' && new URL(request.url).origin === originB
    )
  ).toHaveLength(bReads);
  expect(
    owner.requests
      .filter((request) => request.method === 'DELETE')
      .map((request) => new URL(request.url).origin)
  ).toEqual([originA]);
  owner.cache.clear();
});

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
