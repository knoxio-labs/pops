import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { sourceEvent } from '../event/test-utils';
import { AccommodationGapContext, AccommodationGapProvider } from '../index';
import { sourceStay } from '../stay/test-utils';
import { createClient } from '../trips-api/client';
import { arrangementsTransport, labels } from './test-utils';

afterEach(cleanup);
it.each(['failed', 'late'])(
  'keeps proven accommodation dates invariant with %s Events',
  async (eventsState) => {
    const transport = arrangementsTransport();
    transport.collections.set('/trips/7/stays', { stays: [] });
    if (eventsState === 'failed') transport.failures.add('/trips/7/events');
    const original = transport.client.getConfig().fetch;
    if (!original) throw new Error('Missing generated transport');
    let finish: (response: Response) => void = () => {
      throw new Error('No pending Events');
    };
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const client = createClient({
      baseUrl: 'http://arrangements.test',
      fetch: async (input, init) => {
        const request = new Request(input, init);
        if (eventsState === 'late' && new URL(request.url).pathname.endsWith('/events'))
          return (await pending).clone();
        return original(request);
      },
    });
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const identity = { tripId: 7, client };
    const open = vi.fn();
    try {
      render(
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
      await screen.findByRole('button', { name: /Add stay/ });
      expect(screen.getByText('2029-05-01')).toBeInTheDocument();
      expect(screen.getByText('2029-05-09')).toBeInTheDocument();
      if (eventsState === 'late') {
        await act(async () => {
          finish(
            Response.json({
              events: [
                sourceEvent({ timing: { start: '2029-05-05', end: '2029-05-06' } }),
                sourceEvent({ id: 20, timing: {} }),
              ],
            })
          );
        });
        await waitFor(() => expect(cache.isFetching()).toBe(0));
      } else await screen.findByRole('alert');
      transport.replies.push({
        status: 201,
        body: sourceStay({ id: 77, timing: { arrival: '2029-05-01', departure: '2029-05-09' } }),
      });
      fireEvent.click(screen.getByRole('button', { name: /Add stay/ }));
      await waitFor(() =>
        expect(open).toHaveBeenCalledExactlyOnceWith({ tripId: 7, visitId: 31, stayId: 77 })
      );
      expect(transport.writes).toEqual([
        {
          path: '/trips/7/stays',
          method: 'POST',
          body: { visitId: 31, timing: { arrival: '2029-05-01', departure: '2029-05-09' } },
        },
      ]);
    } finally {
      cleanup();
      cache.clear();
    }
  }
);
