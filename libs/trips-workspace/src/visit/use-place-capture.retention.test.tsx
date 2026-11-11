import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
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
function scope() {
  const cache = new QueryClient();
  caches.push(cache);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
  return { cache, wrapper };
}

it('retains unsaved name and an acknowledged place across close, retrying association through the current view only', async () => {
  const { wrapper } = scope();
  const transport = visitTransport();
  const identity = { tripId: 7, visitId: 31, client: transport.client };
  const firstCommit = vi
    .fn<VisitFieldProps['commit']>()
    .mockRejectedValue(new Error('Association failed'));
  const reload = async () => undefined;
  const first = renderHook(() => usePlaceCapture(identity, firstCommit, reload), { wrapper });
  act(() => first.result.current.setName('New city'));
  first.unmount();
  const reopened = renderHook(() => usePlaceCapture(identity, firstCommit, reload), { wrapper });
  expect(reopened.result.current.name).toBe('New city');
  await act(async () => {
    await reopened.result.current.submit();
  });
  expect(reopened.result.current.created?.id).toBe(53);
  reopened.unmount();
  const currentCommit = vi.fn<VisitFieldProps['commit']>();
  const second = renderHook(() => usePlaceCapture(identity, currentCommit, reload), { wrapper });
  expect(second.result.current.created?.id).toBe(53);
  await act(async () => {
    await second.result.current.submit();
  });
  expect(transport.creates).toEqual([{ name: 'New city' }]);
  expect(firstCommit).toHaveBeenCalledOnce();
  expect(currentCommit).toHaveBeenCalledExactlyOnceWith({ placeId: 53 });
});

it('retains ambiguous creation across close and canonical reload without authorizing another POST', async () => {
  const { wrapper } = scope();
  const transport = visitTransport({ failCreation: true });
  const identity = { tripId: 7, visitId: 31, client: transport.client };
  const commit = vi.fn<VisitFieldProps['commit']>();
  const reload = vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
  const first = renderHook(() => usePlaceCapture(identity, commit, reload), { wrapper });
  act(() => first.result.current.setName('Uncertain city'));
  await act(async () => {
    await first.result.current.submit();
  });
  first.unmount();
  const second = renderHook(() => usePlaceCapture(identity, commit, reload), { wrapper });
  expect(second.result.current.uncertain).toBe(true);
  await act(async () => {
    second.result.current.reload();
    await second.result.current.submit();
  });
  expect(second.result.current.uncertain).toBe(true);
  expect(transport.creates).toEqual([{ name: 'Uncertain city' }]);
  expect(commit).not.toHaveBeenCalled();
  expect(reload).toHaveBeenCalledOnce();
});

it.each(['query client', 'client object', 'origin', 'trip', 'source'] as const)(
  'isolates retained place capture at the %s boundary',
  (boundary) => {
    const firstScope = scope();
    const transport = visitTransport();
    const identity = { tripId: 7, visitId: 31, client: transport.client };
    const commit = vi.fn<VisitFieldProps['commit']>();
    const reload = async () => undefined;
    const first = renderHook(() => usePlaceCapture(identity, commit, reload), {
      wrapper: firstScope.wrapper,
    });
    act(() => first.result.current.setName('Original owner name'));
    let next = identity;
    let wrapper = firstScope.wrapper;
    if (boundary === 'query client') wrapper = scope().wrapper;
    if (boundary === 'client object') next = { ...identity, client: visitTransport().client };
    if (boundary === 'origin') transport.client.setConfig({ baseUrl: 'https://second.test' });
    if (boundary === 'trip') next = { ...identity, tripId: 8 };
    if (boundary === 'source') next = { ...identity, visitId: 32 };
    const second = renderHook(() => usePlaceCapture(next, commit, reload), { wrapper });
    expect(second.result.current.name).toBe('');
    expect(first.result.current.name).toBe('Original owner name');
  }
);
