import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { journeyTransport, sourceProblem } from './test-utils';
import { useJourneyAlternatives } from './use-journey-alternatives';
import { useJourneyNavigation } from './use-journey-navigation';

import type { ReactNode } from 'react';

import type { JourneyGroup } from './types';

const group: JourneyGroup = {
  id: 80,
  tripId: 7,
  currentJourneyId: 20,
  alternativeJourneyIds: [21],
  revision: 3,
  createdAt: '2029-01-01T00:00:00Z',
  updatedAt: '2029-01-01T00:00:00Z',
};
const selected: JourneyGroup = {
  ...group,
  currentJourneyId: 21,
  alternativeJourneyIds: [20],
  revision: 4,
};
const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
});
function host(transport: ReturnType<typeof journeyTransport>) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  return {
    cache,
    mount: () =>
      renderHook(
        () => {
          const identity = { tripId: 7, journeyId: 20, client: transport.client };
          const navigation = useJourneyNavigation(identity);
          return useJourneyAlternatives({ ...identity, journeyId: navigation.viewed }, navigation);
        },
        {
          wrapper: ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={cache}>{children}</QueryClientProvider>
          ),
        }
      ),
  };
}
function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
const writes = (transport: ReturnType<typeof journeyTransport>) =>
  transport.requests.filter((request) => request.method !== 'GET');

it('retains exact confirmed selection Undo through workspace remount without adopting a foreign revision', async () => {
  const transport = journeyTransport({
    groups: [group],
    writes: [
      { status: 200, body: selected },
      { status: 200, body: { ...group, revision: 5 } },
    ],
  });
  const context = host(transport);
  const first = context.mount();
  await waitFor(() => expect(first.result.current.query.isSuccess).toBe(true));
  await act(() => first.result.current.select(group, 21));
  first.unmount();
  transport.groupRead([selected]);
  const second = context.mount();
  await waitFor(() => expect(second.result.current.canUndo).toBe(true));
  expect(second.result.current.undo).toMatchObject({
    groupId: 80,
    previousSelection: 20,
    originalViewed: 20,
    postWriteRevision: 4,
  });
  await act(async () => {
    context.cache.setQueryData(
      ['trips', 'http://journeys.test', 7, 'journey-groups'],
      [{ ...selected, revision: 9 }]
    );
  });
  await waitFor(() => expect(second.result.current.canUndo).toBe(false));
  await act(() => second.result.current.undoSelection());
  expect(writes(transport)).toHaveLength(1);
  await act(async () => {
    context.cache.setQueryData(['trips', 'http://journeys.test', 7, 'journey-groups'], [selected]);
  });
  await waitFor(() => expect(second.result.current.canUndo).toBe(true));
  await act(() => second.result.current.undoSelection());
  expect(writes(transport)[1]?.body).toEqual({ journeyId: 20, expectedRevision: 4 });
});
it('retains grouping uncertainty through remount and failed recovery reads', async () => {
  const transport = journeyTransport({
    writes: [{ status: 503, body: sourceProblem('trips.creation.unknown') }],
  });
  const context = host(transport);
  const first = context.mount();
  await waitFor(() => expect(first.result.current.query.isSuccess).toBe(true));
  await act(() => first.result.current.add());
  expect(first.result.current.needsReload).toBe(true);
  first.unmount();
  const second = context.mount();
  expect(second.result.current.needsReload).toBe(true);
  await act(() => second.result.current.add());
  expect(writes(transport)).toHaveLength(1);
  transport.groupRead([], 503);
  await act(async () => second.result.current.reload());
  await waitFor(() => expect(second.result.current.busy).toBe(false));
  expect(second.result.current.needsReload).toBe(true);
  transport.groupRead([group]);
  await act(async () => second.result.current.reload());
  await waitFor(() => expect(second.result.current.needsReload).toBe(false));
  expect(writes(transport)).toHaveLength(1);
});
it.each(['close', 'origin'] as const)(
  'fences the next grouping write after asynchronous group creation: %s',
  async (boundary) => {
    const gate = deferred();
    const transport = journeyTransport({
      writeWait: gate.promise,
      writes: [{ status: 201, body: group }],
    });
    const context = host(transport);
    const first = context.mount();
    await waitFor(() => expect(first.result.current.query.isSuccess).toBe(true));
    let pending: Promise<void> | undefined;
    act(() => {
      pending = first.result.current.add();
    });
    await waitFor(() => expect(writes(transport)).toHaveLength(1));
    if (boundary === 'close') first.unmount();
    else transport.client.setConfig({ baseUrl: 'http://different-owner.test' });
    await act(async () => {
      gate.resolve();
      await pending;
    });
    expect(writes(transport)).toHaveLength(1);
    expect(
      context.cache.getQueryData(['trips', 'http://journeys.test', 7, 'journey-groups'])
    ).toEqual([group]);
    expect(
      context.cache.getQueryData(['trips', 'http://different-owner.test', 7, 'journey-groups'])
    ).not.toEqual([group]);
  }
);
it('shares a pending selection lock, retains its late confirmation, and rejects a closed view callback', async () => {
  const gate = deferred();
  const transport = journeyTransport({
    groups: [group],
    writeWait: gate.promise,
    writes: [{ status: 200, body: selected }],
  });
  const context = host(transport);
  const first = context.mount();
  await waitFor(() => expect(first.result.current.query.isSuccess).toBe(true));
  const stale = first.result.current;
  let pending: Promise<void> | undefined;
  act(() => {
    pending = stale.select(group, 21);
  });
  await waitFor(() => expect(writes(transport)).toHaveLength(1));
  first.unmount();
  const second = context.mount();
  expect(second.result.current.busy).toBe(true);
  await act(() => second.result.current.select(group, 21));
  await act(async () => {
    gate.resolve();
    await pending;
  });
  expect(second.result.current.canUndo).toBe(true);
  await act(() => stale.select(group, 21));
  expect(writes(transport)).toHaveLength(1);
});
