import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { journeyKey } from './api';
import { JourneyWorkspace } from './JourneyWorkspace';
import { journeyTransport, sourceJourney, sourceLeg, sourceProblem } from './test-utils';

const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
});
function mount(transport: ReturnType<typeof journeyTransport>) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
  caches.push(cache);
  render(
    <QueryClientProvider client={cache}>
      <JourneyWorkspace tripId={7} journeyId={20} client={transport.client} />
    </QueryClientProvider>
  );
  return cache;
}
const group = {
  id: 80,
  tripId: 7,
  currentJourneyId: 20,
  alternativeJourneyIds: [21],
  revision: 3,
  createdAt: '2029-01-01T00:00:00Z',
  updatedAt: '2029-01-01T00:00:00Z',
};
const writes = (transport: ReturnType<typeof journeyTransport>) =>
  transport.requests.filter((request) => request.method !== 'GET');

describe('Journey persistence boundaries', () => {
  it.each([false, true])(
    'recovers ambiguous creation without another POST; owner reload fails: %s',
    async (ownerReadFails) => {
      const transport = journeyTransport({
        source: { journey: sourceJourney(), legs: [] },
        writes: [{ status: 503, body: sourceProblem('trips.create.unknown') }],
      });
      mount(transport);
      expect(await screen.findByText('No transport legs recorded')).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'Add transport' }));
      expect(await screen.findByText('trips.create.unknown')).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Discard unsaved changes' })).toBeNull();
      transport.setSource({
        journey: sourceJourney(),
        legs: [sourceLeg({ id: 99, mode: 'Created before response failed' })],
      });
      if (ownerReadFails) transport.failSource(503);
      fireEvent.click(screen.getByRole('button', { name: 'Reload journey' }));
      if (ownerReadFails) {
        expect(await screen.findByText('trips.source.invalid')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Add transport' })).toBeDisabled();
        expect(writes(transport)).toHaveLength(1);
        return;
      }
      expect(await screen.findByLabelText('Transport mode')).toHaveValue(
        'Created before response failed'
      );
      expect(writes(transport)).toHaveLength(1);
      expect(writes(transport)[0]?.method).toBe('POST');
      expect(screen.queryByText('trips.create.unknown')).toBeNull();
    }
  );
  it('shows the independent option source title and counts only explicit Purchased legs', async () => {
    const alternative = {
      journey: sourceJourney({ id: 21, name: 'Independent night option' }),
      legs: [
        sourceLeg({ id: 41, journeyId: 21, purchase: 'Purchased' }),
        sourceLeg({ id: 42, journeyId: 21, arrangement: 'Booked', purchase: null }),
      ],
    };
    const transport = journeyTransport({ groups: [group], alternatives: [alternative] });
    mount(transport);
    const option = await screen.findByRole('article', { name: 'Journey option 21' });
    expect(
      await within(option).findByRole('heading', { name: 'Independent night option' })
    ).toBeVisible();
    expect(within(option).getByText('1 purchased leg')).toBeVisible();
    expect(within(option).queryByText('2 purchased legs')).toBeNull();
    expect(writes(transport)).toEqual([]);
  });
  it('adds an empty independent alternative with the existing group revision and no copied source fields', async () => {
    const empty = {
      journey: sourceJourney({ id: 22, name: null, reference: null, sourceLinks: [], buffers: {} }),
      legs: [],
    };
    const transport = journeyTransport({
      groups: [{ ...group, alternativeJourneyIds: [] }],
      alternatives: [empty],
      writes: [
        {
          status: 201,
          body: {
            group: { ...group, alternativeJourneyIds: [22], revision: 4 },
            journey: empty.journey,
          },
        },
      ],
    });
    mount(transport);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add option' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
    const option = await screen.findByRole('article', { name: 'Journey option 22' });
    expect(await within(option).findByText('No transport legs recorded')).toBeVisible();
    expect(writes(transport)).toEqual([
      {
        method: 'POST',
        path: '/trips/7/journey-groups/80/alternatives',
        body: { expectedRevision: 3 },
      },
    ]);
    expect(screen.getByRole('heading', { name: 'Harbour connection' })).toBeVisible();
  });
  it('keeps the same edited field mounted across a failing background read', async () => {
    const transport = journeyTransport();
    const cache = mount(transport);
    const field = await screen.findByLabelText('Transport mode');
    fireEvent.change(field, { target: { value: '  Unfinished source mode  ' } });
    transport.failSource(503);
    await act(() =>
      cache.refetchQueries({
        queryKey: journeyKey({ tripId: 7, journeyId: 20, client: transport.client }),
        exact: true,
      })
    );
    expect(await screen.findByText('trips.source.invalid')).toBeVisible();
    expect(screen.getByLabelText('Transport mode')).toBe(field);
    expect(field).toHaveValue('  Unfinished source mode  ');
    expect(writes(transport)).toEqual([]);
  });
  it('clears a configured threshold with a complete retained buffer object and keeps opaque source links', async () => {
    const initial = sourceJourney({
      buffers: { minimumConnectionMinutes: 35, airportBufferMinutes: 75 },
    });
    const transport = journeyTransport({
      source: { journey: initial, legs: [sourceLeg()] },
      writes: [{ status: 200, body: sourceJourney({ buffers: { airportBufferMinutes: 75 } }) }],
    });
    mount(transport);
    fireEvent.click(await screen.findByText('References and timing'));
    const field = screen.getByLabelText('Connection minimum · min');
    fireEvent.change(field, { target: { value: '' } });
    fireEvent.blur(field);
    await waitFor(() =>
      expect(writes(transport)).toEqual([
        {
          method: 'PATCH',
          path: '/trips/7/journeys/20',
          body: { buffers: { airportBufferMinutes: 75 } },
        },
      ])
    );
    expect(screen.getByText('Original source')).toBeVisible();
  });
  it('edits an independent alternative without selecting it or sending working-journey fields', async () => {
    const alternative = {
      journey: sourceJourney({ id: 21, name: 'Independent option' }),
      legs: [sourceLeg({ id: 41, journeyId: 21, mode: 'Night coach' })],
    };
    const transport = journeyTransport({
      groups: [group],
      alternatives: [alternative],
      writes: [{ status: 200, body: sourceLeg({ id: 41, journeyId: 21, mode: 'Sleeper coach' }) }],
    });
    mount(transport);
    const option = await screen.findByRole('article', { name: 'Journey option 21' });
    fireEvent.click(within(option).getByRole('button', { name: 'Edit option' }));
    const field = await within(option).findByLabelText('Transport mode');
    expect(field).toHaveValue('Night coach');
    fireEvent.change(field, { target: { value: 'Sleeper coach' } });
    fireEvent.blur(field);
    await waitFor(() =>
      expect(writes(transport)).toEqual([
        { method: 'PATCH', path: '/trips/7/journeys/21/legs/41', body: { mode: 'Sleeper coach' } },
      ])
    );
    expect(screen.getByRole('heading', { name: 'Harbour connection' })).toBeVisible();
  });
  it('persists selection and Undo using the returned revision while preserving original source identities', async () => {
    const selected = { ...group, currentJourneyId: 21, alternativeJourneyIds: [20], revision: 4 };
    const transport = journeyTransport({
      groups: [group],
      alternatives: [{ journey: sourceJourney({ id: 21, name: 'Selected source' }), legs: [] }],
      writes: [
        { status: 200, body: selected },
        { status: 200, body: { ...group, revision: 5 } },
      ],
    });
    mount(transport);
    fireEvent.click(await screen.findByRole('button', { name: 'Use journey' }));
    expect(await screen.findByRole('heading', { name: 'Selected source', level: 1 })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Undo selection' }));
    await waitFor(() =>
      expect(writes(transport).map((request) => request.body)).toEqual([
        { journeyId: 21, expectedRevision: 3 },
        { journeyId: 20, expectedRevision: 4 },
      ])
    );
    expect(
      await screen.findByRole('heading', { name: 'Harbour connection', level: 1 })
    ).toBeVisible();
    expect(
      writes(transport).every((request) => request.path === '/trips/7/journey-groups/80/selection')
    ).toBe(true);
  });
  it('shows a revision conflict without switching the current editor or silently retrying selection', async () => {
    const transport = journeyTransport({
      groups: [group],
      writes: [{ status: 409, body: sourceProblem('trips.group.stale') }],
    });
    mount(transport);
    fireEvent.click(await screen.findByRole('button', { name: 'Use journey' }));
    expect(await screen.findByText('trips.group.stale')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Harbour connection' })).toBeVisible();
    expect(writes(transport)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Reload alternatives' }));
    await waitFor(() => expect(screen.queryByText('trips.group.stale')).toBeNull());
    expect(writes(transport)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Undo selection' })).toBeNull();
  });
});
