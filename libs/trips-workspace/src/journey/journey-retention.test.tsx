import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { journeyTransport, sourceJourney, sourceLeg, sourceProblem } from './test-utils';
import { useJourneyEditor } from './use-journey-editor';

import type { ReactNode } from 'react';

import type { JourneySource } from './types';

const caches: QueryClient[] = [];
const initial: JourneySource = { journey: sourceJourney(), legs: [sourceLeg()], legRevision: 0 };
const operationId = '11111111-1111-4111-8111-111111111111';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const cache of caches) cache.clear();
  caches.length = 0;
});
function host() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  return {
    cache,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    ),
  };
}
function receipt() {
  return {
    revision: 1,
    legs: [],
    receipt: {
      operationId,
      legId: 40,
      state: 'removed',
      removedRevision: 1,
      restoredRevision: null,
    },
  };
}
it('retains an unsaved Journey draft through view closure and cache eviction', () => {
  const transport = journeyTransport();
  const context = host();
  const mount = () =>
    renderHook(
      () => useJourneyEditor(initial, { tripId: 7, journeyId: 20, client: transport.client }),
      context
    );
  const first = mount();
  act(() => first.result.current.edit({ kind: 'journey', patch: { name: 'Uncommitted source' } }));
  first.unmount();
  context.cache.clear();
  const second = mount();
  expect(second.result.current.draft.journey.name).toBe('Uncommitted source');
  expect(second.result.current.dirty).toBe(true);
  expect(transport.requests).toEqual([]);
});
it('retains exact failed removal identity and its confirmed inverse through remount', async () => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(operationId);
  const transport = journeyTransport({
    writes: [
      { status: 503, body: sourceProblem('trips.unknown') },
      { status: 200, body: receipt() },
      {
        status: 200,
        body: {
          revision: 2,
          legs: initial.legs,
          receipt: { ...receipt().receipt, state: 'restored', restoredRevision: 2 },
        },
      },
    ],
  });
  const context = host();
  const mount = () =>
    renderHook(
      () => useJourneyEditor(initial, { tripId: 7, journeyId: 20, client: transport.client }),
      context
    );
  const first = mount();
  await act(() => first.result.current.run({ kind: 'remove', id: 40 }));
  first.unmount();
  const second = mount();
  expect(second.result.current.failure?.change).toMatchObject({ operationId, expectedRevision: 0 });
  await act(async () => second.result.current.retry());
  expect(transport.requests[1]).toEqual(transport.requests[0]);
  second.unmount();
  const third = mount();
  expect(third.result.current.canUndo).toBe(true);
  await act(async () => third.result.current.undo());
  expect(transport.requests.at(-1)?.body).toEqual({ expectedRevision: 1 });
  expect(third.result.current.draft.legs).toEqual(initial.legs);
});
it('shares the in-flight lock while rejecting actions from a closed view', async () => {
  let release = () => {};
  const writeWait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const transport = journeyTransport({
    writeWait,
    writes: [{ status: 200, body: sourceJourney({ name: 'Confirmed' }) }],
  });
  const context = host();
  const mount = () =>
    renderHook(
      () => useJourneyEditor(initial, { tripId: 7, journeyId: 20, client: transport.client }),
      context
    );
  const first = mount();
  const stale = first.result.current;
  let pending: Promise<void> | undefined;
  act(() => {
    pending = stale.run({ kind: 'journey', patch: { name: 'Confirmed' } });
  });
  first.unmount();
  const second = mount();
  expect(second.result.current.busy).toBe(true);
  await act(() => second.result.current.run({ kind: 'journey', patch: { name: 'Duplicate' } }));
  await act(async () => {
    release();
    await pending;
  });
  expect(second.result.current.draft.journey.name).toBe('Confirmed');
  await act(() => stale.run({ kind: 'journey', patch: { name: 'Closed' } }));
  expect(transport.requests).toHaveLength(1);
  expect(second.result.current.draft.journey.name).toBe('Confirmed');
});
it('does not deactivate another open view and isolates equal URLs on different client objects', async () => {
  const transport = journeyTransport({
    writes: [{ status: 200, body: sourceJourney({ name: 'Confirmed' }) }],
  });
  const other = journeyTransport();
  const context = host();
  const mount = (client = transport.client) =>
    renderHook(() => useJourneyEditor(initial, { tripId: 7, journeyId: 20, client }), context);
  const first = mount();
  const second = mount();
  act(() => first.result.current.edit({ kind: 'journey', patch: { name: 'Shared draft' } }));
  expect(second.result.current.draft.journey.name).toBe('Shared draft');
  expect(mount(other.client).result.current.dirty).toBe(false);
  first.unmount();
  await act(() => second.result.current.run({ kind: 'journey', patch: { name: 'Confirmed' } }));
  expect(second.result.current.draft.journey.name).toBe('Confirmed');
});
it('rejects retry after a mutable client origin changes without a rerender', async () => {
  const transport = journeyTransport({
    writes: [{ status: 503, body: sourceProblem('trips.unknown') }],
  });
  const context = host();
  const editor = renderHook(
    () => useJourneyEditor(initial, { tripId: 7, journeyId: 20, client: transport.client }),
    context
  );
  await act(() => editor.result.current.run({ kind: 'remove', id: 40, operationId }));
  transport.client.setConfig({ baseUrl: 'http://different-owner.test' });
  await act(async () => editor.result.current.retry());
  expect(transport.requests).toHaveLength(1);
  transport.client.setConfig({ baseUrl: 'http://journeys.test' });
  editor.rerender();
  expect(editor.result.current.failure?.change).toMatchObject({ operationId, expectedRevision: 0 });
});
it('keeps ambiguous leg creation blocked after closure until an explicit successful canonical reload', async () => {
  const transport = journeyTransport({
    writes: [{ status: 503, body: sourceProblem('trips.create.unknown') }],
  });
  const context = host();
  let canonical = initial;
  const mount = () =>
    renderHook(
      () => useJourneyEditor(canonical, { tripId: 7, journeyId: 20, client: transport.client }),
      context
    );
  const first = mount();
  await act(() => first.result.current.run({ kind: 'create', patch: {} }));
  first.unmount();
  const second = mount();
  expect(second.result.current.failure?.change.kind).toBe('create');
  await act(() => second.result.current.run({ kind: 'create', patch: {} }));
  expect(transport.requests).toHaveLength(1);
  canonical = { ...initial, legRevision: 1, legs: [...initial.legs, sourceLeg({ id: 99 })] };
  second.rerender();
  expect(second.result.current.failure).toBeDefined();
  act(() => second.result.current.discard());
  expect(second.result.current.failure).toBeUndefined();
  expect(second.result.current.draft).toEqual(canonical);
});
it('invalidates retained inverse history when a foreign canonical revision arrives', async () => {
  const transport = journeyTransport({ writes: [{ status: 200, body: receipt() }] });
  const context = host();
  const first = renderHook(
    () => useJourneyEditor(initial, { tripId: 7, journeyId: 20, client: transport.client }),
    context
  );
  await act(() => first.result.current.run({ kind: 'remove', id: 40, operationId }));
  first.unmount();
  const foreign = { ...initial, legs: [], legRevision: 8 };
  const second = renderHook(
    () => useJourneyEditor(foreign, { tripId: 7, journeyId: 20, client: transport.client }),
    context
  );
  expect(second.result.current.draft.legRevision).toBe(8);
  expect(second.result.current.canUndo).toBe(false);
});
it('isolates drafts across host scope, origin, trip and source identity', () => {
  const transport = journeyTransport();
  const context = host();
  const props = { tripId: 7, journeyId: 20, client: transport.client };
  const first = renderHook(() => useJourneyEditor(initial, props), context);
  act(() =>
    first.result.current.edit({ kind: 'journey', patch: { name: 'Private to source owner' } })
  );
  expect(renderHook(() => useJourneyEditor(initial, props), host()).result.current.dirty).toBe(
    false
  );
  expect(
    renderHook(() => useJourneyEditor(initial, { ...props, tripId: 8 }), context).result.current
      .dirty
  ).toBe(false);
  expect(
    renderHook(() => useJourneyEditor(initial, { ...props, journeyId: 21 }), context).result.current
      .dirty
  ).toBe(false);
  transport.client.setConfig({ baseUrl: 'http://different-owner.test' });
  expect(renderHook(() => useJourneyEditor(initial, props), context).result.current.dirty).toBe(
    false
  );
});
it('does not adopt another origin canonical read into an existing owner session', () => {
  const transport = journeyTransport();
  const context = host();
  const editor = renderHook(
    ({ source }) =>
      useJourneyEditor(source, { tripId: 7, journeyId: 20, client: transport.client }),
    { ...context, initialProps: { source: initial } }
  );
  transport.client.setConfig({ baseUrl: 'http://different-owner.test' });
  editor.rerender({
    source: { ...initial, journey: sourceJourney({ name: 'Other origin source' }) },
  });
  expect(editor.result.current.draft.journey.name).toBe('Harbour connection');
});
it('keeps a confirmed save and its Undo across two open views with distinct equal initial snapshots', async () => {
  const transport = journeyTransport({
    writes: [{ status: 200, body: sourceJourney({ name: 'Confirmed across views' }) }],
  });
  const context = host();
  const firstSource = structuredClone(initial);
  const secondSource = structuredClone(initial);
  const first = renderHook(
    () => useJourneyEditor(firstSource, { tripId: 7, journeyId: 20, client: transport.client }),
    context
  );
  const second = renderHook(
    () => useJourneyEditor(secondSource, { tripId: 7, journeyId: 20, client: transport.client }),
    context
  );
  await act(() =>
    first.result.current.run({ kind: 'journey', patch: { name: 'Confirmed across views' } })
  );
  expect(first.result.current.draft.journey.name).toBe('Confirmed across views');
  expect(second.result.current.draft.journey.name).toBe('Confirmed across views');
  expect(first.result.current.canUndo).toBe(true);
  expect(second.result.current.canUndo).toBe(true);
});
it('settles an already dispatched result only into the original owner cache after closure and origin change', async () => {
  let release = () => {};
  const writeWait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const transport = journeyTransport({
    writeWait,
    writes: [{ status: 200, body: sourceJourney({ name: 'Owned confirmation' }) }],
  });
  const context = host();
  const first = renderHook(
    () => useJourneyEditor(initial, { tripId: 7, journeyId: 20, client: transport.client }),
    context
  );
  let pending: Promise<void> | undefined;
  act(() => {
    pending = first.result.current.run({ kind: 'journey', patch: { name: 'Owned confirmation' } });
  });
  first.unmount();
  transport.client.setConfig({ baseUrl: 'http://different-owner.test' });
  const other = renderHook(
    () => useJourneyEditor(initial, { tripId: 7, journeyId: 20, client: transport.client }),
    context
  );
  await act(async () => {
    release();
    await pending;
  });
  expect(other.result.current.draft.journey.name).toBe('Harbour connection');
  expect(
    context.cache.getQueryData(['trips', 'http://journeys.test', 7, 'journey', 20])
  ).toMatchObject({ journey: { name: 'Owned confirmation' } });
  expect(
    context.cache.getQueryData(['trips', 'http://different-owner.test', 7, 'journey', 20])
  ).toBeUndefined();
});
it('retains a failed leg patch original baseline across foreign reads and remount', async () => {
  const transport = journeyTransport({
    writes: [
      { status: 503, body: sourceProblem('trips.unknown') },
      { status: 409, body: sourceProblem('trips.journey_leg.leg_revision_conflict') },
    ],
  });
  const context = host();
  const first = renderHook(
    () => useJourneyEditor(initial, { tripId: 7, journeyId: 20, client: transport.client }),
    context
  );
  await act(() =>
    first.result.current.run({ kind: 'leg', id: 40, patch: { mode: 'Failed source mode' } })
  );
  first.unmount();
  const foreign = {
    ...initial,
    legRevision: 9,
    legs: [sourceLeg({ mode: 'Foreign source mode' })],
  };
  const second = renderHook(
    () => useJourneyEditor(foreign, { tripId: 7, journeyId: 20, client: transport.client }),
    context
  );
  expect(second.result.current.draft.legs[0]?.mode).toBe('Failed source mode');
  await act(async () => second.result.current.retry());
  expect(transport.requests[1]).toEqual(transport.requests[0]);
  expect(transport.requests[1]?.body).toEqual({ mode: 'Failed source mode', expectedRevision: 0 });
  expect(second.result.current.canUndo).toBe(false);
});
