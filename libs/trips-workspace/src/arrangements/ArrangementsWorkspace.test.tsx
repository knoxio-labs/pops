import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createClient as createDocumentsClient } from '../documents-api/client';
import { sourceUploadSession } from '../shared/source-upload-sessions';
import { SourceDocuments } from '../shared/SourceDocuments';
import { sourceStay } from '../stay/test-utils';
import { createClient } from '../trips-api/client';
import { ArrangementsWorkspace } from './ArrangementsWorkspace';
import { Responsibility } from './Responsibility';
import { arrangementsTransport, labels, sourceRental } from './test-utils';

import type { ReactElement } from 'react';

import type { TripDocumentUploadSession } from '../documents/trip-document-upload-session';
import type { EventWorkspaceProps } from '../event/types';
import type { JourneyWorkspaceProps } from '../journey/types';
import type { StayWorkspaceProps } from '../stay/types';

const documentViews = vi.hoisted(() => vi.fn<(session: TripDocumentUploadSession) => void>());
const gapRequests = vi.hoisted(() => vi.fn<(promise: Promise<void>) => void>());
vi.mock('./use-gap-capture', async (original) => {
  const actual = await original<typeof import('./use-gap-capture')>();
  return {
    ...actual,
    useGapCapture: (...args: Parameters<typeof actual.useGapCapture>) => {
      const capture = actual.useGapCapture(...args);
      return {
        ...capture,
        create: (...input: Parameters<typeof capture.create>): Promise<void> => {
          const promise = capture.create(...input);
          gapRequests(promise);
          return promise;
        },
      };
    },
  };
});
vi.mock('../shared/SourceDocuments', () => ({
  SourceDocuments: (context: Parameters<typeof SourceDocuments>[0]) => {
    const session = sourceUploadSession(useQueryClient(), context);
    documentViews(session);
    return (
      <p>
        Documents source {session.context.target.kind}:{session.context.target.id}
      </p>
    );
  },
}));

