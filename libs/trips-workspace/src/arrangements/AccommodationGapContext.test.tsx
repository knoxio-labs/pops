import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { sourceStay, sourceVisits } from '../stay/test-utils';
import { createClient } from '../trips-api/client';
import { client as defaultClient } from '../trips-api/client.gen';
import { AccommodationGapContext, AccommodationGapProvider } from './AccommodationGapContext';
import { arrangementsTransport, labels } from './test-utils';

import type { ReactNode } from 'react';

import type { AccommodationGapIdentity, AccommodationGapStay } from './accommodation-gap-types';

afterEach(cleanup);
function setup() {
  const transport = arrangementsTransport();
  transport.collections.set('/trips/7/stays', { stays: [] });
  transport.collections.set('/trips/7/events', { events: [] });
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const open = vi.fn<(source: AccommodationGapStay) => void>();
  return { ...transport, cache, open };
}
function Host({
  identity,
  cache,
  open,
  children,
}: {
  identity: AccommodationGapIdentity;
  cache: QueryClient;
  open: (source: AccommodationGapStay) => void;
  children?: ReactNode;
}) {
  return (
    <StrictMode>
      <QueryClientProvider client={cache}>
        <AccommodationGapProvider identity={identity}>
          <AccommodationGapContext
            identity={identity}
            visitId={31}
            labels={labels}
            formatDate={String}
            onOpenStay={open}
          />
          {children}
        </AccommodationGapProvider>
      </QueryClientProvider>
    </StrictMode>
  );
}
async function add() {
  fireEvent.click(await screen.findByRole('button', { name: /Add stay/ }));
}
describe('canonical accommodation context', () => {
  it.each(['Agreed', 'Reserved', 'Purchased'] as const)(
    'uses the shared %s coverage policy',
    async (status) => {
      const scope = setup();
      scope.collections.set('/trips/7/stays', {
        stays: [sourceStay({ status, timing: sourceVisits[0]!.timing })],
      });
      render(<Host {...scope} identity={{ tripId: 7, client: scope.client }} />);
      await waitFor(() =>
        expect(screen.queryByText(labels.unknownCoverage)).not.toBeInTheDocument()
      );
      expect(screen.queryByRole('button', { name: /Add stay/ })).not.toBeInTheDocument();
      expect(scope.writes).toEqual([]);
    }
  );
  it('creates only the exact uncovered interval and opens the actual returned Stay ID', async () => {
    const scope = setup();
    scope.collections.set('/trips/7/stays', {
      stays: [
        sourceStay({ timing: { arrival: '2029-05-01', departure: '2029-05-04' } }),
        sourceStay({
          id: 14,
          status: 'Considering',
          timing: { arrival: '2029-05-04', departure: '2029-05-09' },
        }),
      ],
    });
    scope.replies.push({ status: 201, body: sourceStay({ id: 77 }) });
    render(<Host {...scope} identity={{ tripId: 7, client: scope.client }} />);
    await add();
    await waitFor(() =>
      expect(scope.open).toHaveBeenCalledExactlyOnceWith({ tripId: 7, visitId: 31, stayId: 77 })
    );
    expect(scope.writes).toEqual([
      {
        path: '/trips/7/stays',
        method: 'POST',
        body: { visitId: 31, timing: { arrival: '2029-05-04', departure: '2029-05-09' } },
      },
    ]);
  });
  it('retains unknown creation after provider remount/cache eviction and never claims an identical foreign Stay', async () => {
    const scope = setup();
    const identity = { tripId: 7, client: scope.client };
    scope.replies.push({ status: 503, body: { code: 'lost', message: 'Lost', retryable: true } });
    const first = render(<Host {...scope} identity={identity} />);
    await add();
    await screen.findByText(labels.creationUncertain);
    first.unmount();
    scope.cache.clear();
    scope.collections.set('/trips/7/stays', {
      stays: [sourceStay({ id: 88, status: 'Considering', timing: sourceVisits[0]!.timing })],
    });
    render(<Host {...scope} identity={identity} />);
    await screen.findByText(labels.creationUncertain);
    fireEvent.click(screen.getByRole('button', { name: labels.reload }));
    await add();
    expect(scope.writes).toHaveLength(1);
    expect(scope.open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: labels.beginNewStay }));
    expect(scope.writes).toHaveLength(1);
  });
  it.each(['foreign stay', 'foreign visit', 'failed stays'])(
    'does not invent missing nights from %s',
    async (failure) => {
      const scope = setup();
      if (failure === 'foreign stay')
        scope.collections.set('/trips/7/stays', { stays: [sourceStay({ tripId: 8 })] });
      if (failure === 'foreign visit')
        scope.collections.set('/trips/7/visits', { visits: [{ ...sourceVisits[0]!, tripId: 8 }] });
      if (failure === 'failed stays') scope.failures.add('/trips/7/stays');
      render(<Host {...scope} identity={{ tripId: 7, client: scope.client }} />);
      await screen.findByRole('alert');
      expect(screen.queryByRole('button', { name: /Add stay/ })).not.toBeInTheDocument();
      expect(scope.writes).toEqual([]);
    }
  );
  it.each([200, 202, 201])(
    'keeps malformed or non201 status %s creation uncertain',
    async (status) => {
      const scope = setup();
      scope.replies.push({
        status,
        body: status === 201 ? { ...sourceStay(), visitId: 32 } : sourceStay(),
      });
      render(<Host {...scope} identity={{ tripId: 7, client: scope.client }} />);
      await add();
      await screen.findByText(labels.creationUncertain);
      await add();
      expect(scope.writes).toHaveLength(1);
      expect(scope.open).not.toHaveBeenCalled();
    }
  );
  it.each(['owner', 'callback'])(
    'retains a late201 without opening a replaced %s ABA view',
    async (replacement) => {
      const first = setup();
      const second = setup();
      let finish: ((response: Response) => void) | undefined;
      const pending = new Promise<Response>((resolve) => {
        finish = resolve;
      });
      const original = first.client.getConfig().fetch;
      if (!original) throw new Error('Missing test fetch');
      const client = createClient({
        baseUrl: 'http://arrangements.test',
        fetch: async (input, init) => {
          const request = new Request(input, init);
          if (request.method === 'POST') {
            first.writes.push({
              path: new URL(request.url).pathname,
              method: 'POST',
              body: await request.json(),
            });
            return pending;
          }
          return original(request);
        },
      });
      const view = render(<Host {...first} identity={{ tripId: 7, client }} />);
      await add();
      await waitFor(() => expect(first.writes).toHaveLength(1));
      view.rerender(
        <Host
          {...first}
          identity={{ tripId: 7, client: replacement === 'owner' ? second.client : client }}
          open={replacement === 'owner' ? first.open : vi.fn()}
        />
      );
      await screen.findByRole('button', { name: /Add stay/ });
      view.rerender(<Host {...first} identity={{ tripId: 7, client }} />);
      await act(async () => {
        finish?.(
          new Response(JSON.stringify(sourceStay({ id: 77 })), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          })
        );
      });
      expect(first.open).not.toHaveBeenCalled();
      await add();
      expect(first.open).toHaveBeenCalledExactlyOnceWith({ tripId: 7, visitId: 31, stayId: 77 });
      expect(first.writes).toHaveLength(1);
      expect(second.writes).toHaveLength(0);
    }
  );
  it('fences the actual mutable default client before POST without rebinding cached reads', async () => {
    const scope = setup();
    const original = defaultClient.getConfig();
    defaultClient.setConfig({
      baseUrl: 'http://arrangements.test',
      fetch: scope.client.getConfig().fetch,
    });
    try {
      const view = render(<Host {...scope} identity={{ tripId: 7 }} />);
      const button = await screen.findByRole('button', { name: /Add stay/ });
      const count = scope.requests.length;
      defaultClient.setConfig({ baseUrl: 'http://different.test' });
      fireEvent.click(button);
      view.rerender(<Host {...scope} identity={{ tripId: 7 }} />);
      await act(async () => {});
      expect(scope.requests).toHaveLength(count);
      expect(scope.writes).toHaveLength(0);
      defaultClient.setConfig({ baseUrl: 'http://arrangements.test' });
      scope.replies.push({ status: 201, body: sourceStay({ id: 77 }) });
      view.rerender(<Host {...scope} identity={{ tripId: 7 }} />);
      await add();
      await waitFor(() =>
        expect(scope.open).toHaveBeenCalledExactlyOnceWith({ tripId: 7, visitId: 31, stayId: 77 })
      );
    } finally {
      cleanup();
      defaultClient.setConfig(original);
    }
  });
  it('ends retention at the actual QueryClient boundary even inside an older provider', async () => {
    const scope = setup();
    const identity = { tripId: 7, client: scope.client };
    scope.replies.push({ status: 503, body: { code: 'lost', message: 'Lost', retryable: true } });
    const first = render(<Host {...scope} identity={identity} />);
    await add();
    await screen.findByText(labels.creationUncertain);
    first.unmount();
    const nextCache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    scope.replies.push({ status: 201, body: sourceStay({ id: 99 }) });
    render(
      <QueryClientProvider client={scope.cache}>
        <AccommodationGapProvider identity={identity}>
          <QueryClientProvider client={nextCache}>
            <AccommodationGapContext
              identity={identity}
              visitId={31}
              labels={labels}
              formatDate={String}
              onOpenStay={scope.open}
            />
          </QueryClientProvider>
        </AccommodationGapProvider>
      </QueryClientProvider>
    );
    await add();
    await waitFor(() =>
      expect(scope.open).toHaveBeenCalledExactlyOnceWith({ tripId: 7, visitId: 31, stayId: 99 })
    );
    expect(scope.writes).toHaveLength(2);
  });
  it('isolates same-origin clients and keeps another mounted view active after one closes', async () => {
    const scope = setup();
    const identity = { tripId: 7, client: scope.client };
    const first = render(<Host {...scope} identity={identity} />);
    const second = render(<Host {...scope} identity={identity} />);
    first.unmount();
    scope.replies.push({ status: 201, body: sourceStay({ id: 77 }) });
    await add();
    await waitFor(() => expect(scope.open).toHaveBeenCalledOnce());
    second.unmount();
    const other = setup();
    other.replies.push({ status: 201, body: sourceStay({ id: 99 }) });
    render(<Host {...other} cache={scope.cache} identity={{ tripId: 7, client: other.client }} />);
    await add();
    await waitFor(() =>
      expect(other.open).toHaveBeenCalledExactlyOnceWith({ tripId: 7, visitId: 31, stayId: 99 })
    );
    expect(other.writes).toHaveLength(1);
  });
});
