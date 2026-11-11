import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { unwrap } from '@pops/pillar-sdk/client';

import enAU from './locales/en-AU.json';
import { timelineProducer } from './timeline-producer-fixture';
import { seedTimeline } from './timeline-seed-fixture';
import { TripOverviewPage } from './TripOverviewPage';
import { rentalsGet, responsibilitiesGet } from './trips-api/sdk.gen';

let owner: Awaited<ReturnType<typeof timelineProducer>>;
let source: Awaited<ReturnType<typeof seedTimeline>>;
let cache: QueryClient;
const translation = createInstance();
beforeEach(async () => {
  owner = await timelineProducer();
  source = await seedTimeline(owner);
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await translation.init({ lng: 'en-AU', resources: { 'en-AU': { trips: enAU } } });
}, 60_000);
afterEach(async () => {
  cleanup();
  cache?.clear();
  await owner?.close();
});

function mount() {
  return render(
    <I18nextProvider i18n={translation}>
      <QueryClientProvider client={cache}>
        <MemoryRouter initialEntries={[`/trips/${owner.tripId}`]}>
          <Routes>
            <Route
              path="/trips/:tripId"
              element={
                <TripOverviewPage client={owner.client} documentsClient={owner.documentsClient} />
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>
  );
}

it('opens all nine actual SQLite sources in one Timeline and only supported whole-source responsibility controls', async () => {
  mount();
  await waitFor(() =>
    expect(
      cache.getQueryData([
        'trips',
        owner.client.getConfig().baseUrl,
        owner.tripId,
        'capture_workspace',
        'overview',
      ])
    ).toMatchObject({
      ideas: [
        expect.objectContaining({
          id: source.idea.id,
          tripId: owner.tripId,
          removedAt: null,
          visitId: source.visit.id,
          name: 'Host idea',
        }),
      ],
      captures: [
        expect.objectContaining({
          id: source.capture.id,
          tripId: owner.tripId,
          removedAt: null,
          visitId: source.visit.id,
          title: null,
          originalText: 'Host capture',
        }),
      ],
    })
  );
  await screen.findByRole('button', { name: 'Host idea' });
  await waitFor(() => expect(screen.queryAllByText(enAU.overview.loading)).toHaveLength(0));
  const cases = [
    { kind: 'visit', name: 'Host city', id: source.visit.id, value: 'Host visit notes' },
    { kind: 'stay', name: 'Host stay', id: source.stay.id, value: 'Host stay' },
    { kind: 'event', name: 'Host event', id: source.event.id, value: 'Host event' },
    { kind: 'journey', name: 'Host journey', id: source.journey.id, value: 'Host journey' },
    { kind: 'decision', name: 'Host decision', id: source.decision.id, value: 'Host decision' },
    { kind: 'rental', name: 'Host rental', id: source.rental.id, value: 'Host rental' },
    { kind: 'meeting', name: 'Host meeting', id: source.meeting.id, value: 'Host meeting' },
    { kind: 'capture', name: 'Host capture', id: source.capture.id, value: 'Host capture' },
    { kind: 'idea', name: 'Host idea', id: source.idea.id, value: 'Host idea' },
  ] as const;
  for (const item of cases) {
    fireEvent.click(await screen.findByRole('button', { name: item.name }));
    const dialog = screen.getByRole('dialog', {
      name: `${enAU.overview.kinds[item.kind]} #${item.id}`,
    });
    if (item.kind === 'capture')
      expect(await within(dialog).findByText(item.value, { exact: true })).toBeVisible();
    else await expectVisibleField(dialog, item.value);
    const responsibility = ['journey', 'stay', 'event', 'rental'].includes(item.kind);
    if (responsibility)
      expect(
        await within(dialog).findByRole('region', { name: enAU.arrangements.handledBy })
      ).toBeVisible();
    else
      expect(
        within(dialog).queryByRole('region', { name: enAU.arrangements.handledBy })
      ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  }
  expect(owner.requests.filter((request) => request.method !== 'GET')).toEqual([]);
  expect(screen.queryByRole('link', { name: 'Calendar' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Documents' })).toHaveAttribute(
    'href',
    `/trips/${owner.tripId}/documents`
  );
}, 60_000);

it('retains the actual Rental draft and independently persists its literal Rental responsibility through the Timeline', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Host rental' }));
  const provider = await screen.findByRole('textbox', { name: enAU.arrangements.provider });
  fireEvent.change(provider, { target: { value: 'Retained rental provider' } });
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  fireEvent.click(screen.getByRole('button', { name: 'Host rental' }));
  expect(await screen.findByRole('textbox', { name: enAU.arrangements.provider })).toHaveValue(
    'Retained rental provider'
  );
  fireEvent.click(screen.getByRole('button', { name: enAU.arrangements.save }));
  await waitFor(() =>
    expect(owner.requests.some((request) => request.method === 'PATCH')).toBe(true)
  );
  await waitFor(async () =>
    expect(
      unwrap(
        await rentalsGet({
          client: owner.client,
          path: { tripId: owner.tripId, id: source.rental.id },
        })
      ).provider
    ).toBe('Retained rental provider')
  );
  const handled = await screen.findByRole('region', { name: enAU.arrangements.handledBy });
  fireEvent.click(await within(handled).findByRole('button', { name: enAU.arrangements.self }));
  await waitFor(async () =>
    expect(
      unwrap(
        await responsibilitiesGet({
          client: owner.client,
          path: { tripId: owner.tripId, targetKind: 'rental', targetId: source.rental.id },
        })
      ).responsibility
    ).toEqual({ kind: 'self' })
  );
  expect(
    owner.requests.filter((request) => request.method === 'PUT').map((request) => request.path)
  ).toEqual([`/trips/${owner.tripId}/responsibilities/rental/${source.rental.id}`]);
  expect(owner.documentsRequests).toEqual([]);
}, 60_000);

async function expectVisibleField(dialog: HTMLElement, value: string) {
  const field = await within(dialog).findByDisplayValue(value);
  const details = field.closest('details');
  if (details && !details.open) {
    const summary = details.querySelector('summary');
    if (!summary) throw new Error('Source disclosure has no summary');
    fireEvent.click(summary);
  }
  expect(field).toBeVisible();
}
