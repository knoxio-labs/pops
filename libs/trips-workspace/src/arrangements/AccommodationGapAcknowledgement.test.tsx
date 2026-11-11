import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { AccommodationGapContext, AccommodationGapProvider } from '../index';
import { loadStays } from '../stay/api';
import { sourceStay } from '../stay/test-utils';
import { createClient } from '../trips-api/client';
import { arrangementsTransport, labels } from './test-utils';
import { useGapCapture } from './use-gap-capture';

import type { ReactNode } from 'react';

import type { Stay } from '../stay/types';

it.each([false, true])(
  'settles a closed-view 201 with another active view=%s without stale callbacks or wrong-owner fetches',
  async (anotherView) => {
    const transport = arrangementsTransport();
    transport.collections.set('/trips/7/stays', { stays: [] });
    transport.collections.set('/trips/7/events', { events: [] });
    const original = transport.client.getConfig().fetch;
    if (!original) throw new Error('Missing generated transport');
    let finish: (response: Response) => void = () => {
      throw new Error('No pending response');
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
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const identity = { tripId: 7, client };
    const open = vi.fn();
    const canonicalKey = ['trips', 'http://arrangements.test', 7, 'stays'];
    cache.setQueryData(canonicalKey, []);
    const observer = new QueryObserver(cache, {
      queryKey: canonicalKey,
      queryFn: () => loadStays(7, client),
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => {});
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={cache}>
        <AccommodationGapProvider identity={identity}>{children}</AccommodationGapProvider>
      </QueryClientProvider>
    );
    try {
      const view = render(
        <QueryClientProvider client={cache}>
          <AccommodationGapProvider identity={identity}>
            <AccommodationGapContext
              identity={identity}
              visitId={31}
              labels={labels}
              formatDate={String}
              onOpenStay={open}
            />
          </AccommodationGapProvider>
        </QueryClientProvider>
      );
      fireEvent.click(await screen.findByRole('button', { name: /Add stay/ }));
      await waitFor(() => expect(posts).toBe(1));
      const captured = cache
        .getQueriesData<Stay[]>({ queryKey: canonicalKey })
        .find(([key]) => key.length === 6 && key[4] === 'accommodation');
      if (!captured) throw new Error('Missing original scoped Stay query');
      expect(captured[1]).toEqual([]);
      const otherOpen = vi.fn();
      const otherView = anotherView
        ? render(
            <AccommodationGapContext
              identity={identity}
              visitId={31}
              labels={labels}
              formatDate={String}
              onOpenStay={otherOpen}
            />,
            { wrapper }
          )
        : undefined;
      view.unmount();
      client.setConfig({ baseUrl: 'http://other-owner.test' });
      const created = sourceStay({ id: 77 });
      await act(async () => {
        finish(Response.json(created, { status: 201 }));
      });
      expect(open).not.toHaveBeenCalled();
      expect(otherOpen).not.toHaveBeenCalled();
      expect(posts).toBe(1);
      expect(cache.getQueryData(captured[0])).toEqual([created]);
      expect(cache.getQueryState(canonicalKey)?.isInvalidated).toBe(true);
      expect(cache.getQueriesData({ queryKey: ['trips', 'http://other-owner.test'] })).toEqual([]);
      expect(
        transport.requests.some(
          (request) => new URL(request.url).origin === 'http://other-owner.test'
        )
      ).toBe(false);
      otherView?.unmount();
      client.setConfig({ baseUrl: 'http://arrangements.test' });
      transport.failures.add('/trips/7/stays');
      render(
        <AccommodationGapContext
          identity={identity}
          visitId={31}
          labels={labels}
          formatDate={String}
          onOpenStay={otherOpen}
        />,
        { wrapper }
      );
      await screen.findByRole('alert');
      expect(cache.getQueryData(captured[0])).toEqual([created]);
      const reopened = renderHook(() => useGapCapture(identity, otherOpen), { wrapper });
      await act(() =>
        reopened.result.current.create(31, {
          kind: 'missing',
          arrival: '2029-05-01',
          departure: '2029-05-09',
          stayIds: [],
        })
      );
      expect(otherOpen).toHaveBeenCalledExactlyOnceWith({ targetKind: 'stay', targetId: 77 });
      expect(posts).toBe(1);
      expect(reopened.result.current.uncertain).toBe(false);
    } finally {
      cleanup();
      unsubscribe();
      cache.clear();
    }
  }
);
