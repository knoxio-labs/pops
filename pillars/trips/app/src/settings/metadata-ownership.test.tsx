import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { loadTrips } from '../api/source';
import { metadataServer, metadataTrip, mountMetadata } from './metadata-test-utils';
import { useTripMetadataRead } from './use-metadata-source';

import type { ReactNode } from 'react';

let server: Awaited<ReturnType<typeof metadataServer>>;
beforeEach(async () => {
  server = await metadataServer();
});
afterEach(async () => {
  cleanup();
  await server.close();
});

it('fences old and foreign-origin callbacks through A→B→A while preserving each retained draft', async () => {
  const first = mountMetadata(server);
  act(() => first.result.current.change({ ...first.result.current.draft, name: 'Draft A' }));
  const staleSave = first.result.current.save;
  server.client.setConfig({ baseUrl: `${server.origin}/b` });
  await act(() => first.result.current.save());
  expect(server.requests).toEqual([]);
  first.unmount();
  const second = mountMetadata(server, first.cache, server.current('b'));
  act(() => second.result.current.change({ ...second.result.current.draft, name: 'Draft B' }));
  server.client.setConfig({ baseUrl: `${server.origin}/a` });
  await act(async () => {
    await staleSave();
    await second.result.current.save();
  });
  expect(server.requests).toEqual([]);
  const reopened = mountMetadata(server, first.cache);
  expect(reopened.result.current.draft.name).toBe('Draft A');
  await act(() => reopened.result.current.save());
  expect(
    server.requests.filter((request) => request.method === 'PATCH').map((request) => request.path)
  ).toEqual(['/a/trips/7']);
  expect(reopened.result.current.canUndo).toBe(true);
});

it.each([false, true])(
  'settles a valid dispatched A receipt only into retained A after its initiating view closes (sibling=%s)',
  async (keepSibling) => {
    const first = mountMetadata(server);
    const sibling = keepSibling ? mountMetadata(server, first.cache) : undefined;
    const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
      <QueryClientProvider client={first.cache}>{children}</QueryClientProvider>
    );
    const list = renderHook(
      () =>
        useQuery({
          queryKey: ['trips', `${server.origin}/a`, 'list'],
          queryFn: () => loadTrips({ tripClient: server.client }),
        }),
      { wrapper }
    );
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    act(() => first.result.current.change({ ...first.result.current.draft, name: 'Confirmed A' }));
    const staleSave = first.result.current.save;
    const staleUndo = first.result.current.undo;
    const release = server.hold();
    let pending = Promise.resolve();
    act(() => {
      pending = first.result.current.save();
    });
    await waitFor(() =>
      expect(server.requests.filter(({ method }) => method === 'PATCH')).toHaveLength(1)
    );
    first.unmount();
    server.client.setConfig({ baseUrl: `${server.origin}/b` });
    const second = mountMetadata(server, first.cache, server.current('b'));
    await act(async () => {
      release();
      await pending;
      await staleSave();
      await staleUndo();
    });
    await waitFor(() =>
      expect(first.cache.getQueryState(['trips', `${server.origin}/a`, 'list'])?.fetchStatus).toBe(
        'idle'
      )
    );
    expect(second.result.current.draft.name).toBe('Owner B');
    expect(second.result.current.canUndo).toBe(false);
    expect(first.cache.getQueryData(['trips', `${server.origin}/b`, 7])).toBeUndefined();
    expect(first.cache.getQueryData(['trips', `${server.origin}/a`, 7])).toEqual(server.current());
    expect(first.cache.getQueryData(['trips', `${server.origin}/a`, 'list'])).toEqual([
      server.current(),
    ]);
    expect(server.requests.some(({ path }) => path.startsWith('/b/'))).toBe(false);
    second.unmount();
    sibling?.unmount();
    list.unmount();
    server.client.setConfig({ baseUrl: `${server.origin}/a` });
    await act(async () => {
      await staleSave();
      await staleUndo();
    });
    const reopened = mountMetadata(server, first.cache);
    expect(reopened.result.current.failure).toBeUndefined();
    expect(reopened.result.current.previous.name).toBe('Confirmed A');
    expect(reopened.result.current.canUndo).toBe(true);
    server.status(503);
    const read = renderHook(() => useTripMetadataRead(7, { tripClient: server.client }), {
      wrapper,
    });
    await waitFor(() => expect(read.result.current.isError).toBe(true));
    expect(read.result.current.retainedSource?.name).toBe('Confirmed A');
    expect(reopened.result.current.canUndo).toBe(true);
    expect(server.requests.filter(({ method }) => method === 'PATCH')).toHaveLength(1);
    await act(() => reopened.result.current.undo());
    expect(server.current()).toEqual(metadataTrip);
    expect(server.requests.filter(({ method }) => method === 'PATCH')).toHaveLength(2);
  }
);

it.each([
  { ...metadataTrip, id: 8 },
  { ...metadataTrip, name: 'Wrong submitted fields' },
  { id: 7 },
])(
  'does not establish history or cache proof from a foreign, mismatched or malformed success %j',
  async (response) => {
    const view = mountMetadata(server);
    act(() => view.result.current.change({ ...view.result.current.draft, name: 'Requested' }));
    server.reply(response);
    await act(() => view.result.current.save());
    expect(view.result.current.failure).toBeDefined();
    expect(view.result.current.canUndo).toBe(false);
    expect(view.result.current.previous.name).toBe('Original');
    expect(view.cache.getQueryData(['trips', `${server.origin}/a`, 7])).toBeUndefined();
    await act(() => view.result.current.retry());
    expect(view.result.current.canUndo).toBe(true);
    expect(view.cache.getQueryData(['trips', `${server.origin}/a`, 7])).toEqual(server.current());
  }
);
