import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { JourneyWorkspace } from './JourneyWorkspace';
import { legSource } from './model';
import { journeyTransport, sourceJourney, sourceLeg, sourceProblem } from './test-utils';

const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const cache of caches) cache.clear();
  caches.length = 0;
});

function mount(
  transport: ReturnType<typeof journeyTransport>,
  identity = { tripId: 7, journeyId: 20 }
) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
  caches.push(cache);
  render(
    <QueryClientProvider client={cache}>
      <JourneyWorkspace {...identity} client={transport.client} />
    </QueryClientProvider>
  );
  return cache;
}
async function edit(label: string, value: string) {
  const field = await screen.findByLabelText(label);
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}
const writes = (transport: ReturnType<typeof journeyTransport>) =>
  transport.requests.filter((request) => request.method !== 'GET');

describe('Departure and arrival source workspace', () => {
  it('renders open source modes, independent soft booking facts and unknown zones without defaults', async () => {
    const transport = journeyTransport();
    mount(transport);
    expect(await screen.findByLabelText('Transport mode')).toHaveValue('Hydrofoil');
    expect(screen.getByLabelText('Arrangement')).toHaveValue('Booked');
    expect(screen.getByLabelText('Intention')).toHaveValue('Considering');
    expect(screen.getByText('Departure time zone unknown')).toBeVisible();
    expect(screen.getByLabelText('Departure time zone')).toHaveValue('');
    expect(screen.getByRole('article', { name: 'Transport leg 1' })).toHaveClass('border-dashed');
    expect(writes(transport)).toEqual([]);
  });
  it('replaces one endpoint while retaining its source label, place and opaque links', async () => {
    const original = sourceLeg();
    const changed = sourceLeg({ from: { ...original.from, timeZone: 'Pacific/Auckland' } });
    const transport = journeyTransport({ writes: [{ status: 200, body: changed }] });
    mount(transport);
    await edit('Departure time zone', 'Pacific/Auckland');
    await waitFor(() =>
      expect(writes(transport)).toEqual([
        {
          method: 'PATCH',
          path: '/trips/7/journeys/20/legs/40',
          body: { from: changed.from, expectedRevision: 0 },
        },
      ])
    );
    expect(screen.getByLabelText('Arrival local time')).toHaveValue(original.to.local);
  });
  it('persists Purchased without hardening arrangement and reverses all original source fields through PATCH', async () => {
    const initial = sourceLeg();
    const transport = journeyTransport({
      writes: [
        { status: 200, body: sourceLeg({ purchase: 'Purchased' }) },
        { status: 200, body: initial },
      ],
    });
    mount(transport);
    fireEvent.change(await screen.findByLabelText('Purchase'), { target: { value: 'Purchased' } });
    await waitFor(() =>
      expect(screen.getByRole('article', { name: 'Transport leg 1' })).toHaveClass('border-solid')
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(writes(transport).at(-1)?.body).toEqual({ ...legSource(initial), expectedRevision: 1 })
    );
    await waitFor(() => expect(screen.getByLabelText('Purchase')).toHaveValue(''));
    expect(screen.getByLabelText('Arrangement')).toHaveValue('Booked');
  });
  it('retains a failed source draft and retries the exact action with safe diagnostics', async () => {
    const transport = journeyTransport({
      writes: [
        { status: 400, body: sourceProblem() },
        { status: 200, body: sourceLeg({ mode: 'Night coach' }) },
      ],
    });
    mount(transport);
    await edit('Transport mode', 'Night coach');
    expect(await screen.findByText('trips.source.invalid')).toBeVisible();
    expect(screen.getByLabelText('Transport mode')).toHaveValue('Night coach');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(writes(transport)).toHaveLength(2));
    expect(writes(transport)[0]?.body).toEqual({ mode: 'Night coach', expectedRevision: 0 });
    expect(writes(transport)[1]?.body).toEqual({ mode: 'Night coach', expectedRevision: 0 });
    await waitFor(() => expect(screen.queryByText('trips.source.invalid')).toBeNull());
  });
  it('keeps editable source facts available when context/timing services fail', async () => {
    const transport = journeyTransport({ contextFailure: true });
    mount(transport);
    expect(await screen.findByLabelText('Transport mode')).toBeEnabled();
    expect(await screen.findAllByText('trips.context.unavailable')).toHaveLength(2);
    expect(screen.getByLabelText('Departure place')).toHaveValue('51');
    expect(writes(transport)).toEqual([]);
  });
  it('offers real empty source creation without invented mode/clocks and can undo the created identity', async () => {
    const operationId = '11111111-1111-4111-8111-111111111111';
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(operationId);
    const created = sourceLeg({
      id: 99,
      mode: null,
      from: {},
      to: {},
      intention: null,
      arrangement: null,
    });
    const transport = journeyTransport({
      source: { legRevision: 0, journey: sourceJourney(), legs: [] },
      writes: [
        { status: 201, body: created },
        {
          status: 200,
          body: {
            revision: 2,
            legs: [],
            receipt: {
              operationId,
              legId: 99,
              state: 'removed',
              removedRevision: 2,
              restoredRevision: null,
            },
          },
        },
      ],
    });
    mount(transport);
    expect(await screen.findByText('No transport legs recorded')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Add transport' }));
    expect(await screen.findByLabelText('Transport mode')).toHaveValue('');
    expect(writes(transport)[0]).toEqual({
      method: 'POST',
      path: '/trips/7/journeys/20/legs',
      body: { expectedRevision: 0 },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(writes(transport).at(-1)).toEqual({
        method: 'POST',
        path: '/trips/7/journeys/20/legs/99/removals',
        body: { operationId, expectedRevision: 1 },
      })
    );
    expect(await screen.findByText('No transport legs recorded')).toBeVisible();
  });
  it('renders only owner chronology findings and signed unknown connections', async () => {
    mount(
      journeyTransport({
        timing: {
          journeyId: 20,
          legs: [],
          window: null,
          connections: [{ previousLegId: 40, nextLegId: 41, availableMinutes: null }],
          findings: [
            {
              id: 'owner-finding',
              kind: 'conflict',
              code: 'arrival_before_departure',
              legIds: [40],
            },
          ],
        },
      })
    );
    expect(await screen.findByText(/Arrival is before departure/)).toBeVisible();
    expect(screen.getByText(/Connection time unknown/)).toBeVisible();
    expect(screen.queryByText(/tight connection/i)).toBeNull();
  });
  it('rejects invalid route identity before issuing any requests', () => {
    const transport = journeyTransport();
    mount(transport, { tripId: 7, journeyId: Number.NaN });
    expect(screen.getByText('trips.identity.invalid')).toBeVisible();
    expect(transport.requests).toEqual([]);
  });
  it('preserves authentication diagnostics without showing an editable empty journey', async () => {
    mount(journeyTransport({ sourceFailure: 401 }));
    expect(await screen.findByText('trips.source.invalid')).toBeVisible();
    expect(screen.queryByLabelText('Transport mode')).toBeNull();
    expect(screen.queryByText('No transport legs recorded')).toBeNull();
  });
  it('removes an existing purchased source leg and restores its exact identity and provenance through Undo', async () => {
    const operationId = '11111111-1111-4111-8111-111111111111';
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(operationId);
    const initial = sourceLeg({
      purchase: 'Purchased',
      sourceLinks: [{ uri: 'pops:documents/document/42', label: 'Original purchase document' }],
    });
    const receipt = {
      operationId,
      legId: initial.id,
      state: 'removed',
      removedRevision: 1,
      restoredRevision: null,
    };
    const transport = journeyTransport({
      source: { journey: sourceJourney(), legs: [initial], legRevision: 0 },
      writes: [
        { status: 200, body: { revision: 1, legs: [], receipt } },
        {
          status: 200,
          body: {
            revision: 2,
            legs: [initial],
            receipt: { ...receipt, state: 'restored', restoredRevision: 2 },
          },
        },
      ],
    });
    mount(transport);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove transport leg 1' }));
    expect(await screen.findByText('No transport legs recorded')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByLabelText('Transport mode')).toHaveValue(initial.mode);
    expect(screen.getByLabelText('Purchase')).toHaveValue('Purchased');
    expect(screen.getByLabelText('Arrangement')).toHaveValue(initial.arrangement);
    fireEvent.click(screen.getByText('Operator, reference and sources'));
    expect(screen.getByText('Original purchase document')).toHaveAttribute(
      'title',
      'pops:documents/document/42'
    );
    expect(writes(transport)).toEqual([
      {
        method: 'POST',
        path: '/trips/7/journeys/20/legs/40/removals',
        body: { operationId, expectedRevision: 0 },
      },
      {
        method: 'POST',
        path: `/trips/7/journeys/20/leg-removals/${operationId}/restore`,
        body: { expectedRevision: 1 },
      },
    ]);
  });
});
