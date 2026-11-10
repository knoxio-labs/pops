import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ArrangementsWorkspace } from './ArrangementsWorkspace';
import { Responsibility } from './Responsibility';
import { arrangementsTransport, labels, sourceRental } from './test-utils';

import type { ReactElement } from 'react';

vi.mock('../stay/StayWorkspace', () => ({
  StayWorkspace: ({ tripId, stayId }: { tripId: number; stayId: number }) => (
    <p>
      Stay source {tripId}:{stayId}
    </p>
  ),
}));
vi.mock('../event/EventWorkspace', () => ({
  EventWorkspace: ({ tripId, eventId }: { tripId: number; eventId: number }) => (
    <p>
      Event source {tripId}:{eventId}
    </p>
  ),
}));
vi.mock('../journey/JourneyWorkspace', () => ({
  JourneyWorkspace: ({
    tripId,
    journeyId,
    onViewJourney,
  }: {
    tripId: number;
    journeyId: number;
    onViewJourney?: (id: number) => void;
  }) => {
    const [selection, setSelection] = useState('Original selection');
    return (
      <>
        <p>
          Journey source {tripId}:{journeyId}
        </p>
        <p>{selection}</p>
        <button
          onClick={() => {
            setSelection('Selection retained');
            onViewJourney?.(21);
          }}
        >
          Use source journey 21
        </button>
      </>
    );
  },
}));

