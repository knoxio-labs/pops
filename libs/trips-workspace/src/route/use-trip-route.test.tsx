import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';

import { createClient } from '../trips-api/client';
import { routeSession } from './registry';
import { deferredRouteResponse, routeJson, routeRead, routeResult } from './test-utils';
import { useTripRoute } from './use-trip-route';

import type { ReactNode } from 'react';

import type { RouteIdentity, TripRouteRead } from './types';

function transport() {
  const requests: Request[] = [];
  const writes: (() => Response | Promise<Response>)[] = [];
  let read: TripRouteRead = routeRead();
  let readFailure = false;
  const client = createClient({
    baseUrl: 'http://routes.test',
    fetch: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.method === 'GET') return readFailure ? routeJson({}, 503) : routeJson(read);
      const reply = writes.shift();
      if (!reply) throw new Error('Missing explicit operation response');
      return reply();
    },
  });
  return {
    client,
    writes,
    requests,
    setRead: (next: TripRouteRead) => {
      read = next;
    },
    failReads: (value: boolean) => {
      readFailure = value;
    },
  };
}
function wrapper(scope: QueryClient, strict = false) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const content = <QueryClientProvider client={scope}>{children}</QueryClientProvider>;
    return strict ? <StrictMode>{content}</StrictMode> : content;
  };
}
function writeCount(source: ReturnType<typeof transport>) {
  return source.requests.filter((request) => request.method === 'POST').length;
}

