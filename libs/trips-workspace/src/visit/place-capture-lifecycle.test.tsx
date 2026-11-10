import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { visitTransport } from './test-utils';
import { usePlaceCapture } from './use-place-capture';

import type { ReactNode } from 'react';

import type { VisitFieldProps } from './types';

const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
});
function delayedCreation(failCreation = false) {
  const transport = visitTransport({ failCreation });
  const fetcher = transport.client.getConfig().fetch;
  if (!fetcher) throw new Error('Missing test transport');
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  transport.client.setConfig({
    fetch: async (input, init) => {
      const outcome = await Promise.allSettled([fetcher(input, init)]);
      await gate;
      const result = outcome[0];
      if (!result) throw new Error('Missing request outcome');
      if (result.status === 'rejected') throw result.reason;
      return result.value;
    },
  });
  const cache = new QueryClient();
  caches.push(cache);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
  const identity = { tripId: 7, visitId: 31, client: transport.client };
  return { transport, cache, wrapper, identity, release: () => release?.() };
}

it.each(['view close', 'origin change'])(
  'retains late Place receipt after %s but does not dispatch association',
  async (boundary) => {
    const { transport, cache, wrapper, identity, release } = delayedCreation();
    const firstCommit = vi.fn<VisitFieldProps['commit']>();
    const currentCommit = vi.fn<VisitFieldProps['commit']>();
    const reload = vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
    const first = renderHook(() => usePlaceCapture(identity, firstCommit, reload), { wrapper });
    const second = renderHook(() => usePlaceCapture(identity, currentCommit, reload), { wrapper });
    act(() => first.result.current.setName('New city'));
    const stale = first.result.current;
    let pending: Promise<void> | undefined;
    act(() => {
      pending = first.result.current.submit();
    });
    await waitFor(() => expect(transport.creates).toHaveLength(1));
    expect(second.result.current.busy).toBe(true);
    await act(async () => {
      await second.result.current.submit();
    });
    const originalKey = ['trips', transport.client.getConfig().baseUrl, 'places'];
    if (boundary === 'view close') first.unmount();
    else transport.client.setConfig({ baseUrl: 'https://second.test' });
    const foreignKey = ['trips', 'https://second.test', 'places'];
    cache.setQueryData(foreignKey, []);
    await act(async () => {
      release();
      await pending;
    });
    expect(firstCommit).not.toHaveBeenCalled();
    expect(second.result.current.created?.id).toBe(53);
    expect(second.result.current.uncertain).toBe(false);
    expect(cache.getQueryData(originalKey)).toEqual([expect.objectContaining({ id: 53 })]);
    expect(cache.getQueryData(foreignKey)).toEqual([]);
    await act(async () => {
      await stale.submit();
      stale.reload();
    });
    expect(reload).not.toHaveBeenCalled();
    if (boundary === 'origin change') transport.client.setConfig({ baseUrl: originalKey[1] });
    await act(async () => {
      await second.result.current.submit();
    });
    expect(transport.creates).toHaveLength(1);
    expect(currentCommit).toHaveBeenCalledExactlyOnceWith({ placeId: 53 });
  }
);

it('retains uncertainty when an in-flight creation fails after close, including across query-cache clearing', async () => {
  const { transport, cache, wrapper, identity, release } = delayedCreation(true);
  const commit = vi.fn<VisitFieldProps['commit']>();
  const reload = async () => undefined;
  const first = renderHook(() => usePlaceCapture(identity, commit, reload), { wrapper });
  act(() => first.result.current.setName('Unknown outcome'));
  let pending: Promise<void> | undefined;
  act(() => {
    pending = first.result.current.submit();
  });
  await waitFor(() => expect(transport.creates).toHaveLength(1));
  first.unmount();
  await act(async () => {
    release();
    await pending;
  });
  cache.clear();
  const second = renderHook(() => usePlaceCapture(identity, commit, reload), { wrapper });
  expect(second.result.current).toMatchObject({
    name: 'Unknown outcome',
    uncertain: true,
    busy: false,
  });
  await act(async () => {
    second.result.current.beginNew(53);
    second.result.current.reload();
    await second.result.current.submit();
  });
  expect(transport.creates).toHaveLength(1);
  expect(commit).not.toHaveBeenCalled();
});
