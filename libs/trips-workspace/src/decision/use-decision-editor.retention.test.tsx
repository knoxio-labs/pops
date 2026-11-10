import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { decisionQueryKey } from './api';
import { decisionTransport, sourceDecision } from './test-utils';
import { useDecisionEditor } from './use-decision-editor';

import type { ReactNode } from 'react';

import type { DecisionWorkspaceProps } from './types';

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
const initial = sourceDecision();
const command = { kind: 'edit-decision' as const, fields: { question: 'Confirmed question' } };

it.each(['query client', 'client object', 'origin', 'trip', 'source'] as const)(
  'isolates Decision sessions at the %s boundary',
  (boundary) => {
    const firstScope = scope();
    const transport = decisionTransport();
    const firstProps = { client: transport.client, tripId: 7, decisionId: 8 };
    const first = renderHook(() => useDecisionEditor(initial, firstProps), {
      wrapper: firstScope.wrapper,
    });
    act(() => first.result.current.editor.setDraft('question', 'Original owner draft'));
    let props: DecisionWorkspaceProps = firstProps;
    let wrapper = firstScope.wrapper;
    if (boundary === 'query client') wrapper = scope().wrapper;
    if (boundary === 'client object') props = { ...props, client: decisionTransport().client };
    if (boundary === 'origin') transport.client.setConfig({ baseUrl: 'https://second.test' });
    if (boundary === 'trip') props = { ...props, tripId: 9 };
    if (boundary === 'source') props = { ...props, decisionId: 10 };
    const second = renderHook(() => useDecisionEditor(initial, props), { wrapper });
    expect(second.result.current.state.drafts).toEqual({});
    expect(first.result.current.state.drafts.question).toBe('Original owner draft');
  }
);

it('rejects stale callbacks after close while another view can still write and Undo', async () => {
  const { wrapper } = scope();
  const transport = decisionTransport();
  const props = { client: transport.client, tripId: 7, decisionId: 8 };
  const first = renderHook(() => useDecisionEditor(initial, props), { wrapper });
  const second = renderHook(() => useDecisionEditor(initial, props), { wrapper });
  const stale = first.result.current.editor;
  first.unmount();
  expect(await stale.commit(command, 'Stale edit')).toBe(false);
  act(() => stale.setDraft('question', 'Stale draft'));
  expect(second.result.current.state.drafts).toEqual({});
  await act(async () => {
    expect(await second.result.current.editor.commit(command, 'Edit')).toBe(true);
  });
  await act(async () => {
    expect(await second.result.current.editor.undo()).toBe(true);
  });
  expect(
    transport.requests
      .filter((request) => request.method === 'PATCH')
      .map((request) => request.body)
  ).toEqual([
    { question: 'Confirmed question', expectedRevision: 0 },
    { question: 'Which departure?', expectedRevision: 1 },
  ]);
});

it('settles a dispatched response only into its captured session and cache after close and origin change', async () => {
  const { cache, wrapper } = scope();
  const transport = decisionTransport();
  const fetcher = transport.client.getConfig().fetch;
  if (!fetcher) throw new Error('Missing test transport');
  let release: (() => void) | undefined;
  const responseGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  transport.client.setConfig({
    fetch: async (input, init) => {
      const method = input instanceof Request ? input.method : init?.method;
      const response = await fetcher(input, init);
      if (method === 'PATCH') await responseGate;
      return response;
    },
  });
  const props = { client: transport.client, tripId: 7, decisionId: 8 };
  const originalKey = decisionQueryKey(props);
  const first = renderHook(() => useDecisionEditor(initial, props), { wrapper });
  let pending: Promise<boolean> | undefined;
  act(() => {
    pending = first.result.current.editor.commit(command, 'Edit');
  });
  await waitFor(() => expect(transport.requests).toHaveLength(1));
  first.unmount();
  transport.client.setConfig({ baseUrl: 'https://second.test' });
  const secondKey = decisionQueryKey(props);
  cache.setQueryData(secondKey, initial);
  const second = renderHook(() => useDecisionEditor(initial, props), { wrapper });
  await act(async () => {
    release?.();
    expect(await pending).toBe(true);
  });
  expect(cache.getQueryData(originalKey)).toMatchObject({
    decision: { revision: 1, question: 'Confirmed question' },
  });
  expect(cache.getQueryData(secondKey)).toEqual(initial);
  expect(second.result.current.state).toMatchObject({ source: initial, undoCount: 0 });
  transport.client.setConfig({ baseUrl: 'https://decision.test' });
  const reopened = renderHook(() => useDecisionEditor(initial, props), { wrapper });
  expect(reopened.result.current.state.undoCount).toBe(1);
});

it('ignores late reads and stale local draft callbacks after the mounted connection changes', () => {
  const { wrapper } = scope();
  const transport = decisionTransport();
  const props = { client: transport.client, tripId: 7, decisionId: 8 };
  const view = renderHook(({ source }) => useDecisionEditor(source, props), {
    wrapper,
    initialProps: { source: initial },
  });
  const original = view.result.current.editor;
  act(() => original.setDraft('question', 'Original owner intent'));
  transport.client.setConfig({ baseUrl: 'https://second.test' });
  expect(() => view.rerender({ source: sourceDecision(4) })).not.toThrow();
  expect(() => act(() => original.setDraft('question', 'Wrong owner intent'))).not.toThrow();
  expect(view.result.current.state).toMatchObject({
    source: initial,
    drafts: { question: 'Original owner intent' },
  });
  expect(transport.requests).toHaveLength(0);
});

it('keeps a confirmed successor and own Undo across two mounted views with distinct stable read objects', async () => {
  const { wrapper } = scope();
  const transport = decisionTransport();
  const props = { client: transport.client, tripId: 7, decisionId: 8 };
  const otherRead = structuredClone(initial);
  const first = renderHook(() => useDecisionEditor(initial, props), { wrapper });
  const second = renderHook(() => useDecisionEditor(otherRead, props), { wrapper });
  await act(async () => {
    expect(await first.result.current.editor.commit(command, 'Edit')).toBe(true);
  });
  first.rerender();
  second.rerender();
  expect(first.result.current.state).toMatchObject({
    source: { decision: { revision: 1, question: 'Confirmed question' } },
    undoCount: 1,
  });
  expect(second.result.current.state).toBe(first.result.current.state);
  first.unmount();
  await act(async () => {
    expect(await second.result.current.editor.undo()).toBe(true);
  });
  expect(second.result.current.state).toMatchObject({
    source: { decision: { revision: 2, question: 'Which departure?' } },
    undoCount: 0,
  });
});
