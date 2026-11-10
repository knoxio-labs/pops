import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { stayQueryKey } from './api';
import { sourceStay, workspaceTransport } from './test-utils';
import { useStayEditor } from './use-stay-editor';

import type { PropsWithChildren } from 'react';

import type { TestResponse } from './test-utils';

afterEach(cleanup);

function scope(cache = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return {
    cache,
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    ),
  };
}

function deferred<Value>() {
  let resolve: (value: Value) => void = () => {
    throw new Error('Deferred value is not initialized.');
  };
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('Stay source view retention', () => {
  it('retains unsaved edits through unmount and query-cache eviction', () => {
    const initial = sourceStay();
    const owner = scope();
    const transport = workspaceTransport();
    const identity = { client: transport.client, tripId: 7, stayId: 13 };
    const first = renderHook(() => useStayEditor(initial, identity), owner);
    act(() => first.result.current.edit({ name: 'Uncommitted' }));
    first.unmount();
    owner.cache.clear();
    const reopened = renderHook(() => useStayEditor(initial, identity), owner);
    expect(reopened.result.current.draft.name).toBe('Uncommitted');
    expect(reopened.result.current.dirty).toBe(true);
    expect(transport.patches).toEqual([]);
  });

  it('retains a failed patch and successful own Undo through separate remounts', async () => {
    const original = sourceStay();
    const edited = sourceStay({ name: 'Failed draft' });
    const transport = workspaceTransport({
      patches: [
        { status: 503, body: { code: 'trips.unavailable', message: 'Unavailable' } },
        { status: 200, body: edited },
        { status: 200, body: original },
      ],
    });
    const owner = scope();
    const identity = { client: transport.client, tripId: 7, stayId: 13 };
    const first = renderHook(() => useStayEditor(original, identity), owner);
    await act(async () => {
      await first.result.current.commit({ name: edited.name });
    });
    expect(first.result.current.failure).toBeDefined();
    first.unmount();
    const retry = renderHook(() => useStayEditor(original, identity), owner);
    expect(retry.result.current.draft.name).toBe(edited.name);
    expect(retry.result.current.failure?.patch).toEqual({ name: edited.name });
    await act(async () => {
      await retry.result.current.retry();
    });
    retry.unmount();
    const undo = renderHook(() => useStayEditor(edited, identity), owner);
    expect(undo.result.current.canUndo).toBe(true);
    await act(async () => {
      await undo.result.current.undo();
    });
    expect(transport.patches.slice(0, 2)).toEqual([{ name: edited.name }, { name: edited.name }]);
    expect(transport.patches[2]).toMatchObject({ name: original.name });
    expect(undo.result.current.canUndo).toBe(false);
  });

  it('shares the in-flight lock while closing one view leaves another view usable', async () => {
    const response = deferred<TestResponse>();
    const edited = sourceStay({ name: 'Acknowledged' });
    const transport = workspaceTransport({
      patches: [response.promise, { status: 200, body: edited }],
    });
    const initial = sourceStay();
    const owner = scope();
    const identity = { client: transport.client, tripId: 7, stayId: 13 };
    const first = renderHook(() => useStayEditor(initial, identity), owner);
    const second = renderHook(() => useStayEditor(initial, identity), owner);
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = first.result.current.commit({ name: edited.name });
    });
    const stale = first.result.current;
    first.unmount();
    await act(async () => {
      await second.result.current.commit({ name: 'Duplicate' });
    });
    expect(second.result.current.busy).toBe(true);
    expect(transport.requests).toHaveLength(1);
    await expect(stale.commit({ name: 'Closed' })).rejects.toMatchObject({
      code: 'web.source.view_closed',
    });
    await act(async () => {
      response.resolve({ status: 200, body: edited });
      await pending;
    });
    expect(second.result.current.saved.name).toBe(edited.name);
    await act(async () => {
      await second.result.current.commit({ notes: 'Still open' });
    });
    expect(transport.patches).toHaveLength(2);
  });

  it('rejects a mutable origin without rerender and settles a dispatched response only into captured cache keys', async () => {
    const response = deferred<TestResponse>();
    const edited = sourceStay({ name: 'Owner A result' });
    const transport = workspaceTransport({ patches: [response.promise] });
    const initial = sourceStay();
    const owner = scope();
    const identity = { client: transport.client, tripId: 7, stayId: 13 };
    const originalKey = stayQueryKey(identity);
    const editor = renderHook(() => useStayEditor(initial, identity), owner);
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = editor.result.current.commit({ name: edited.name });
    });
    transport.client.setConfig({ baseUrl: 'https://other.example' });
    const otherKey = stayQueryKey(identity);
    await expect(editor.result.current.commit({ name: 'Wrong origin' })).rejects.toMatchObject({
      code: 'web.source.context_changed',
    });
    await act(async () => {
      response.resolve({ status: 200, body: edited });
      await pending;
    });
    expect(owner.cache.getQueryData(originalKey)).toEqual(edited);
    expect(owner.cache.getQueryData(otherKey)).toBeUndefined();
    expect(transport.requests).toHaveLength(1);
    await expect(
      editor.result.current.commit({ name: 'Wrong after local render' })
    ).rejects.toMatchObject({ code: 'web.source.context_changed' });
    editor.unmount();
    const reopened = renderHook(() => useStayEditor(initial, identity), owner);
    expect(reopened.result.current.draft).toEqual(initial);
  });
});
