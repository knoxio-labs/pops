import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { captureSource } from '../capture/test-utils';
import { TripOverview } from '../index';
import { sourceJourney } from '../journey/test-utils';
import { routeRead } from '../route/test-utils';
import { sourceStay, sourceVisits } from '../stay/test-utils';
import { createClient } from '../trips-api/client';
import { overviewProps, overviewResponses } from './test-utils';

import type { TripOverviewProps } from './types';

const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  caches.splice(0).forEach((cache) => cache.clear());
});
function responses() {
  const data = overviewResponses();
  data.set('/trips/7/meeting-plans', { meetingPlans: [] });
  data.set('/trips/7/capture-workspace', captureSource());
  data.set('/trips/7/rentals', { rentals: [] });
  data.set('/trips/7/route', routeRead());
  return data;
}
function mount(data = responses(), renderVisitContext?: TripOverviewProps['renderVisitContext']) {
  const requests: Request[] = [];
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  const client = createClient({
    baseUrl: 'http://visit-context.test',
    fetch: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      const path = new URL(request.url).pathname;
      return Response.json(
        data.get(path) ?? {
          code: 'trips.source.unavailable',
          message: 'Unavailable',
          retryable: true,
        },
        { status: data.has(path) ? 200 : 503 }
      );
    },
  });
  return {
    cache,
    requests,
    ...render(
      <QueryClientProvider client={cache}>
        <TripOverview
          {...overviewProps}
          client={client}
          calendar={undefined}
          renderVisitContext={renderVisitContext}
        />
      </QueryClientProvider>
    ),
  };
}
function context({ tripId, visitId }: { tripId: number; visitId: number }) {
  return <aside aria-label={`Host Visit ${tripId}:${visitId}`}>Host context</aside>;
}

it('renders exact resolved root, alternative and unplaced Visits after their facts despite cross-kind ID collisions', async () => {
  const first = sourceVisits[0];
  if (!first) throw new Error('Missing Visit fixture');
  const data = responses();
  data.set('/trips/7/visits', {
    visits: [first, { ...first, id: 32 }, { ...first, id: 33 }, { ...first, id: 34, tripId: 8 }],
  });
  data.set('/trips/7/journeys', { journeys: [sourceJourney({ id: 31 })] });
  data.set('/trips/7/journeys/31/legs', { legs: [] });
  data.set('/trips/7/stays', { stays: [sourceStay({ id: 31, name: 'Existing stay fact' })] });
  data.set(
    '/trips/7/route',
    routeRead({
      order: [
        { kind: 'journey', id: 31 },
        { kind: 'visit', id: 31 },
        { kind: 'gap', id: 31 },
        { kind: 'visit', id: 999 },
        { kind: 'visit', id: 998 },
        { kind: 'visit', id: 34 },
      ],
      paths: [
        {
          id: 31,
          title: 'Active alternative',
          gapId: 31,
          state: 'alternative',
          members: [{ kind: 'visit', id: 32 }],
        },
        {
          id: 92,
          title: 'Applied history',
          gapId: 31,
          state: 'applied',
          members: [{ kind: 'visit', id: 31 }],
        },
      ],
      missingSources: [{ kind: 'visit', id: 999 }],
    })
  );
  const renderContext = vi.fn(context);
  const host = mount(data, renderContext);
  const root = await screen.findByRole('list', { name: 'Route' });
  await screen.findByRole('complementary', { name: 'Host Visit 7:33' });
  await waitFor(() => expect(host.cache.isFetching()).toBe(0));
  expect(screen.getAllByRole('complementary', { name: /Host Visit/ })).toHaveLength(3);
  expect(within(root).getByRole('complementary', { name: 'Host Visit 7:31' })).toBeVisible();
  expect(
    within(screen.getByRole('region', { name: 'Active alternative' })).getByRole('complementary', {
      name: 'Host Visit 7:32',
    })
  ).toBeVisible();
  expect(
    within(screen.getByRole('region', { name: 'unplaced' })).getByRole('complementary', {
      name: 'Host Visit 7:33',
    })
  ).toBeVisible();
  expect(
    within(screen.getByRole('region', { name: 'Applied history' })).queryByRole('complementary')
  ).not.toBeInTheDocument();
  expect(new Set(renderContext.mock.calls.map(([identity]) => JSON.stringify(identity)))).toEqual(
    new Set([31, 32, 33].map((visitId) => JSON.stringify({ tripId: 7, visitId })))
  );
  const fact = screen.getByText('Existing stay fact');
  const slot = within(root).getByRole('complementary', { name: 'Host Visit 7:31' });
  expect(fact.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  expect(host.requests.every((request) => request.method === 'GET')).toBe(true);
});

it('keeps an actual owning Visit usable when optional route placement is unavailable', async () => {
  const data = responses();
  data.delete('/trips/7/route');
  const host = mount(data, context);
  expect(await screen.findByRole('complementary', { name: 'Host Visit 7:31' })).toBeVisible();
  await waitFor(() => expect(host.cache.isFetching()).toBe(0));
  expect(screen.getByRole('region', { name: 'Unresolved' })).toContainElement(
    screen.getByRole('complementary', { name: 'Host Visit 7:31' })
  );
  expect(host.requests.some((request) => new URL(request.url).pathname === '/trips/7/route')).toBe(
    true
  );
  expect(host.requests.every((request) => request.method === 'GET')).toBe(true);
});

it.each(['missing', 'foreign', 'unavailable'] as const)(
  'does not supply a %s Visit to the host',
  async (state) => {
    const data = responses();
    if (state === 'missing')
      data.set('/trips/7/route', routeRead({ missingSources: [{ kind: 'visit', id: 31 }] }));
    if (state === 'foreign')
      data.set('/trips/7/visits', {
        visits: sourceVisits.map((visit) => ({ ...visit, tripId: 8 })),
      });
    if (state === 'unavailable') data.delete('/trips/7/visits');
    const renderContext = vi.fn(context);
    const host = mount(data, renderContext);
    await screen.findByRole('list', { name: 'Route' });
    await waitFor(() => expect(host.cache.isFetching()).toBe(0));
    expect(
      screen.getByRole('list', { name: 'Route' }).querySelector('[data-route-id="31"]')
    ).toHaveAttribute('data-route-state', state === 'missing' ? 'missing' : 'unavailable');
    expect(renderContext).not.toHaveBeenCalled();
    expect(screen.queryByRole('complementary', { name: /Host Visit/ })).not.toBeInTheDocument();
  }
);

it('preserves the absent callback rendering and issues no additional owner requests', async () => {
  const withContext = mount(responses(), context);
  await screen.findByRole('complementary', { name: 'Host Visit 7:31' });
  await waitFor(() => expect(withContext.cache.isFetching()).toBe(0));
  const requests = withContext.requests
    .map((request) => [request.method, new URL(request.url).pathname])
    .toSorted();
  withContext.unmount();
  const absent = mount();
  expect(await screen.findByText('Cedar guesthouse')).toBeVisible();
  await waitFor(() => expect(absent.cache.isFetching()).toBe(0));
  expect(screen.queryByRole('complementary', { name: /Host Visit/ })).not.toBeInTheDocument();
  expect(
    absent.requests.map((request) => [request.method, new URL(request.url).pathname]).toSorted()
  ).toEqual(requests);
  expect(absent.requests.every((request) => request.method === 'GET')).toBe(true);
});
