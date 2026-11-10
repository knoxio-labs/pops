import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { journeyTransport, sourceJourney, sourceLeg, sourceProblem } from './test-utils';
import { useJourneyEditor } from './use-journey-editor';

import type { ReactNode } from 'react';

import type { JourneySource, LegRemovalResult } from './types';

const operationId = '11111111-1111-4111-8111-111111111111';
const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const cache of caches) cache.clear();
  caches.length = 0;
});
function mount(transport: ReturnType<typeof journeyTransport>, source: JourneySource) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  return renderHook(
    () => useJourneyEditor(source, { tripId: 7, journeyId: 20, client: transport.client }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={cache}>{children}</QueryClientProvider>
      ),
    }
  );
}
function removed(revision = 1): LegRemovalResult {
  return {
    revision,
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
const source: JourneySource = { journey: sourceJourney(), legs: [sourceLeg()], legRevision: 0 };

describe('receipt-backed editor inverse transport', () => {
  it('retries a lost removal result with the exact same operation and guard, then restores the original identity', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(operationId);
    const transport = journeyTransport({
      writes: [
        { status: 503, body: sourceProblem('trips.unavailable') },
        { status: 200, body: removed() },
        {
          status: 200,
          body: {
            revision: 2,
            legs: source.legs,
            receipt: { ...removed().receipt, state: 'restored', restoredRevision: 2 },
          },
        },
      ],
    });
    const editor = mount(transport, source);
    await act(() => editor.result.current.run({ kind: 'remove', id: 40 }));
    expect(editor.result.current.failure).toBeDefined();
    await act(async () => editor.result.current.retry());
    await act(async () => {});
    const writes = transport.requests.filter((request) => request.method !== 'GET');
    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual(writes[1]);
    expect(writes[0]?.body).toEqual({ operationId, expectedRevision: 0 });
    expect(editor.result.current.canUndo).toBe(true);
    await act(async () => editor.result.current.undo());
    await act(async () => {});
    expect(transport.requests.at(-1)).toMatchObject({
      method: 'POST',
      path: `/trips/7/journeys/20/leg-removals/${operationId}/restore`,
      body: { expectedRevision: 1 },
    });
    expect(editor.result.current.draft.legs).toEqual(source.legs);
    expect(editor.result.current.draft.legRevision).toBe(2);
  });

  it('does not borrow a later revision observed by an exact replay', async () => {
    const transport = journeyTransport({ writes: [{ status: 200, body: removed(7) }] });
    const editor = mount(transport, source);
    await act(() =>
      editor.result.current.run({ kind: 'remove', id: 40, operationId, expectedRevision: 0 })
    );
    expect(editor.result.current.canUndo).toBe(false);
    expect(editor.result.current.draft.legRevision).toBe(7);
    expect(editor.result.current.failure).toBeDefined();
  });

  it('clears stale inverse history on an actual concurrent order revision conflict', async () => {
    const transport = journeyTransport({
      writes: [
        { status: 200, body: removed() },
        { status: 409, body: sourceProblem('trips.journey_leg.leg_revision_conflict') },
      ],
    });
    const editor = mount(transport, source);
    await act(() => editor.result.current.run({ kind: 'remove', id: 40, operationId }));
    expect(editor.result.current.canUndo).toBe(true);
    await act(async () => editor.result.current.undo());
    await act(async () => {});
    expect(editor.result.current.canUndo).toBe(false);
    act(() => editor.result.current.discard());
    expect(editor.result.current.canUndo).toBe(false);
  });
  it('restores consecutive removals in LIFO order using only its own confirmed revisions', async () => {
    const otherOperationId = '22222222-2222-4222-8222-222222222222';
    const second = sourceLeg({ id: 41 });
    const initial = { ...source, legs: [...source.legs, second] };
    const secondReceipt = {
      operationId: otherOperationId,
      legId: 41,
      state: 'removed',
      removedRevision: 2,
      restoredRevision: null,
    };
    const transport = journeyTransport({
      writes: [
        { status: 200, body: { ...removed(), legs: [second] } },
        { status: 200, body: { revision: 2, legs: [], receipt: secondReceipt } },
        {
          status: 200,
          body: {
            revision: 3,
            legs: [second],
            receipt: { ...secondReceipt, state: 'restored', restoredRevision: 3 },
          },
        },
        {
          status: 200,
          body: {
            revision: 4,
            legs: initial.legs,
            receipt: { ...removed().receipt, state: 'restored', restoredRevision: 4 },
          },
        },
      ],
    });
    const editor = mount(transport, initial);
    await act(() => editor.result.current.run({ kind: 'remove', id: 40, operationId }));
    await act(() =>
      editor.result.current.run({ kind: 'remove', id: 41, operationId: otherOperationId })
    );
    await act(async () => editor.result.current.undo());
    await act(async () => {});
    expect(editor.result.current.draft.legs).toEqual([second]);
    expect(editor.result.current.canUndo).toBe(true);
    await act(async () => editor.result.current.undo());
    await act(async () => {});
    expect(editor.result.current.draft.legs).toEqual(initial.legs);
    expect(editor.result.current.canUndo).toBe(false);
    expect(
      transport.requests
        .filter((request) => request.method !== 'GET')
        .map((request) => request.body)
    ).toEqual([
      { operationId, expectedRevision: 0 },
      { operationId: otherOperationId, expectedRevision: 1 },
      { expectedRevision: 2 },
      { expectedRevision: 3 },
    ]);
  });
});
