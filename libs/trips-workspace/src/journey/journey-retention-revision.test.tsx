import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { journeyTransport, sourceJourney, sourceLeg } from './test-utils';
import { useJourneyEditor } from './use-journey-editor';

import type { ReactNode } from 'react';

import type { JourneySource } from './types';

const initial: JourneySource = { journey: sourceJourney(), legs: [sourceLeg()], legRevision: 0 };
const operationId = '11111111-1111-4111-8111-111111111111';
const receipt = {
  operationId,
  legId: 40,
  state: 'removed',
  removedRevision: 1,
  restoredRevision: null,
};
const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
});
function mount(transport: ReturnType<typeof journeyTransport>) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
  return (source: JourneySource) =>
    renderHook(
      ({ canonical }) =>
        useJourneyEditor(canonical, { tripId: 7, journeyId: 20, client: transport.client }),
      { initialProps: { canonical: source }, wrapper }
    );
}
it.each(['pending read', 'remounted clone'] as const)(
  'does not resurrect removed legs or lose the confirmed inverse after a stale %s',
  async (boundary) => {
    let release = () => {};
    const writeWait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transport = journeyTransport({
      writeWait,
      writes: [
        { status: 200, body: { revision: 1, legs: [], receipt } },
        {
          status: 200,
          body: {
            revision: 2,
            legs: initial.legs,
            receipt: { ...receipt, state: 'restored', restoredRevision: 2 },
          },
        },
      ],
    });
    const renderEditor = mount(transport);
    const first = renderEditor(initial);
    let pending: Promise<void> | undefined;
    act(() => {
      pending = first.result.current.run({ kind: 'remove', id: 40, operationId });
    });
    if (boundary === 'pending read') first.rerender({ canonical: structuredClone(initial) });
    await act(async () => {
      release();
      await pending;
    });
    const current =
      boundary === 'remounted clone'
        ? (() => {
            first.unmount();
            return renderEditor(structuredClone(initial));
          })()
        : first;
    expect(current.result.current.draft.legRevision).toBe(1);
    expect(current.result.current.draft.legs).toEqual([]);
    expect(current.result.current.canUndo).toBe(true);
    await act(async () => current.result.current.undo());
    expect(transport.requests.at(-1)?.body).toEqual({ expectedRevision: 1 });
    expect(current.result.current.draft.legs).toEqual(initial.legs);
  }
);
it('accepts unversioned Journey metadata from an older leg snapshot while retaining the newer leg aggregate', async () => {
  const transport = journeyTransport({
    writes: [{ status: 200, body: { revision: 1, legs: [], receipt } }],
  });
  const editor = mount(transport)(initial);
  await act(() => editor.result.current.run({ kind: 'remove', id: 40, operationId }));
  editor.rerender({
    canonical: { ...initial, journey: sourceJourney({ name: 'Independent metadata read' }) },
  });
  expect(editor.result.current.draft.journey.name).toBe('Independent metadata read');
  expect(editor.result.current.draft.legRevision).toBe(1);
  expect(editor.result.current.draft.legs).toEqual([]);
  expect(editor.result.current.canUndo).toBe(false);
});
it.each([1, 3])(
  'accepts a foreign leg aggregate at revision %i and invalidates own inverse history',
  async (legRevision) => {
    const transport = journeyTransport({
      writes: [{ status: 200, body: { revision: 1, legs: [], receipt } }],
    });
    const editor = mount(transport)(initial);
    await act(() => editor.result.current.run({ kind: 'remove', id: 40, operationId }));
    const legs = [sourceLeg({ id: 99, mode: 'Foreign owner read' })];
    editor.rerender({ canonical: { ...initial, legRevision, legs } });
    expect(editor.result.current.draft.legRevision).toBe(legRevision);
    expect(editor.result.current.draft.legs).toEqual(legs);
    expect(editor.result.current.canUndo).toBe(false);
  }
);