afterEach(cleanup);
function mount(element: ReactElement): QueryClient {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
  return queryClient;
}
function setup() {
  const transport = arrangementsTransport();
  const identity = {
    tripId: 7,
    client: transport.client,
    labels,
    formatDate: (date: string): string => date,
  };
  const queryClient = mount(<ArrangementsWorkspace {...identity} />);
  return { transport, identity, queryClient, user: userEvent.setup() };
}
describe('Along the route source workspace', () => {
  it('keeps repeated visits distinct, one full Rental and independently identifiable unplaced Journeys', async () => {
    setup();
    await screen.findByRole('button', { name: /Harbour cars/ });
    const first = screen.getByRole('region', { name: 'Wellington · 31' });
    expect(within(first).getByRole('article', { name: 'Rental · 61' })).toBeVisible();
    expect(screen.getAllByRole('article', { name: 'Rental · 61' })).toHaveLength(1);
    expect(within(first).getByText('Pickup')).toBeVisible();
    expect(within(first).getByText('Return')).toBeVisible();
    expect(within(first).getByText('Wellington · 32')).toBeVisible();
    expect(
      within(screen.getByRole('region', { name: 'Journeys' })).getByRole('article', {
        name: 'Journeys · 20',
      })
    ).toBeVisible();
    expect(
      screen.getByRole('article', { name: 'Rental · 61' }).querySelector('button')
    ).not.toHaveClass('border-solid');
  });
  it.each([
    { name: /Cedar guesthouse/, result: 'Stay source 7:13' },
    { name: /Harbour performance/, result: 'Event source 7:19' },
    { name: /Harbour connection/, result: 'Journey source 7:20' },
  ])('opens the exact canonical owning editor $result', async ({ name, result }) => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name }));
    expect(within(screen.getByRole('dialog')).getByText(result)).toBeVisible();
  });
  it('filters source facts without changing reservations or the source collections', async () => {
    const { user, transport } = setup();
    await screen.findByRole('button', { name: /Harbour cars/ });
    await user.selectOptions(screen.getByLabelText('Purchase'), 'purchased');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByText('No matching arrangements')).toBeVisible();
    await user.selectOptions(screen.getByLabelText('Purchase'), '');
    await user.type(screen.getByLabelText('Search arrangements'), 'Harbour cars');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('Reserved')).toBeVisible();
    expect(transport.writes).toEqual([]);
  });
  it('keeps the canonical Journey editor mounted when its selected source changes', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: /Harbour connection/ }));
    await user.click(screen.getByRole('button', { name: 'Use source journey 21' }));
    expect(screen.getByText('Journey source 7:21')).toBeVisible();
    expect(screen.getByText('Selection retained')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Journeys · 21' })).toBeVisible();
  });
  it('retains cached arrangements during refresh failures with a readable diagnostic and retry', async () => {
    const { transport, queryClient } = setup();
    await screen.findByRole('button', { name: /Harbour cars/ });
    transport.failures.add('/trips/7/rentals');
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ['trips', 'http://arrangements.test', 7, 'rentals'],
      });
    });
    expect(await screen.findByText('trips.temporarily_unavailable')).toBeVisible();
    expect(screen.getByRole('button', { name: /Harbour cars/ })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });
  it('keeps failed Rental drafts and retries the same actual identity and optimistic revision', async () => {
    const { user, transport } = setup();
    transport.replies.push(
      {
        status: 503,
        body: {
          code: 'trips.rental.unavailable',
          message: 'Rental could not be saved',
          retryable: true,
        },
      },
      { status: 200, body: sourceRental({ provider: 'New provider', revision: 1 }) }
    );
    await user.click(await screen.findByRole('button', { name: /Harbour cars/ }));
    const provider = await screen.findByLabelText('Provider');
    await user.clear(provider);
    await user.type(provider, 'New provider');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('trips.rental.unavailable')).toBeVisible();
    expect(provider).toHaveValue('New provider');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(screen.queryByText('trips.rental.unavailable')).not.toBeInTheDocument()
    );
    expect(transport.writes).toHaveLength(2);
    expect(transport.writes[0]).toEqual(transport.writes[1]);
    expect(transport.writes[0]).toEqual({
      method: 'PATCH',
      path: '/trips/7/rentals/61',
      body: {
        provider: 'New provider',
        pickupVisitId: 31,
        returnVisitId: 32,
        start: '2029-05-01',
        end: '2029-05-09',
        status: 'Reserved',
        expectedRevision: 0,
      },
    });
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });
  it('preserves a Rental draft when a newer source arrives, requiring canonical reload before saving', async () => {
    const { user, transport, queryClient } = setup();
    await user.click(await screen.findByRole('button', { name: /Harbour cars/ }));
    const provider = await screen.findByLabelText('Provider');
    await user.clear(provider);
    await user.type(provider, 'Local draft');
    const newer = sourceRental({ provider: 'New canonical provider', revision: 2 });
    transport.setRental(newer);
    act(() =>
      queryClient.setQueryData(['trips', 'http://arrangements.test', 7, 'rental', 61], newer)
    );
    expect(await screen.findByText('The source changed')).toBeVisible();
    expect(provider).toHaveValue('Local draft');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Reload source' }));
    await waitFor(() => expect(provider).toHaveValue('New canonical provider'));
    expect(screen.queryByText('The source changed')).not.toBeInTheDocument();
    expect(transport.writes).toEqual([]);
  });
  it('persists Rental Undo against the confirmed successor revision', async () => {
    const { user, transport } = setup();
    transport.replies.push(
      { status: 200, body: sourceRental({ provider: 'Changed', revision: 1 }) },
      { status: 200, body: sourceRental({ revision: 2 }) }
    );
    await user.click(await screen.findByRole('button', { name: /Harbour cars/ }));
    const provider = await screen.findByLabelText('Provider');
    await user.clear(provider);
    await user.type(provider, 'Changed');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(provider).toHaveValue('Harbour cars'));
    expect(transport.writes[1]).toEqual({
      method: 'PATCH',
      path: '/trips/7/rentals/61',
      body: {
        provider: 'Harbour cars',
        pickupVisitId: 31,
        returnVisitId: 32,
        start: '2029-05-01',
        end: '2029-05-09',
        status: 'Reserved',
        expectedRevision: 1,
      },
    });
  });
  it('keeps optional responsibility failures independent of the canonical source editor', async () => {
    const { user, transport } = setup();
    transport.failures.add('/trips/7/responsibilities/stay/13');
    await user.click(await screen.findByRole('button', { name: /Cedar guesthouse/ }));
    expect(screen.getByText('Stay source 7:13')).toBeVisible();
    expect(await screen.findByText('trips.temporarily_unavailable')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Self' })).not.toBeInTheDocument();
    expect(transport.writes).toEqual([]);
  });
  it('does not present unavailable source collections as an empty catalogue', async () => {
    const transport = arrangementsTransport();
    for (const kind of ['stays', 'events', 'journeys', 'rentals'])
      transport.failures.add(`/trips/7/${kind}`);
    mount(
      <ArrangementsWorkspace
        tripId={7}
        client={transport.client}
        labels={labels}
        formatDate={(date) => date}
      />
    );
    await waitFor(() =>
      expect(screen.getAllByText('trips.temporarily_unavailable')).toHaveLength(4)
    );
    expect(screen.queryByText('No matching arrangements')).not.toBeInTheDocument();
  });
  it('clears a retained opaque responsibility with no Contacts dependency or other source write', async () => {
    const transport = arrangementsTransport();
    transport.replies.push({
      status: 200,
      body: { tripId: 7, targetKind: 'rental', targetId: 61, responsibility: null, revision: 5 },
    });
    mount(
      <Responsibility
        identity={{ tripId: 7, client: transport.client, labels, formatDate: (date) => date }}
        target={{ targetKind: 'rental', targetId: 61 }}
      />
    );
    expect(await screen.findByText('pops:contacts/contact/unavailable')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Clear responsibility' }));
    expect(await screen.findByText('Unset')).toBeVisible();
    expect(transport.writes).toEqual([
      {
        method: 'PUT',
        path: '/trips/7/responsibilities/rental/61',
        body: { responsibility: null, expectedRevision: 4 },
      },
    ]);
    expect(
      transport.requests.every((request) => new URL(request.url).hostname === 'arrangements.test')
    ).toBe(true);
  });
});
