import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { AccommodationGapContext, AccommodationGapProvider } from '../index';
import { sourceStay } from '../stay/test-utils';
import { createClient } from '../trips-api/client';
import { arrangementsTransport, labels } from './test-utils';
import { useGapCapture } from './use-gap-capture';

import type { ReactNode } from 'react';

afterEach(cleanup);
it('retains own creation proof after eviction without manufacturing a complete Stay collection', async () => {
  const transport = arrangementsTransport();
  transport.collections.set('/trips/7/stays', {
    stays: [sourceStay({ id: 88, timing: { arrival: '2029-05-04', departure: '2029-05-09' } })],
  });
  transport.collections.set('/trips/7/events', { events: [] });
  const original = transport.client.getConfig().fetch;
  if (!original) throw new Error('Missing generated transport');
  let finish: (response: Response) => void = () => {
    throw new Error('No pending creation');
  };
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  let posts = 0;
  const client = createClient({
    baseUrl: 'http://arrangements.test',
    fetch: async (input, init) => {
      const request = new Request(input, init);
      if (request.method === 'POST') {
        posts += 1;
        return pending;
      }
      return original(request);
    },
  });
  const cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity, refetchOnMount: false },
    },
  });
  const identity = { tripId: 7, client };
  const open = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cache}>
      <AccommodationGapProvider identity={identity}>{children}</AccommodationGapProvider>
    </QueryClientProvider>
  );
  const element = (
    <AccommodationGapContext
      identity={identity}
      visitId={31}
      labels={labels}
      formatDate={String}
      onOpenStay={open}
    />
  );
  try {
    const view = render(element, { wrapper });
    fireEvent.click(await screen.findByRole('button', { name: /Add stay/ }));
    await waitFor(() => expect(posts).toBe(1));
    const key = cache
      .getQueriesData({
        queryKey: ['trips', 'http://arrangements.test', 7, 'stays', 'accommodation'],
      })
      .find(([candidate]) => candidate.length === 6)?.[0];
    if (!key) throw new Error('Missing original Stay collection');
    view.unmount();
    cache.removeQueries({ queryKey: key, exact: true });
    await act(async () => {
      finish(
        Response.json(
          sourceStay({ id: 77, timing: { arrival: '2029-05-01', departure: '2029-05-04' } }),
          { status: 201 }
        )
      );
    });
    expect(open).not.toHaveBeenCalled();
    expect(cache.getQueryData(key)).toBeUndefined();
    transport.failures.add('/trips/7/stays');
    render(element, { wrapper });
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: /Add stay/ })).not.toBeInTheDocument();
    const reopened = renderHook(() => useGapCapture(identity, open), { wrapper });
    await act(() =>
      reopened.result.current.create(31, {
        kind: 'missing',
        arrival: '2029-05-01',
        departure: '2029-05-04',
        stayIds: [],
      })
    );
    expect(open).toHaveBeenCalledExactlyOnceWith({ targetKind: 'stay', targetId: 77 });
    expect(posts).toBe(1);
    expect(cache.getQueryData(key)).toBeUndefined();
    transport.failures.delete('/trips/7/stays');
    const complete = [
      sourceStay({ id: 77, timing: { arrival: '2029-05-01', departure: '2029-05-04' } }),
      sourceStay({ id: 88, timing: { arrival: '2029-05-04', departure: '2029-05-09' } }),
    ];
    transport.collections.set('/trips/7/stays', { stays: complete });
    fireEvent.click(screen.getByRole('button', { name: labels.reload }));
    await waitFor(() => expect(cache.getQueryData(key)).toEqual(complete));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Add stay/ })).not.toBeInTheDocument();
    expect(posts).toBe(1);
  } finally {
    cleanup();
    cache.clear();
  }
});
