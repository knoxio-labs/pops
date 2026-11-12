import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { unwrap } from '@pops/pillar-sdk/client';

import enAU from './locales/en-AU.json';
import { timelineCreateSession } from './timeline-create-session';
import { timelineProducer } from './timeline-producer-fixture';
import { TripOverviewPage } from './TripOverviewPage';
import { createClient } from './trips-api/client';
import {
  captureWorkspaceGet,
  eventsList,
  journeysList,
  placesCreate,
  placesList,
  rentalsList,
  staysList,
  visitsList,
} from './trips-api/sdk.gen';

let owner: Awaited<ReturnType<typeof timelineProducer>>;
let cache: QueryClient;
const translation = createInstance();
beforeEach(async () => {
  owner = await timelineProducer();
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

function content(client = owner.client) {
  return (
    <I18nextProvider i18n={translation}>
      <QueryClientProvider client={cache}>
        <MemoryRouter initialEntries={[`/trips/${owner.tripId}`]}>
          <Routes>
            <Route
              path="/trips/:tripId"
              element={<TripOverviewPage client={client} documentsClient={owner.documentsClient} />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>
  );
}

function mount() {
  return render(content());
}

async function start(kind: string): Promise<HTMLElement> {
  await screen.findByText(enAU.overview.empty);
  fireEvent.click(await screen.findByRole('button', { name: 'Add to timeline' }));
  const sheet = await screen.findByRole('dialog');
  fireEvent.click(within(sheet).getByRole('button', { name: kind }));
  return sheet;
}

const cases = [
  {
    kind: 'journey',
    label: 'Journey',
    field: 'Name',
    canonical: 'Journey name',
    collection: 'journeys',
  },
  { kind: 'stay', label: 'Stay', field: 'Name', canonical: 'Stay name', collection: 'stays' },
  { kind: 'event', label: 'Event', field: 'Name', canonical: 'Event name', collection: 'events' },
  {
    kind: 'rental',
    label: 'Rental',
    field: 'Provider',
    canonical: enAU.arrangements.provider,
    collection: 'rentals',
  },
] as const;
type NamedKind = (typeof cases)[number]['kind'];

async function createdSources(kind: NamedKind): Promise<{ id: number; title: string | null }[]> {
  const options = { client: owner.client, path: { tripId: owner.tripId } };
  switch (kind) {
    case 'journey':
      return unwrap(await journeysList(options)).journeys.map(({ id, name }) => ({
        id,
        title: name,
      }));
    case 'stay':
      return unwrap(await staysList(options)).stays.map(({ id, name }) => ({ id, title: name }));
    case 'event':
      return unwrap(await eventsList(options)).events.map(({ id, name }) => ({ id, title: name }));
    case 'rental':
      return unwrap(await rentalsList(options)).rentals.map(({ id, provider }) => ({
        id,
        title: provider,
      }));
  }
}

it.each(cases)(
  'creates one persisted $kind from an empty Timeline and continues in its canonical editor in the same Sheet',
  async (item) => {
    mount();
    const sheet = await start(item.label);
    const value = `Explicit ${item.kind} source`;
    fireEvent.change(within(sheet).getByRole('textbox', { name: item.field }), {
      target: { value },
    });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(sheet).toHaveAccessibleName(new RegExp(`^${item.label} #\\d+$`, 'u'))
    );
    const saved = await within(sheet).findByRole('textbox', { name: item.canonical });
    expect(saved).toHaveValue(value);
    expect(screen.getByRole('dialog')).toBe(sheet);
    const sources = await createdSources(item.kind);
    expect(sources).toEqual([{ id: expect.any(Number), title: value }]);
    expect(sheet).toHaveAccessibleName(`${item.label} #${sources[0]?.id}`);
    expect(owner.requests.filter(({ method }) => method !== 'GET')).toEqual([
      {
        method: 'POST',
        path: `/trips/${owner.tripId}/${item.collection}`,
        body: item.kind === 'rental' ? { provider: value } : { name: value },
      },
    ]);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    expect(await screen.findByRole('button', { name: value })).toBeVisible();
  },
  60_000
);

it('creates a Visit only after an explicit existing Place selection and opens its canonical editor without a second POST', async () => {
  const place = unwrap(
    await placesCreate({ client: owner.client, body: { name: 'Explicit existing city' } })
  );
  owner.requests.length = 0;
  mount();
  const sheet = await start('Visit');
  const create = within(sheet).getByRole('button', { name: 'Create' });
  expect(create).toBeDisabled();
  const select = await within(sheet).findByRole('combobox', { name: 'Place' });
  await within(select).findByRole('option', { name: place.name });
  fireEvent.change(select, { target: { value: String(place.id) } });
  fireEvent.click(create);
  await expectCreatedVisit(sheet, place.id, place.name);
  expect(owner.requests.filter(({ method }) => method !== 'GET')).toEqual([
    {
      method: 'POST',
      path: `/trips/${owner.tripId}/visits`,
      body: { placeId: place.id },
    },
  ]);
}, 60_000);

it('creates a reusable Place separately before explicitly creating the Visit, then refreshes the same Timeline', async () => {
  mount();
  const sheet = await start('Visit');
  fireEvent.click(within(sheet).getByRole('button', { name: 'New place' }));
  fireEvent.change(within(sheet).getByRole('textbox', { name: 'Place name' }), {
    target: { value: 'Explicit new city' },
  });
  fireEvent.click(within(sheet).getByRole('button', { name: 'Create place' }));
  const select = await within(sheet).findByRole('combobox', { name: 'Place' });
  const option = await within(select).findByRole('option', {
    name: 'Explicit new city',
  });
  const places = unwrap(await placesList({ client: owner.client })).places;
  expect(places).toHaveLength(1);
  const place = places[0];
  if (!place) throw new Error('The canonical Place receipt is missing');
  expect(option).toHaveValue(String(place.id));
  expect(select).toHaveValue(String(place.id));
  expect(
    unwrap(await visitsList({ client: owner.client, path: { tripId: owner.tripId } })).visits
  ).toEqual([]);
  expect(owner.requests.filter(({ method }) => method !== 'GET')).toEqual([
    {
      method: 'POST',
      path: '/places',
      body: { name: 'Explicit new city' },
    },
  ]);
  fireEvent.click(within(sheet).getByRole('button', { name: 'Create' }));
  await expectCreatedVisit(sheet, place.id, place.name);
  expect(owner.requests.filter(({ method }) => method !== 'GET')).toEqual([
    { method: 'POST', path: '/places', body: { name: 'Explicit new city' } },
    { method: 'POST', path: `/trips/${owner.tripId}/visits`, body: { placeId: place.id } },
  ]);
}, 60_000);

async function expectCreatedVisit(
  sheet: HTMLElement,
  placeId: number,
  name: string
): Promise<void> {
  await waitFor(() => expect(sheet).toHaveAccessibleName(/^Visit #\d+$/u));
  expect(screen.getByRole('dialog')).toBe(sheet);
  expect(within(sheet).queryByRole('button', { name: 'Create' })).not.toBeInTheDocument();
  const sources = unwrap(
    await visitsList({ client: owner.client, path: { tripId: owner.tripId } })
  ).visits;
  expect(sources).toHaveLength(1);
  expect(sources[0]).toMatchObject({ tripId: owner.tripId, placeId });
  const field = await within(sheet).findByRole('combobox', {
    name: enAU.visitWorkspace.city,
  });
  expect(field).toHaveValue(String(placeId));
  fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
  expect(await screen.findByRole('button', { name })).toBeVisible();
}

it('retains a late acknowledged creation without replacing a newer contextual form or dispatching another POST', async () => {
  const held = owner.holdNextStayCreate();
  try {
    mount();
    const first = await start('Stay');
    fireEvent.change(within(first).getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Late-created stay' },
    });
    fireEvent.click(within(first).getByRole('button', { name: 'Create' }));
    await held.committed;
    fireEvent.click(within(first).getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to timeline' }));
    const current = screen.getByRole('dialog');
    fireEvent.click(within(current).getByRole('button', { name: 'Event' }));
    const event = within(current).getByRole('textbox', { name: 'Name' });
    fireEvent.change(event, { target: { value: 'Newer unsaved event' } });
    await act(async () => held.release());
    await screen.findByText('Late-created stay', { exact: true });
    expect(screen.getByRole('dialog')).toBe(current);
    expect(event).toHaveValue('Newer unsaved event');
    expect(within(current).getByRole('button', { name: 'Create' })).toBeEnabled();
    fireEvent.click(within(current).getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to timeline' }));
    const returned = screen.getByRole('dialog');
    fireEvent.click(within(returned).getByRole('button', { name: 'Stay' }));
    fireEvent.click(within(returned).getByRole('button', { name: 'Open created record' }));
    expect(await within(returned).findByRole('textbox', { name: 'Stay name' })).toHaveValue(
      'Late-created stay'
    );
    expect(owner.requests.filter(({ method }) => method !== 'GET')).toEqual([
      {
        method: 'POST',
        path: `/trips/${owner.tripId}/stays`,
        body: { name: 'Late-created stay' },
      },
    ]);
  } finally {
    held.release();
  }
}, 60_000);

function holdPlaceCreate() {
  let announce: (status: number) => void = () => {
    throw new Error('Place response control was not initialized');
  };
  let release: () => void = () => {
    throw new Error('Place response control was not initialized');
  };
  const committed = new Promise<number>((resolve) => {
    announce = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  owner.client.interceptors.response.use(async (response, request) => {
    if (request.method === 'POST' && new URL(request.url).pathname === '/places') {
      announce(response.status);
      await released;
    }
    return response;
  });
  return { committed, release };
}

it('keeps the explicitly selected existing Place when an earlier Place creation is acknowledged after returning to Visit', async () => {
  const placeB = unwrap(
    await placesCreate({ client: owner.client, body: { name: 'Existing Place B' } })
  );
  owner.requests.length = 0;
  const held = holdPlaceCreate();
  try {
    mount();
    const sheet = await start('Visit');
    fireEvent.click(within(sheet).getByRole('button', { name: 'New place' }));
    fireEvent.change(within(sheet).getByRole('textbox', { name: 'Place name' }), {
      target: { value: 'Late Place A' },
    });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Create place' }));
    expect(await held.committed).toBe(201);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Choose another type' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Visit' }));
    const selected = await within(sheet).findByRole('combobox', { name: 'Place' });
    await within(selected).findByRole('option', { name: placeB.name });
    fireEvent.change(selected, { target: { value: String(placeB.id) } });
    await act(async () => {
      held.release();
      await waitFor(() =>
        expect(
          timelineCreateSession(
            cache,
            { tripId: owner.tripId, client: owner.client },
            'place'
          ).snapshot().status
        ).toBe('confirmed')
      );
    });
    expect(selected).toHaveValue(String(placeB.id));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Create' }));
    await expectCreatedVisit(sheet, placeB.id, placeB.name);
    expect(owner.requests.filter(({ method }) => method !== 'GET')).toEqual([
      { method: 'POST', path: '/places', body: { name: 'Late Place A' } },
      { method: 'POST', path: `/trips/${owner.tripId}/visits`, body: { placeId: placeB.id } },
    ]);
  } finally {
    held.release();
  }
}, 60_000);

it('does not open a source acknowledged by the previous client in a newer same-origin client view', async () => {
  const held = owner.holdNextStayCreate();
  try {
    const view = mount();
    const sheet = await start('Stay');
    fireEvent.change(within(sheet).getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Client A acknowledged Stay' },
    });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Create' }));
    await held.committed;
    const clientB = createClient(owner.client.getConfig());
    expect(clientB).not.toBe(owner.client);
    view.rerender(content(clientB));
    const current = await screen.findByRole('dialog');
    const name = within(current).getByRole('textbox', { name: 'Name' });
    fireEvent.change(name, { target: { value: 'Client B unsaved Stay' } });
    await act(async () => {
      held.release();
      await waitFor(() =>
        expect(
          timelineCreateSession(
            cache,
            { tripId: owner.tripId, client: owner.client },
            'stay'
          ).snapshot().status
        ).toBe('confirmed')
      );
    });
    expect(screen.getByRole('dialog')).toBe(current);
    expect(name).toHaveValue('Client B unsaved Stay');
    expect(within(current).queryByRole('textbox', { name: 'Stay name' })).not.toBeInTheDocument();
    expect(within(current).getByRole('button', { name: 'Create' })).toBeEnabled();
    expect(owner.requests.filter(({ method }) => method !== 'GET')).toEqual([
      {
        method: 'POST',
        path: `/trips/${owner.tripId}/stays`,
        body: { name: 'Client A acknowledged Stay' },
      },
    ]);
  } finally {
    held.release();
  }
}, 60_000);

it('creates a direct Idea through the producer receipt without a synthetic Capture and opens its saved fields in the same Sheet', async () => {
  mount();
  const sheet = await start('Idea');
  fireEvent.change(await within(sheet).findByRole('textbox', { name: 'Name' }), {
    target: { value: 'Direct Timeline Idea' },
  });
  fireEvent.click(within(sheet).getByRole('button', { name: 'Create Idea' }));
  expect(await within(sheet).findByRole('textbox', { name: 'Idea name' })).toHaveValue(
    'Direct Timeline Idea'
  );
  expect(screen.getByRole('dialog')).toBe(sheet);
  const source = unwrap(
    await captureWorkspaceGet({ client: owner.client, path: { tripId: owner.tripId } })
  );
  expect(source.captures).toEqual([]);
  expect(source.ideas).toHaveLength(1);
  expect(source.ideas[0]).toMatchObject({
    tripId: owner.tripId,
    name: 'Direct Timeline Idea',
    removedAt: null,
  });
  expect(sheet).toHaveAccessibleName(`Idea #${source.ideas[0]?.id}`);
  expect(owner.requests.filter(({ method }) => method !== 'GET')).toEqual([
    {
      method: 'POST',
      path: `/trips/${owner.tripId}/ideas/create`,
      body: {
        operationId: expect.any(String),
        command: { kind: 'idea.create', input: { name: 'Direct Timeline Idea' } },
      },
    },
  ]);
  fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
  expect(await screen.findByRole('button', { name: 'Direct Timeline Idea' })).toBeVisible();
}, 60_000);

it('recovers the original acknowledged source after returning from a changed origin without a second POST', async () => {
  const originalOrigin = owner.client.getConfig().baseUrl;
  if (!originalOrigin) throw new Error('The actual producer origin is missing');
  const foreignOrigin = `${originalOrigin}/foreign`;
  const held = owner.holdNextStayCreate();
  try {
    const view = mount();
    const sheet = await start('Stay');
    const original = timelineCreateSession(
      cache,
      { tripId: owner.tripId, client: owner.client },
      'stay'
    );
    fireEvent.change(within(sheet).getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Original origin acknowledged Stay' },
    });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Create' }));
    await held.committed;
    const persisted = unwrap(
      await staysList({ client: owner.client, path: { tripId: owner.tripId } })
    ).stays;
    expect(persisted).toHaveLength(1);
    const saved = persisted[0];
    if (!saved) throw new Error('The actual created Stay is missing');
    owner.client.setConfig({ baseUrl: foreignOrigin });
    view.rerender(content(owner.client));
    await waitFor(() =>
      expect(
        cache
          .getQueryCache()
          .findAll({ predicate: (query) => query.queryKey.includes(foreignOrigin) }).length
      ).toBeGreaterThan(0)
    );
    await act(async () => {
      held.release();
      await waitFor(() => expect(original.snapshot().status).toBe('confirmed'));
    });
    expect(original.snapshot().created).toEqual({ kind: 'stay', id: saved.id });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    for (const query of cache
      .getQueryCache()
      .findAll({ predicate: (query) => query.queryKey.includes(foreignOrigin) }))
      expect(query.state.data).toBeUndefined();
    owner.client.setConfig({ baseUrl: originalOrigin });
    view.rerender(content(owner.client));
    fireEvent.click(await screen.findByRole('button', { name: 'Add to timeline' }));
    const returned = screen.getByRole('dialog');
    fireEvent.click(within(returned).getByRole('button', { name: 'Stay' }));
    fireEvent.click(await within(returned).findByRole('button', { name: 'Open created record' }));
    expect(await within(returned).findByRole('textbox', { name: 'Stay name' })).toHaveValue(
      saved.name
    );
    expect(returned).toHaveAccessibleName(`Stay #${saved.id}`);
    expect(
      timelineCreateSession(cache, { tripId: owner.tripId, client: owner.client }, 'stay')
    ).toBe(original);
    expect(owner.requests.filter(({ method }) => method !== 'GET')).toEqual([
      {
        method: 'POST',
        path: `/trips/${owner.tripId}/stays`,
        body: { name: 'Original origin acknowledged Stay' },
      },
    ]);
  } finally {
    held.release();
    owner.client.setConfig({ baseUrl: originalOrigin });
  }
}, 60_000);
