import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { sourceStay } from '../stay/test-utils';
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
