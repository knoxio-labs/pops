import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { sourceVisit, visitTransport } from './test-utils';
import { useVisitEditor } from './use-visit-editor';

import type { PropsWithChildren } from 'react';

afterEach(cleanup);

it('explicit acknowledged reload discards retained failures, semantic buffers and inverse history', async () => {
  const initial = sourceVisit();
  const transport = visitTransport();
  transport.patchReplies.push({
    status: 503,
    body: { code: 'trips.unavailable', message: 'Unavailable' },
  });
  const cache = new QueryClient();
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
  const identity = { client: transport.client, tripId: 7, visitId: 31 };
  const view = renderHook(() => useVisitEditor(initial, identity), { wrapper });
  await act(async () => {
    await view.result.current.commit({ notes: 'Failed notes' });
  });
  act(() => view.result.current.timingDrafts.month.set({ year: '2029', month: '13', part: '' }));
  expect(view.result.current.failure).toBeDefined();
  act(() => {
    expect(view.result.current.discard(initial)).toEqual(initial);
  });
  expect(view.result.current.draft).toEqual(initial);
  expect(view.result.current.failure).toBeUndefined();
  expect(view.result.current.timingDrafts.month.read()).toEqual({ year: '', month: '', part: '' });
  expect(view.result.current.canUndo).toBe(false);
  const closed = view.result.current;
  view.unmount();
  expect(closed.discard(sourceVisit({ revision: 7, notes: 'Late other source' }))).toBeUndefined();
});

it('preserves the confirmed Visit revision and own inverse when reopening with an older cloned read', async () => {
  const initial = sourceVisit();
  const changed = sourceVisit({ revision: 1, notes: 'Confirmed notes' });
  const transport = visitTransport();
  transport.patchReplies.push({ status: 200, body: changed });
  const cache = new QueryClient();
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
  const identity = { client: transport.client, tripId: 7, visitId: 31 };
  const first = renderHook(() => useVisitEditor(initial, identity), { wrapper });
  const earlierReload = first.result.current.discard;
  await act(async () => {
    await first.result.current.commit({ notes: changed.notes });
  });
  expect(first.result.current.saved.revision).toBe(1);
  act(() => {
    expect(earlierReload(structuredClone(initial))).toBeUndefined();
  });
  expect(first.result.current.canUndo).toBe(true);
  first.unmount();
  const stale = structuredClone(initial);
  const reopened = renderHook(() => useVisitEditor(stale, identity), { wrapper });
  expect(reopened.result.current.saved).toEqual(changed);
  expect(reopened.result.current.canUndo).toBe(true);
  transport.patchReplies.push({ status: 200, body: sourceVisit({ revision: 2 }) });
  await act(async () => {
    await reopened.result.current.undo();
  });
  expect(transport.patches.at(-1)).toMatchObject({ expectedRevision: 1, notes: initial.notes });
});