vi.mock('../stay/StayWorkspace', () => ({
  StayWorkspace: ({ tripId, stayId, client, documentsClient }: StayWorkspaceProps) => (
    <>
      <p>
        Stay source {tripId}:{stayId}
      </p>
      <SourceDocuments
        tripId={tripId}
        target={{ kind: 'stay', id: stayId }}
        tripsClient={client}
        documentsClient={documentsClient}
      />
    </>
  ),
}));
vi.mock('../event/EventWorkspace', () => ({
  EventWorkspace: ({ tripId, eventId, client, documentsClient }: EventWorkspaceProps) => (
    <>
      <p>
        Event source {tripId}:{eventId}
      </p>
      <SourceDocuments
        tripId={tripId}
        target={{ kind: 'event', id: eventId }}
        tripsClient={client}
        documentsClient={documentsClient}
      />
    </>
  ),
}));
vi.mock('../journey/JourneyWorkspace', () => ({
  JourneyWorkspace: ({
    tripId,
    journeyId,
    onViewJourney,
    client,
    documentsClient,
  }: JourneyWorkspaceProps) => {
    const [selection, setSelection] = useState('Original selection');
    return (
      <>
        <p>
          Journey source {tripId}:{journeyId}
        </p>
        <p>{selection}</p>
        <SourceDocuments
          tripId={tripId}
          target={{ kind: 'journey', id: journeyId }}
          tripsClient={client}
          documentsClient={documentsClient}
        />
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

afterEach(() => {
  cleanup();
  documentViews.mockClear();
  gapRequests.mockClear();
});
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
function deferredGap(transport: ReturnType<typeof arrangementsTransport>) {
  const originalFetch = transport.client.getConfig().fetch;
  if (!originalFetch) throw new Error('Expected the actual source transport');
  let accept: (() => void) | undefined;
  let started: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    accept = resolve;
  });
  const requestStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const client = createClient({
    baseUrl: 'http://arrangements.test',
    fetch: async (input, init) => {
      const request = new Request(input, init);
      if (request.method === 'POST') {
        started?.();
        await gate;
      }
      return originalFetch(request);
    },
  });
  return {
    client,
    requestStarted,
    accept: (): void => {
      if (!accept) throw new Error('Expected the pending source gate');
      accept();
    },
  };
}
describe('Along the route source workspace', () => {
  it('keeps repeated visits distinct, one full Rental and independently identifiable unplaced Journeys', async () => {
    setup();
    await screen.findByRole('button', { name: /Harbour cars/ });
    const first = screen.getByRole('region', { name: 'Wellington · Visit 1' });
    expect(within(first).getByRole('article', { name: 'Harbour cars' })).toBeVisible();
    expect(screen.getAllByRole('article', { name: 'Harbour cars' })).toHaveLength(1);
    expect(within(first).getByText('Pickup')).toBeVisible();
    expect(within(first).getByText('Return')).toBeVisible();
    expect(within(first).getByText('Wellington · Visit 2')).toBeVisible();
    expect(
      within(screen.getByRole('region', { name: 'Journeys' })).getByRole('article', {
        name: 'Harbour connection',
      })
    ).toBeVisible();
    expect(
      screen.getByRole('article', { name: 'Harbour cars' }).querySelector('button')
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
  it('retains exact owner queues across source close, another target and query-cache eviction', async () => {
    const { user, queryClient } = setup();
    await user.click(await screen.findByRole('button', { name: /Cedar guesthouse/ }));
    const first = documentViews.mock.calls.at(-1)?.[0];
    if (!first) throw new Error('Expected the canonical Stay document controls');
    const file = new File(['original'], 'booking.pdf', { type: 'application/pdf' });
    first.addFiles([file]);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: /Harbour performance/ }));
    const event = documentViews.mock.calls.at(-1)?.[0];
    expect(event?.context.target).toEqual({ kind: 'event', id: 19 });
    expect(event).not.toBe(first);
    expect(event?.read()).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    act(() => queryClient.clear());
    await user.click(await screen.findByRole('button', { name: /Cedar guesthouse/ }));
    expect(documentViews.mock.calls.at(-1)?.[0]).toBe(first);
    expect(first.context.target).toEqual({ kind: 'stay', id: 13 });
    expect(first.read()[0]?.file).toBe(file);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: /Harbour cars/ }));
    expect(screen.queryByText(/Documents source/)).not.toBeInTheDocument();
    expect(first.read()[0]?.file).toBe(file);
  });
  it.each(['trips-instance', 'documents-instance', 'trips-origin', 'documents-origin'] as const)(
    'closes the active source on %s changes and retains its queue only for the original context',
    async (change) => {
      const first = arrangementsTransport();
      const second = arrangementsTransport();
      const documents = createDocumentsClient({ baseUrl: 'https://documents.example' });
      const otherDocuments = createDocumentsClient({ baseUrl: 'https://documents.example' });
      const identity = {
        tripId: 7,
        client: first.client,
        documentsClient: documents,
        labels,
        formatDate: (date: string): string => date,
      };
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const view = render(
        <QueryClientProvider client={queryClient}>
          <ArrangementsWorkspace {...identity} />
        </QueryClientProvider>
      );
      await userEvent.click(await screen.findByRole('button', { name: /Cedar guesthouse/ }));
      const original = documentViews.mock.calls.at(-1)?.[0];
      if (!original) throw new Error('Expected the original owner queue');
      const file = new File(['original'], 'booking.pdf', { type: 'application/pdf' });
      original.addFiles([file]);
      const changed = {
        ...identity,
        client: change === 'trips-instance' ? second.client : first.client,
        documentsClient: change === 'documents-instance' ? otherDocuments : documents,
      };
      if (change === 'trips-origin')
        first.client.setConfig({ baseUrl: 'https://other-trips.example' });
      if (change === 'documents-origin')
        documents.setConfig({ baseUrl: 'https://other-documents.example' });
      view.rerender(
        <QueryClientProvider client={queryClient}>
          <ArrangementsWorkspace {...changed} />
        </QueryClientProvider>
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await userEvent.click(await screen.findByRole('button', { name: /Cedar guesthouse/ }));
      const current = documentViews.mock.calls.at(-1)?.[0];
      expect(current).not.toBe(original);
      expect(current?.read()).toHaveLength(0);
      expect(current?.context.tripsClient).toBe(changed.client);
      expect(current?.context.documentsClient).toBe(changed.documentsClient);
      first.client.setConfig({ baseUrl: 'http://arrangements.test' });
      documents.setConfig({ baseUrl: 'https://documents.example' });
      view.rerender(
        <QueryClientProvider client={queryClient}>
          <ArrangementsWorkspace {...identity} />
        </QueryClientProvider>
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await userEvent.click(await screen.findByRole('button', { name: /Cedar guesthouse/ }));
      expect(documentViews.mock.calls.at(-1)?.[0]).toBe(original);
      expect(original.read()[0]?.file).toBe(file);
      expect(first.writes).toEqual([]);
      expect(second.writes).toEqual([]);
    }
  );
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
  it.each(['instance', 'origin', 'trip'] as const)(
    'retains an uncertain source responsibility operation across a client %s A→B→A transition',
    async (change) => {
      const first = arrangementsTransport();
      const second = arrangementsTransport();
      first.replies.push({
        status: 503,
        body: {
          code: 'trips.responsibility.unknown',
          message: 'Unknown write outcome',
          retryable: true,
        },
      });
      const identity = {
        tripId: 7,
        client: first.client,
        labels,
        formatDate: (date: string): string => date,
      };
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const view = render(
        <QueryClientProvider client={queryClient}>
          <ArrangementsWorkspace {...identity} />
        </QueryClientProvider>
      );
      await userEvent.click(await screen.findByRole('button', { name: /Harbour cars/ }));
      await userEvent.click(await screen.findByRole('button', { name: 'Self' }));
      await screen.findByText('trips.responsibility.unknown');
      if (change === 'origin') first.client.setConfig({ baseUrl: 'https://other-trips.example' });
      view.rerender(
        <QueryClientProvider client={queryClient}>
          <ArrangementsWorkspace
            {...identity}
            client={change === 'instance' ? second.client : first.client}
            tripId={change === 'trip' ? 8 : 7}
          />
        </QueryClientProvider>
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      first.client.setConfig({ baseUrl: 'http://arrangements.test' });
      view.rerender(
        <QueryClientProvider client={queryClient}>
          <ArrangementsWorkspace {...identity} />
        </QueryClientProvider>
      );
      await userEvent.click(await screen.findByRole('button', { name: /Harbour cars/ }));
      expect(screen.getByText(labels.responsibilityUncertain)).toBeVisible();
      expect(screen.getByRole('button', { name: 'Self' })).toBeDisabled();
      expect(first.writes).toHaveLength(1);
      expect(second.writes).toEqual([]);
    }
  );
  it('keeps the canonical Journey editor mounted when its selected source changes', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: /Harbour connection/ }));
    expect(documentViews.mock.calls.at(-1)?.[0].context.target).toEqual({
      kind: 'journey',
      id: 20,
    });
    await user.click(screen.getByRole('button', { name: 'Use source journey 21' }));
    expect(documentViews.mock.calls.at(-1)?.[0].context.target).toEqual({
      kind: 'journey',
      id: 21,
    });
    expect(screen.getByText('Journey source 7:21')).toBeVisible();
    expect(screen.getByText('Selection retained')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Journeys' })).toBeVisible();
  });
  it('opens a real captured Stay for the exact selected Visit gap without copying a Rental or another town', async () => {
    const { user, transport } = setup();
    transport.replies.push({
      status: 201,
      body: sourceStay({
        id: 17,
        status: null,
        timing: { arrival: '2029-05-04', departure: '2029-05-09' },
      }),
    });
    const visit = await screen.findByRole('region', { name: 'Wellington · Visit 1' });
    await user.click(
      await within(visit).findByRole('button', { name: /Accommodation not arranged/ })
    );
    expect(screen.getByText('Stay source 7:17')).toBeVisible();
    expect(transport.writes).toEqual([
      {
        method: 'POST',
        path: '/trips/7/stays',
        body: { visitId: 31, timing: { arrival: '2029-05-04', departure: '2029-05-09' } },
      },
    ]);
  });
  it('retains uncertain Stay creation across source reload until conscious new intent', async () => {
    const { user, transport } = setup();
    transport.replies.push({
      status: 503,
      body: {
        code: 'trips.stay.creation_uncertain',
        message: 'Stay creation response unavailable',
        retryable: true,
      },
    });
    const visit = await screen.findByRole('region', { name: 'Wellington · Visit 1' });
    await user.click(
      await within(visit).findByRole('button', { name: /Accommodation not arranged/ })
    );
    expect(await screen.findByText('trips.stay.creation_uncertain')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(within(visit).getByRole('button', { name: /Accommodation not arranged/ })).toBeEnabled();
    await user.click(within(visit).getByRole('button', { name: /Accommodation not arranged/ }));
    expect(transport.writes).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Reload source' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Start a new stay' })).toBeEnabled()
    );
    expect(screen.getByText('trips.stay.creation_uncertain')).toBeVisible();
    expect(transport.writes).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Start a new stay' }));
    expect(screen.queryByText('trips.stay.creation_uncertain')).not.toBeInTheDocument();
    expect(transport.writes).toHaveLength(1);
  });
  it.each([false, true])(
    'keeps a newer Rental draft when a gap creation settles after host replacement (ABA: %s)',
    async (returnBeforeReceipt) => {
      const first = arrangementsTransport();
      const second = arrangementsTransport();
      const { client, accept, requestStarted } = deferredGap(first);
      first.replies.push({
        status: 201,
        body: sourceStay({
          id: 17,
          status: 'Considering',
          timing: { arrival: '2029-05-04', departure: '2029-05-09' },
        }),
      });
      const identity = { tripId: 7, client, labels, formatDate: (date: string): string => date };
      const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const view = render(
        <QueryClientProvider client={cache}>
          <ArrangementsWorkspace {...identity} />
        </QueryClientProvider>
      );
      const visit = await screen.findByRole('region', { name: 'Wellington · Visit 1' });
      const gap = await within(visit).findByRole('button', { name: /Accommodation not arranged/ });
      await userEvent.click(gap);
      await requestStarted;
      const creating = gapRequests.mock.calls.at(-1)?.[0];
      if (!creating) throw new Error('Expected the actual parent capture operation');
      view.rerender(
        <QueryClientProvider client={cache}>
          <ArrangementsWorkspace {...identity} client={second.client} />
        </QueryClientProvider>
      );
      if (returnBeforeReceipt)
        view.rerender(
          <QueryClientProvider client={cache}>
            <ArrangementsWorkspace {...identity} />
          </QueryClientProvider>
        );
      await userEvent.click(await screen.findByRole('button', { name: /Harbour cars/ }));
      await userEvent.clear(await screen.findByLabelText('Provider'));
      await userEvent.type(screen.getByLabelText('Provider'), 'Replacement context draft');
      await act(async () => {
        accept();
        await creating;
      });
      expect(first.writes).toHaveLength(1);
      expect(screen.getByLabelText('Provider')).toHaveValue('Replacement context draft');
      expect(screen.queryByText('Stay source 7:17')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Close' }));
      if (!returnBeforeReceipt)
        view.rerender(
          <QueryClientProvider client={cache}>
            <ArrangementsWorkspace {...identity} />
          </QueryClientProvider>
        );
      const originalVisit = await screen.findByRole('region', { name: 'Wellington · Visit 1' });
      await userEvent.click(
        await within(originalVisit).findByRole('button', { name: /Accommodation not arranged/ })
      );
      expect(screen.getByText('Stay source 7:17')).toBeVisible();
      expect(first.writes).toHaveLength(1);
      expect(second.writes).toEqual([]);
    }
  );
  it.each([
    { context: 'origin', known: false },
    { context: 'origin', known: true },
    { context: 'trip', known: false },
    { context: 'trip', known: true },
  ] as const)(
    'retains a late gap receipt through $context remounts (known: $known)',
    async ({ context, known }) => {
      const transport = arrangementsTransport();
      const { client, accept, requestStarted } = deferredGap(transport);
      transport.replies.push(
        known
          ? {
              status: 201,
              body: sourceStay({
                id: 17,
                status: 'Considering',
                timing: { arrival: '2029-05-04', departure: '2029-05-09' },
              }),
            }
          : {
              status: 503,
              body: {
                code: 'trips.creation.unknown',
                message: 'Creation outcome unknown',
                retryable: true,
              },
            }
      );
      const identity = { tripId: 7, client, labels, formatDate: (date: string): string => date };
      const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const view = render(
        <QueryClientProvider client={cache}>
          <ArrangementsWorkspace {...identity} />
        </QueryClientProvider>
      );
      const firstVisit = await screen.findByRole('region', { name: 'Wellington · Visit 1' });
      await userEvent.click(
        await within(firstVisit).findByRole('button', { name: /Accommodation not arranged/ })
      );
      await requestStarted;
      const creating = gapRequests.mock.calls.at(-1)?.[0];
      if (!creating) throw new Error('Expected the actual source creation operation');
      if (context === 'origin') client.setConfig({ baseUrl: 'https://other-trips.example' });
      view.rerender(
        <QueryClientProvider client={cache}>
          <ArrangementsWorkspace {...identity} tripId={context === 'trip' ? 8 : 7} />
        </QueryClientProvider>
      );
      await act(async () => {
        accept();
        await creating;
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(
        cache
          .getQueryData<{ id: number }[]>(['trips', 'http://arrangements.test', 7, 'stays'])
          ?.some((stay) => stay.id === 17)
      ).toBe(false);
      client.setConfig({ baseUrl: 'http://arrangements.test' });
      view.rerender(
        <QueryClientProvider client={cache}>
          <ArrangementsWorkspace {...identity} />
        </QueryClientProvider>
      );
      const originalVisit = await screen.findByRole('region', { name: 'Wellington · Visit 1' });
      if (!known) expect(await screen.findByText('trips.creation.unknown')).toBeVisible();
      await userEvent.click(
        await within(originalVisit).findByRole('button', { name: /Accommodation not arranged/ })
      );
      if (known) expect(await screen.findByText('Stay source 7:17')).toBeVisible();
      else expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(transport.writes).toHaveLength(1);
      expect(transport.writes[0]?.path).toBe('/trips/7/stays');
      expect(
        transport.requests
          .filter((request) => request.method === 'POST')
          .every((request) => new URL(request.url).origin === 'http://arrangements.test')
      ).toBe(true);
    }
  );
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
  it('retains an unresolved Visit identity for unrelated Rental edits without featuring technical IDs', async () => {
    const transport = arrangementsTransport();
    transport.setRental(sourceRental({ pickupVisitId: 999 }));
    transport.replies.push({
      status: 200,
      body: sourceRental({ pickupVisitId: 999, provider: 'Retained visit provider', revision: 1 }),
    });
    mount(
      <ArrangementsWorkspace
        tripId={7}
        client={transport.client}
        labels={labels}
        formatDate={(date) => date}
      />
    );
    const source = await screen.findByRole('article', { name: 'Harbour cars' });
    expect(within(source).queryByText('999')).not.toBeInTheDocument();
    expect(within(source).queryByText('pops:contacts/contact/unavailable')).not.toBeInTheDocument();
    await userEvent.click(within(source).getByRole('button'));
    expect(await screen.findByLabelText('Pickup')).toHaveValue('999');
    const provider = screen.getByLabelText('Provider');
    await userEvent.clear(provider);
    await userEvent.type(provider, 'Retained visit provider');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(transport.writes).toHaveLength(1));
    expect(transport.writes[0]?.body).toMatchObject({
      provider: 'Retained visit provider',
      pickupVisitId: 999,
      returnVisitId: 32,
      expectedRevision: 0,
    });
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
    expect(await screen.findByText('Contact')).toBeVisible();
    await userEvent.click(screen.getByText('Reference details'));
    expect(screen.getByText('pops:contacts/contact/unavailable')).toBeVisible();
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
  it('saves owner-issued Contact choice and explicit Self independently using confirmed responsibility revisions', async () => {
    const transport = arrangementsTransport();
    const uri = 'pops:contacts/contact/owner-issued';
    transport.replies.push(
      {
        status: 200,
        body: {
          tripId: 7,
          targetKind: 'rental',
          targetId: 61,
          responsibility: { kind: 'contact', uri },
          revision: 5,
        },
      },
      {
        status: 200,
        body: {
          tripId: 7,
          targetKind: 'rental',
          targetId: 61,
          responsibility: { kind: 'self' },
          revision: 6,
        },
      }
    );
    mount(
      <Responsibility
        identity={{
          tripId: 7,
          client: transport.client,
          labels,
          formatDate: (date) => date,
          contactChooserIntent: () => ({
            Chooser: ({ open, onSelect }) =>
              open ? (
                <button
                  onClick={() =>
                    onSelect({
                      name: 'Issued owner',
                      reference: { canonicalId: 'owner-issued', uri },
                    })
                  }
                >
                  Select owner-issued contact
                </button>
              ) : null,
          }),
        }}
        target={{ targetKind: 'rental', targetId: 61 }}
      />
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Choose contact' }));
    expect(transport.writes).toHaveLength(0);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Select owner-issued contact' })
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Self' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Self' }));
    await waitFor(() => expect(transport.writes).toHaveLength(2));
    expect(transport.writes.map((write) => write.body)).toEqual([
      { expectedRevision: 4, responsibility: { kind: 'contact', uri } },
      { expectedRevision: 5, responsibility: { kind: 'self' } },
    ]);
    expect(
      transport.writes.every((write) => write.path === '/trips/7/responsibilities/rental/61')
    ).toBe(true);
  });
});
