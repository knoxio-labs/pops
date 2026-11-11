import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { loadTrip } from '../api/source';
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

function mountRead(cache = new QueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
  return {
    ...renderHook(() => useTripMetadataRead(7, { tripClient: server.client }), { wrapper }),
    cache,
    wrapper,
  };
}

it('keeps retained fallback distinct from GET state and composes with existing raw Trip observers', async () => {
  const editor = mountMetadata(server);
  act(() =>
    editor.result.current.change({ ...editor.result.current.draft, when: 'unsaved\nWhen' })
  );
  editor.unmount();
  editor.cache.clear();
  const release = server.holdRead();
  const read = mountRead(editor.cache);
  expect(read.result.current.isPending).toBe(true);
  expect(read.result.current.data).toBeUndefined();
  expect(read.result.current.retainedSource).toEqual(metadataTrip);
  release();
  await waitFor(() => expect(read.result.current.isSuccess).toBe(true));
  const rawKey = ['trips', `${server.origin}/a`, 7];
  const raw = renderHook(
    () =>
      useQuery({
        queryKey: rawKey,
        queryFn: () => loadTrip(7, { tripClient: server.client }),
      }),
    { wrapper: read.wrapper }
  );
  await waitFor(() => expect(raw.result.current.data).toEqual(metadataTrip));
  const reopened = mountMetadata(server, read.cache);
  expect(reopened.result.current.draft.when).toBe('unsaved\nWhen');
  await act(() => reopened.result.current.save());
  await waitFor(() => expect(raw.result.current.data).toEqual(server.current()));
  expect(read.cache.getQueryData(rawKey)).toEqual(server.current());
  expect(read.cache.getQueryData([...rawKey, 'metadata'])).toEqual(server.current());
  expect(reopened.result.current.canUndo).toBe(true);
});

it('rejects delayed foreign-origin delivery and refuses an old-key refetch into the new origin', async () => {
  const release = server.holdRead();
  const read = mountRead();
  await waitFor(() => expect(server.requests).toHaveLength(1));
  server.client.setConfig({ baseUrl: `${server.origin}/b` });
  release();
  await waitFor(() => expect(read.result.current.isError).toBe(true));
  expect(read.result.current.data).toBeUndefined();
  expect(read.result.current.ownershipError).toBeDefined();
  expect(read.cache.getQueryData(['trips', `${server.origin}/a`, 7, 'metadata'])).toBeUndefined();
  await act(() => read.result.current.refetch().then(() => undefined));
  expect(server.requests).toHaveLength(1);
  server.client.setConfig({ baseUrl: `${server.origin}/a` });
  await act(() => read.result.current.refetch().then(() => undefined));
  await waitFor(() => expect(read.result.current.data).toEqual(metadataTrip));
});

it('does not let a pre-save GET replace a confirmed own edit or its Undo proof', async () => {
  const editor = mountMetadata(server);
  const release = server.holdRead();
  const read = mountRead(editor.cache);
  await waitFor(() => expect(server.requests).toHaveLength(1));
  act(() => editor.result.current.change({ ...editor.result.current.draft, name: 'Own edit' }));
  await act(() => editor.result.current.save());
  release();
  await waitFor(() => expect(read.result.current.isFetching).toBe(false));
  expect(editor.result.current.previous.name).toBe('Own edit');
  expect(editor.result.current.canUndo).toBe(true);
  expect(read.cache.getQueryData(['trips', `${server.origin}/a`, 7, 'metadata'])).toEqual(
    server.current()
  );
  await act(() => editor.result.current.undo());
  expect(server.current()).toEqual(metadataTrip);
});

it('does not adopt a GET delivered after its view closes even if the same origin returns', async () => {
  const release = server.holdRead();
  const read = mountRead();
  await waitFor(() => expect(server.requests).toHaveLength(1));
  read.unmount();
  server.client.setConfig({ baseUrl: `${server.origin}/b` });
  server.client.setConfig({ baseUrl: `${server.origin}/a` });
  release();
  await waitFor(() =>
    expect(
      read.cache.getQueryState(['trips', `${server.origin}/a`, 7, 'metadata'])?.fetchStatus
    ).toBe('idle')
  );
  expect(read.cache.getQueryData(['trips', `${server.origin}/a`, 7, 'metadata'])).toBeUndefined();
  const reopened = mountRead(read.cache);
  await waitFor(() => expect(reopened.result.current.isSuccess).toBe(true));
  expect(reopened.result.current.data).toEqual(metadataTrip);
});

it.each([{ ...metadataTrip, id: 8 }, { id: 7 }, { ...metadataTrip, tagId: 'invalid-wire-id' }])(
  'preserves last-good source without adopting an invalid GET %j',
  async (response) => {
    const editor = mountMetadata(server);
    const read = mountRead(editor.cache);
    await waitFor(() => expect(read.result.current.isSuccess).toBe(true));
    server.reply(response);
    await act(() => read.result.current.refetch().then(() => undefined));
    await waitFor(() => expect(read.result.current.isError).toBe(true));
    expect(read.result.current.retainedSource).toEqual(metadataTrip);
    expect(read.result.current.data).toEqual(metadataTrip);
    expect(editor.result.current.canUndo).toBe(false);
    await act(() => read.result.current.refetch().then(() => undefined));
    await waitFor(() => expect(read.result.current.isSuccess).toBe(true));
  }
);