describe('shared route controller view lifetime', () => {
  it('clears failed read state after an explicit successful canonical reload', async () => {
    const scope = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const source = transport();
    source.failReads(true);
    const hook = renderHook(() => useTripRoute({ tripId: 7, client: source.client }), {
      wrapper: wrapper(scope),
    });
    await waitFor(() => expect(hook.result.current.readError).not.toBeNull());
    source.failReads(false);
    await act(async () => {
      await hook.result.current.reload();
    });
    expect(hook.result.current.view?.route.revision).toBe(0);
    expect(hook.result.current.readError).toBeNull();
    hook.unmount();
    scope.clear();
  });
  it('claims synchronously across two StrictMode views, survives one unmount and cache eviction', async () => {
    const scope = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const source = transport();
    const identity = { tripId: 7, client: source.client };
    const first = renderHook(() => useTripRoute(identity), { wrapper: wrapper(scope, true) });
    const second = renderHook(() => useTripRoute(identity), { wrapper: wrapper(scope, true) });
    await waitFor(() => expect(second.result.current.view?.route.revision).toBe(0));
    const originalView = first.result.current;
    const reply = deferredRouteResponse();
    source.writes.push(() => reply.promise);
    let pending: Promise<void> | undefined;
    act(() => {
      pending = first.result.current.run({ kind: 'gap.create', before: null });
    });
    await act(async () => {
      await second.result.current.run({ kind: 'gap.create', before: null });
    });
    expect(writeCount(source)).toBe(1);
    first.unmount();
    expect(second.result.current.pending).toBeDefined();
    const operation = routeSession(scope, identity).session.snapshot().pending;
    if (!operation) throw new Error('Missing original request');
    await act(async () => {
      reply.resolve(routeJson(routeResult(operation, routeRead(), routeRead({ revision: 1 }))));
      await pending;
    });
    expect(second.result.current.receipts).toHaveLength(1);
    await act(async () => {
      await originalView.run({ kind: 'gap.create', before: null });
    });
    expect(writeCount(source)).toBe(1);
    second.unmount();
    scope.clear();
    const reopened = renderHook(() => useTripRoute(identity), { wrapper: wrapper(scope, true) });
    expect(reopened.result.current.receipts).toHaveLength(1);
    await waitFor(() => expect(reopened.result.current.reading).toBe(false));
    expect(reopened.result.current.view?.route.revision).toBe(1);
    expect(reopened.result.current.canUndo).toBe(true);
    reopened.unmount();
    scope.clear();
  });

  it('keeps same-origin distinct clients isolated and restores unknown A after B plus cache eviction', async () => {
    const scope = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const a = transport();
    const b = transport();
    b.setRead(routeRead({ revision: 8, order: [] }));
    const aIdentity = { tripId: 7, client: a.client };
    const bIdentity = { tripId: 7, client: b.client };
    const hook = renderHook(({ identity }: { identity: RouteIdentity }) => useTripRoute(identity), {
      initialProps: { identity: aIdentity },
      wrapper: wrapper(scope),
    });
    await waitFor(() => expect(hook.result.current.view?.route.revision).toBe(0));
    a.writes.push(() => routeJson({ code: 'offline', message: 'Unknown', retryable: true }, 503));
    await act(async () => {
      await hook.result.current.run({ kind: 'path.apply', pathId: 4 });
    });
    const original = hook.result.current.failure?.operation;
    const staleA = hook.result.current;
    hook.rerender({ identity: bIdentity });
    await waitFor(() => expect(hook.result.current.view?.route.revision).toBe(8));
    expect(hook.result.current.failure).toBeUndefined();
    expect(routeSession(scope, aIdentity).queryKey).not.toEqual(
      routeSession(scope, bIdentity).queryKey
    );
    hook.rerender({ identity: aIdentity });
    await waitFor(() => expect(hook.result.current.failure?.operation).toBe(original));
    await act(async () => {
      await staleA.retry();
    });
    expect(writeCount(a)).toBe(1);
    hook.unmount();
    scope.clear();
    const reopened = renderHook(() => useTripRoute(aIdentity), { wrapper: wrapper(scope) });
    expect(reopened.result.current.failure?.operation).toBe(original);
    await act(async () => {
      await reopened.result.current.run({ kind: 'gap.create', before: null });
    });
    expect(writeCount(a)).toBe(1);
    expect(writeCount(b)).toBe(0);
    if (!original) throw new Error('Missing uncertain operation');
    a.writes.push(() =>
      routeJson({
        ...routeResult(original, routeRead(), routeRead({ revision: 1 })),
        replayed: true,
      })
    );
    await act(async () => {
      await reopened.result.current.retry();
    });
    const posts = a.requests.filter((request) => request.method === 'POST');
    expect(await posts[0]?.json()).toEqual(await posts[1]?.json());
    expect(reopened.result.current.receipts).toHaveLength(1);
    reopened.unmount();
    scope.clear();
  });

  it('keeps late original A proof dormant through mutable origin/trip A→B→A and never seeds B', async () => {
    const scope = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const source = transport();
    const originalIdentity = { tripId: 7, client: source.client };
    const hook = renderHook(({ identity }: { identity: RouteIdentity }) => useTripRoute(identity), {
      initialProps: { identity: originalIdentity },
      wrapper: wrapper(scope),
    });
    await waitFor(() => expect(hook.result.current.view).toBeDefined());
    const reply = deferredRouteResponse();
    source.writes.push(() => reply.promise);
    let write: Promise<void> | undefined;
    act(() => {
      write = hook.result.current.run({ kind: 'path.apply', pathId: 4 });
    });
    const original = routeSession(scope, originalIdentity);
    const operation = original.session.snapshot().pending;
    if (!operation) throw new Error('Missing original claim');
    source.client.setConfig({ baseUrl: 'http://other.test' });
    source.setRead(routeRead({ tripId: 8, revision: 6, order: [] }));
    hook.rerender({ identity: { tripId: 8, client: source.client } });
    await waitFor(() => expect(hook.result.current.view?.route.tripId).toBe(8));
    await act(async () => {
      reply.resolve(routeJson(routeResult(operation, routeRead(), routeRead({ revision: 1 }))));
      await write;
    });
    expect(hook.result.current.receipts).toHaveLength(0);
    expect(hook.result.current.view?.route.revision).toBe(6);
    expect(scope.getQueryData(original.queryKey)).toMatchObject({ revision: 0 });
    expect(original.session.snapshot().receipts).toHaveLength(1);
    await expect(original.session.undo()).rejects.toThrow('captured owner');
    source.client.setConfig({ baseUrl: 'http://routes.test' });
    source.setRead(routeRead({ revision: 1 }));
    hook.rerender({ identity: originalIdentity });
    expect(hook.result.current.receipts).toHaveLength(1);
    await waitFor(() => expect(hook.result.current.view?.route.tripId).toBe(7));
    expect(writeCount(source)).toBe(1);
    hook.unmount();
    scope.clear();
  });

  it('does not POST on mutated origin without rerender and retains unknown request for its original owner', async () => {
    const scope = new QueryClient();
    const source = transport();
    const identity = { tripId: 7, client: source.client };
    const hook = renderHook(() => useTripRoute(identity), { wrapper: wrapper(scope) });
    await waitFor(() => expect(hook.result.current.view).toBeDefined());
    source.writes.push(() => routeJson({}, 503));
    await act(async () => {
      await hook.result.current.run({ kind: 'gap.create', before: null });
    });
    const operation = hook.result.current.failure?.operation;
    source.client.setConfig({ baseUrl: 'http://other.test' });
    await act(async () => {
      await hook.result.current.retry();
    });
    expect(writeCount(source)).toBe(1);
    source.client.setConfig({ baseUrl: 'http://routes.test' });
    expect(hook.result.current.failure?.operation).toBe(operation);
    hook.unmount();
    scope.clear();
  });
});
