import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { deferredRouteResponse, routeJson } from '../route/test-utils';
import { createClient } from '../trips-api/client';
import { ResponsibilitySessions } from './ResponsibilitySessions';
import { labels } from './test-utils';
import { useResponsibility } from './use-responsibility';

import type { ReactNode } from 'react';

import type { ArrangementResponsibility } from './types';

const source: ArrangementResponsibility = {
  tripId: 7,
  targetKind: 'rental',
  targetId: 61,
  responsibility: null,
  revision: 4,
};
function transport(read: () => Response | Promise<Response>) {
  const requests: Request[] = [];
  return {
    requests,
    client: createClient({
      baseUrl: 'http://responsibility.test',
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return read();
      },
    }),
  };
}
afterEach(cleanup);

describe('responsibility context ownership', () => {
  it('never presents cached assignment A while a same-origin distinct client B is still loading', async () => {
    const a = transport(() => routeJson(source));
    const pending = deferredRouteResponse();
    const b = transport(() => pending.promise);
    let identity = {
      tripId: 7,
      client: a.client,
      labels,
    };
    const scope = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = renderHook(() => useResponsibility(identity, source), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={scope}>
          <ResponsibilitySessions identity={identity}>{children}</ResponsibilitySessions>
        </QueryClientProvider>
      ),
    });
    await waitFor(() => expect(view.result.current.query.data).toEqual(source));
    identity = { ...identity, client: b.client };
    view.rerender();
    expect(view.result.current.query.data).toBeUndefined();
    await act(async () => {
      pending.resolve(routeJson({ ...source, responsibility: { kind: 'self' }, revision: 9 }));
    });
    await waitFor(() => expect(view.result.current.query.data?.revision).toBe(9));
  });

  it.each([
    { ...source, tripId: 8 },
    { ...source, targetKind: 'stay' },
    { ...source, targetId: 62 },
  ])('rejects foreign GET assignment %j before caching or offering a write', async (foreign) => {
    const owner = transport(() => routeJson(foreign));
    const identity = {
      tripId: 7,
      client: owner.client,
      labels,
    };
    const scope = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = renderHook(() => useResponsibility(identity, source), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={scope}>
          <ResponsibilitySessions identity={identity}>{children}</ResponsibilitySessions>
        </QueryClientProvider>
      ),
    });
    await waitFor(() => expect(view.result.current.query.isError).toBe(true));
    expect(view.result.current.query.data).toBeUndefined();
    expect(owner.requests.every((request) => request.method === 'GET')).toBe(true);
  });

  it('does not dispatch a field GET under a different provider owner context', async () => {
    const a = transport(() => routeJson(source));
    const b = transport(() => routeJson({ ...source, tripId: 8 }));
    const provider = {
      tripId: 7,
      client: a.client,
      labels,
    };
    const field = { ...provider, tripId: 8, client: b.client };
    const scope = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = renderHook(() => useResponsibility(field, source), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={scope}>
          <ResponsibilitySessions identity={provider}>{children}</ResponsibilitySessions>
        </QueryClientProvider>
      ),
    });
    await waitFor(() => expect(view.result.current.query.isError).toBe(true));
    expect(a.requests).toHaveLength(0);
    expect(b.requests).toHaveLength(0);
  });
});
