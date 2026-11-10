import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { visitTransport } from './test-utils';
import { usePlaceCapture } from './use-place-capture';

import type { ReactNode } from 'react';

import type { VisitPatch } from './types';

afterEach(cleanup);
it('serializes creation and preserves its receipt when association rejects, retrying only that identity', async () => {
  const transport = visitTransport();
  const cache = new QueryClient();
  const commit = vi
    .fn<(patch: VisitPatch) => Promise<void>>()
    .mockRejectedValueOnce(new Error('Association failed'))
    .mockResolvedValue(undefined);
  const { result } = renderHook(
    () =>
      usePlaceCapture(
        { tripId: 7, visitId: 31, client: transport.client },
        commit,
        async () => undefined
      ),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={cache}>{children}</QueryClientProvider>
      ),
    }
  );
  act(() => result.current.setName('New city'));
  await act(async () => {
    await Promise.all([result.current.submit(), result.current.submit()]);
  });
  expect(transport.creates).toEqual([{ name: 'New city' }]);
  expect(result.current.created?.id).toBe(53);
  expect(result.current.uncertain).toBe(false);
  expect(commit).toHaveBeenCalledTimes(1);
  await act(async () => {
    await result.current.submit();
  });
  expect(transport.creates).toHaveLength(1);
  expect(commit.mock.calls).toEqual([[{ placeId: 53 }], [{ placeId: 53 }]]);
  cache.clear();
});

it('blocks blind POST retries after an unacknowledged creation while permitting a canonical catalogue reload', async () => {
  const transport = visitTransport({ failCreation: true });
  const cache = new QueryClient();
  const commit = vi.fn<(patch: VisitPatch) => Promise<void>>();
  const reload = vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
  const { result } = renderHook(
    () => usePlaceCapture({ tripId: 7, visitId: 31, client: transport.client }, commit, reload),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={cache}>{children}</QueryClientProvider>
      ),
    }
  );
  act(() => result.current.setName('New city'));
  await act(async () => {
    await result.current.submit();
  });
  expect(result.current.uncertain).toBe(true);
  expect(result.current.created).toBeUndefined();
  await act(async () => {
    result.current.reload();
    await result.current.submit();
  });
  expect(reload).toHaveBeenCalledOnce();
  expect(transport.creates).toHaveLength(1);
  expect(commit).not.toHaveBeenCalled();
  cache.clear();
});

it('retains rejected capture for correction and permits an explicit new attempt after a definite rejection', async () => {
  const transport = visitTransport({ creationRejection: 400 });
  const cache = new QueryClient();
  const commit = vi.fn<(patch: VisitPatch) => Promise<void>>();
  const { result } = renderHook(
    () =>
      usePlaceCapture(
        { tripId: 7, visitId: 31, client: transport.client },
        commit,
        async () => undefined
      ),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={cache}>{children}</QueryClientProvider>
      ),
    }
  );
  act(() => result.current.setName('Rejected city'));
  await act(async () => {
    await result.current.submit();
  });
  expect(result.current.uncertain).toBe(false);
  expect(result.current.created).toBeUndefined();
  expect(result.current.name).toBe('Rejected city');
  act(() => result.current.setName('Corrected city'));
  await act(async () => {
    await result.current.submit();
  });
  expect(transport.creates).toEqual([{ name: 'Rejected city' }, { name: 'Corrected city' }]);
  expect(commit).not.toHaveBeenCalled();
  cache.clear();
});

it('starts another capture only after its own created identity is confirmed as associated', async () => {
  const transport = visitTransport();
  const cache = new QueryClient();
  const commit = vi.fn<(patch: VisitPatch) => Promise<void>>().mockResolvedValue(undefined);
  const { result } = renderHook(
    () =>
      usePlaceCapture(
        { tripId: 7, visitId: 31, client: transport.client },
        commit,
        async () => undefined
      ),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={cache}>{children}</QueryClientProvider>
      ),
    }
  );
  act(() => result.current.setName('New city'));
  await act(async () => {
    await result.current.submit();
  });
  act(() => result.current.beginNew(51));
  expect(result.current.created?.id).toBe(53);
  act(() => result.current.beginNew(53));
  expect(result.current.created).toBeUndefined();
  expect(result.current.name).toBe('');
  act(() => result.current.setName('Another city'));
  await act(async () => {
    await result.current.submit();
  });
  expect(transport.creates).toEqual([{ name: 'New city' }, { name: 'Another city' }]);
  expect(commit.mock.calls).toEqual([[{ placeId: 53 }], [{ placeId: 54 }]]);
  cache.clear();
});
