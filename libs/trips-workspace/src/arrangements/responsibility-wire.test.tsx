import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { routeJson, routeTransport } from '../route/test-utils';
import { loadResponsibility, replaceResponsibility } from './api';
import { ResponsibilitySessions } from './ResponsibilitySessions';
import { labels } from './test-utils';
import { useResponsibility } from './use-responsibility';

import type { ReactNode } from 'react';

import type { ArrangementResponsibility } from './types';

const source: ArrangementResponsibility = {
  tripId: 7,
  targetKind: 'rental',
  targetId: 61,
  revision: 4,
  responsibility: null,
};
const next = { ...source, responsibility: { kind: 'self' }, revision: 5 } as const;
afterEach(cleanup);

describe('Responsibility wire proof', () => {
  it('preserves its last good assignment when a later GET has an invalid canonical body', async () => {
    const transport = routeTransport();
    const identity = { tripId: 7, client: transport.client, labels };
    transport.replies.push(
      () => routeJson(source),
      () => routeJson({ ...next, unknown: true })
    );
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = renderHook(() => useResponsibility(identity, source), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={cache}>
          <ResponsibilitySessions identity={identity}>{children}</ResponsibilitySessions>
        </QueryClientProvider>
      ),
    });
    await waitFor(() => expect(view.result.current.query.isSuccess).toBe(true));
    await act(async () => {
      await view.result.current.reload();
    });
    await waitFor(() => expect(view.result.current.query.isError).toBe(true));
    expect(view.result.current.query.data).toEqual(source);
    expect(transport.requests.map((request) => request.method)).toEqual(['GET', 'GET']);
  });
  it.each([201, 202])(
    'rejects unexpected successful HTTP %i for reads and writes',
    async (status) => {
      const transport = routeTransport();
      const identity = { tripId: 7, client: transport.client };
      transport.replies.push(
        () => routeJson(source, status),
        () => routeJson(next, status)
      );
      await expect(loadResponsibility(identity, source)).rejects.toThrow();
      await expect(replaceResponsibility(identity, source, { kind: 'self' })).rejects.toThrow();
    }
  );
  it.each([
    { ...next, revision: 1.5 },
    { ...next, targetKind: 'visit' },
    { ...next, responsibility: { kind: 'contact' } },
    { ...next, unknown: true },
  ])(
    'retains an invalid 200 as unknown and retries the exact original PUT: %j',
    async (invalid) => {
      const transport = routeTransport();
      const identity = { tripId: 7, client: transport.client, labels };
      transport.replies.push(
        () => routeJson(source),
        () => routeJson(invalid),
        () => routeJson(next)
      );
      const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const view = renderHook(() => useResponsibility(identity, source), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={cache}>
            <ResponsibilitySessions identity={identity}>{children}</ResponsibilitySessions>
          </QueryClientProvider>
        ),
      });
      await waitFor(() => expect(view.result.current.query.isSuccess).toBe(true));
      await act(async () => {
        await view.result.current.save(source, { kind: 'self' });
      });
      expect(view.result.current.failure?.write).toEqual({ source, value: { kind: 'self' } });
      expect(view.result.current.query.data).toEqual(source);
      await act(async () => {
        await view.result.current.retry();
      });
      const writes = transport.requests.filter((request) => request.method === 'PUT');
      expect(writes).toHaveLength(2);
      expect(await writes[1]?.json()).toEqual(await writes[0]?.json());
      expect(view.result.current.failure).toBeUndefined();
      expect(view.result.current.query.data).toEqual(next);
    }
  );
});
