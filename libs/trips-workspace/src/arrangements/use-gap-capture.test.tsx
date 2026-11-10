import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { sourceStay } from '../stay/test-utils';
import { createClient } from '../trips-api/client';
import { GapCaptureSessions } from './GapCaptureSessions';
import { arrangementsTransport, labels } from './test-utils';
import { useGapCapture } from './use-gap-capture';

import type { ReactNode } from 'react';

import type { ArrangementCoverageFinding } from './coverage';
import type { ArrangementTarget } from './types';

afterEach(cleanup);
const gap: ArrangementCoverageFinding = {
  kind: 'missing',
  arrival: '2030-04-10',
  departure: '2030-04-16',
  stayIds: [],
};
function setup() {
  const transport = arrangementsTransport();
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const open = vi.fn<(target: ArrangementTarget) => void>();
  const identity = {
    tripId: 7,
    client: transport.client,
    labels,
    formatDate: (date: string): string => date,
  };
  const { result } = renderHook(() => useGapCapture(identity, open), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    ),
  });
  return { transport, cache, open, result };
}
describe('Gap Stay source capture identity', () => {
  it('keeps reload busy/error state with its current source owner when an older read settles', async () => {
    const first = arrangementsTransport();
    const second = arrangementsTransport();
    const fetchOriginal = first.client.getConfig().fetch;
    if (!fetchOriginal) throw new Error('Expected the source transport');
    first.failures.add('/trips/7/stays');
    let finish: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const firstClient = createClient({
      baseUrl: 'http://arrangements.test',
      fetch: async (input, init) => {
        const request = new Request(input, init);
        await gate;
        return fetchOriginal(request);
      },
    });
    let identity = {
      tripId: 7,
      client: firstClient,
      labels,
      formatDate: (date: string): string => date,
    };
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(() => useGapCapture(identity, vi.fn()), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={cache}>
          <GapCaptureSessions identity={identity}>{children}</GapCaptureSessions>
        </QueryClientProvider>
      ),
    });
    let reading: Promise<void> | undefined;
    act(() => {
      reading = result.current.reload();
    });
    expect(result.current.busy).toBe(true);
    identity = { ...identity, client: second.client };
    rerender();
    expect(result.current.busy).toBe(false);
    await act(async () => {
      await result.current.reload();
    });
    await act(async () => {
      finish?.();
      await reading;
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.failure).toBeUndefined();
    expect(first.writes).toEqual([]);
    expect(second.writes).toEqual([]);
  });
  it('keeps old unknown outcomes dormant and rejects stale create/reset/reload callbacks in another owner context', async () => {
    const first = arrangementsTransport();
    const second = arrangementsTransport();
    first.replies.push({
      status: 503,
      body: { code: 'trips.creation.unknown', message: 'Response lost', retryable: true },
    });
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let identity = {
      tripId: 7,
      client: first.client,
      labels,
      formatDate: (date: string): string => date,
    };
    const open = vi.fn();
    const { result, rerender } = renderHook(() => useGapCapture(identity, open), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={cache}>
          <GapCaptureSessions identity={identity}>{children}</GapCaptureSessions>
        </QueryClientProvider>
      ),
    });
    await act(async () => {
      await result.current.create(31, gap);
    });
    const original = result.current;
    first.client.setConfig({ baseUrl: 'https://other-trips.example' });
    act(() => original.beginNew());
    await act(async () => {
      await original.create(32, gap);
      await original.reload();
    });
    expect(first.requests).toHaveLength(1);
    first.client.setConfig({ baseUrl: 'http://arrangements.test' });
    identity = { ...identity, client: second.client };
    rerender();
    expect(result.current.uncertain).toBe(false);
    act(() => original.beginNew());
    await act(async () => {
      await original.create(32, gap);
      await original.reload();
    });
    expect(first.requests).toHaveLength(1);
    expect(second.requests).toEqual([]);
    identity = { ...identity, client: first.client };
    rerender();
    expect(result.current.uncertain).toBe(true);
    await act(async () => {
      await result.current.create(31, gap);
    });
    expect(first.writes).toHaveLength(1);
    expect(open).not.toHaveBeenCalled();
  });
  it('retains a known 201 identity and opens it again without repeating the source creation', async () => {
    const { transport, result, open } = setup();
    transport.replies.push({ status: 201, body: sourceStay({ id: 17 }) });
    await act(async () => {
      await result.current.create(31, gap);
    });
    await act(async () => {
      await result.current.create(31, gap);
    });
    expect(transport.writes).toHaveLength(1);
    expect(open.mock.calls).toEqual([
      [{ targetKind: 'stay', targetId: 17 }],
      [{ targetKind: 'stay', targetId: 17 }],
    ]);
  });
  it('retains each acknowledged intent after another gap creates a different source', async () => {
    const { transport, result, open } = setup();
    transport.replies.push(
      { status: 201, body: sourceStay({ id: 17 }) },
      { status: 201, body: sourceStay({ id: 18 }) }
    );
    await act(async () => {
      await result.current.create(31, gap);
    });
    await act(async () => {
      await result.current.create(32, gap);
    });
    await act(async () => {
      await result.current.create(31, gap);
    });
    expect(transport.writes).toHaveLength(2);
    expect(open.mock.calls).toEqual([
      [{ targetKind: 'stay', targetId: 17 }],
      [{ targetKind: 'stay', targetId: 18 }],
      [{ targetKind: 'stay', targetId: 17 }],
    ]);
  });
  it('keeps uncertainty per selected intent across other captures and resets only the chosen intent', async () => {
    const { transport, result, open } = setup();
    const unknown = {
      status: 503,
      body: { code: 'trips.creation.unknown', message: 'Response lost', retryable: true },
    };
    transport.replies.push(unknown, { status: 201, body: sourceStay({ id: 18 }) }, unknown);
    await act(async () => {
      await result.current.create(31, gap);
    });
    await act(async () => {
      await result.current.create(32, gap);
    });
    expect(open).toHaveBeenCalledExactlyOnceWith({ targetKind: 'stay', targetId: 18 });
    await act(async () => {
      await result.current.create(33, gap);
    });
    await act(async () => {
      await result.current.create(31, gap);
    });
    expect(result.current.uncertain).toBe(true);
    expect(transport.writes).toHaveLength(3);
    act(() => result.current.beginNew());
    expect(transport.writes).toHaveLength(3);
    await act(async () => {
      await result.current.create(33, gap);
    });
    expect(result.current.uncertain).toBe(true);
    expect(transport.writes).toHaveLength(3);
    await act(async () => {
      await result.current.create(32, gap);
    });
    expect(transport.writes).toHaveLength(3);
    expect(open).toHaveBeenLastCalledWith({ targetKind: 'stay', targetId: 18 });
  });
  it.each([17, 88])(
    'never settles a lost response using an empty reload or matching later source %s',
    async (laterId) => {
      const { transport, result, open, cache } = setup();
      transport.replies.push({
        status: 503,
        body: {
          code: 'trips.creation.unknown',
          message: 'Creation response unavailable',
          retryable: true,
        },
      });
      await act(async () => {
        await result.current.create(31, gap);
      });
      transport.collections.set('/trips/7/stays', { stays: [] });
      await act(async () => {
        await result.current.reload();
      });
      await act(async () => {
        await result.current.create(31, gap);
      });
      expect(result.current.uncertain).toBe(true);
      expect(transport.writes).toHaveLength(1);
      const later = sourceStay({
        id: laterId,
        timing: { arrival: gap.arrival, departure: gap.departure },
      });
      transport.collections.set('/trips/7/stays', { stays: [later] });
      await act(async () => {
        await result.current.reload();
      });
      await act(async () => {
        await result.current.create(31, gap);
      });
      expect(cache.getQueryData(['trips', 'http://arrangements.test', 7, 'stays'])).toEqual([
        later,
      ]);
      expect(result.current.uncertain).toBe(true);
      expect(transport.writes).toHaveLength(1);
      expect(open).not.toHaveBeenCalled();
    }
  );
  it('starts no automatic POST when the user explicitly abandons uncertainty and begins a new intent', async () => {
    const { transport, result, open } = setup();
    transport.replies.push(
      {
        status: 503,
        body: {
          code: 'trips.creation.unknown',
          message: 'Creation response unavailable',
          retryable: true,
        },
      },
      { status: 201, body: sourceStay({ id: 19 }) }
    );
    await act(async () => {
      await result.current.create(31, gap);
    });
    act(() => result.current.beginNew());
    expect(result.current.uncertain).toBe(false);
    expect(transport.writes).toHaveLength(1);
    expect(open).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.create(31, gap);
    });
    expect(transport.writes).toHaveLength(2);
    expect(open).toHaveBeenCalledExactlyOnceWith({ targetKind: 'stay', targetId: 19 });
  });
});
