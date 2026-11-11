import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { unwrap } from '@pops/pillar-sdk/client';

import enAU from './locales/en-AU.json';
import { timelineProducer } from './timeline-producer-fixture';
import { TripOverviewPage } from './TripOverviewPage';
import {
  placesCreate,
  tripsCreate,
  tripsGet,
  tripsUpdate,
  visitsCreate,
  visitsGet,
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

function CurrentPath() {
  return <output aria-label="Current path">{useLocation().pathname}</output>;
}
function mount(tripId = owner.tripId) {
  return render(
    <I18nextProvider i18n={translation}>
      <QueryClientProvider client={cache}>
        <MemoryRouter initialEntries={[`/trips/${tripId}`]}>
          <CurrentPath />
          <Routes>
            <Route
              path="/trips/:tripId"
              element={
                <TripOverviewPage
                  client={owner.client}
                  documentsClient={owner.documentsClient}
                  tagsClient={owner.tagsClient}
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
async function openMetadata() {
  fireEvent.click(await screen.findByRole('button', { name: enAU.settings }));
  const dialog = screen.getByRole('dialog', { name: enAU.settings });
  await within(dialog).findByLabelText(enAU.when);
  return within(dialog);
}
async function closeMetadata() {
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}
function patches() {
  return owner.requests.filter(({ method }) => method === 'PATCH');
}
async function savedTrip(id = owner.tripId) {
  return unwrap(await tripsGet({ client: owner.client, path: { id } }));
}

it('edits the explicitly selected Trip through its owner without adding a metadata destination', async () => {
  const selected = unwrap(
    await tripsCreate({
      client: owner.client,
      body: { name: 'Selected owner trip', destination: 'Selected destination' },
    })
  );
  owner.requests.length = 0;
  mount(selected.id);
  const form = await openMetadata();
  expect(form.getByLabelText(enAU.name)).toHaveValue('Selected owner trip');
  expect(form.getByLabelText(enAU.destination)).toHaveValue('Selected destination');
  expect(form.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Current path')).toHaveTextContent(`/trips/${selected.id}`);
  fireEvent.change(form.getByLabelText(enAU.name), { target: { value: 'Edited selected trip' } });
  fireEvent.click(form.getByRole('button', { name: enAU.save }));
  await waitFor(() => expect(form.getByRole('button', { name: enAU.undo })).toBeEnabled());
  expect((await savedTrip(selected.id)).name).toBe('Edited selected trip');
  expect((await savedTrip()).name).toBeNull();
  expect(patches()).toEqual([
    {
      method: 'PATCH',
      path: `/trips/${selected.id}`,
      body: {
        name: 'Edited selected trip',
        destination: 'Selected destination',
        when: '',
        notes: '',
      },
    },
  ]);
  expect(owner.tagsRequests).toEqual(['/tags']);
  await closeMetadata();
  expect(screen.queryByRole('link', { name: enAU.settings })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: enAU.calendar })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: enAU.overview.documents })).toHaveAttribute(
    'href',
    `/trips/${selected.id}/documents`
  );
}, 60_000);

it('preserves opaque When whitespace and newlines independently of actual route dates', async () => {
  const before = '  after graduation\nperhaps next summer  ';
  const after = '  when the weather settles\n  or after exams  ';
  unwrap(
    await tripsUpdate({ client: owner.client, path: { id: owner.tripId }, body: { when: before } })
  );
  const place = unwrap(await placesCreate({ client: owner.client, body: { name: 'Dated visit' } }));
  const visit = unwrap(
    await visitsCreate({
      client: owner.client,
      path: { tripId: owner.tripId },
      body: {
        placeId: place.id,
        timing: { arrival: '2027-01-02', departure: '2027-01-04' },
      },
    })
  );
  owner.requests.length = 0;
  mount();
  const form = await openMetadata();
  expect(form.getByLabelText(enAU.when)).toHaveValue(before);
  expect(form.getByLabelText(enAU.subtitle).textContent).toBe(before);
  fireEvent.change(form.getByLabelText(enAU.when), { target: { value: after } });
  fireEvent.click(form.getByRole('button', { name: enAU.save }));
  await waitFor(() => expect(form.getByRole('button', { name: enAU.undo })).toBeEnabled());
  expect((await savedTrip()).when).toBe(after);
  expect(form.getByLabelText(enAU.subtitle).textContent).toBe(after);
  expect(
    unwrap(await visitsGet({ client: owner.client, path: { tripId: owner.tripId, id: visit.id } }))
  ).toEqual(visit);
  expect(patches()).toEqual([
    {
      method: 'PATCH',
      path: `/trips/${owner.tripId}`,
      body: { name: null, destination: '', when: after, notes: '' },
    },
  ]);
}, 60_000);

it('retains an unsaved When across sheet remounts without persisting it', async () => {
  mount();
  let form = await openMetadata();
  const draft = '  after the last exam  ';
  fireEvent.change(form.getByLabelText(enAU.when), { target: { value: draft } });
  await closeMetadata();
  form = await openMetadata();
  expect(form.getByLabelText(enAU.when)).toHaveValue(draft);
  expect(patches()).toEqual([]);
  expect((await savedTrip()).when).toBe('');
}, 60_000);

it('retains a lost PATCH reply across sheet remounts and retries the same body', async () => {
  mount();
  let form = await openMetadata();
  const draft = '  after the last exam  ';
  fireEvent.change(form.getByLabelText(enAU.when), { target: { value: draft } });
  owner.loseNextWrite();
  fireEvent.click(form.getByRole('button', { name: enAU.save }));
  await form.findByRole('alert');
  expect(form.getByLabelText(enAU.when)).toHaveValue(draft);
  expect(form.getByRole('button', { name: enAU.undo })).toBeDisabled();
  expect((await savedTrip()).when).toBe(draft);
  expect(patches()).toEqual([
    {
      method: 'PATCH',
      path: `/trips/${owner.tripId}`,
      body: { name: null, destination: '', when: draft, notes: '' },
    },
  ]);
  await closeMetadata();
  form = await openMetadata();
  expect(form.getByLabelText(enAU.when)).toHaveValue(draft);
  const alert = await form.findByRole('alert');
  fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(form.getByRole('button', { name: enAU.undo })).toBeEnabled());
  expect(patches()).toHaveLength(2);
  expect(patches()[0]).toEqual(patches()[1]);
  expect(patches()[0]?.body).toEqual({ name: null, destination: '', when: draft, notes: '' });
  expect((await savedTrip()).when).toBe(draft);
}, 60_000);

it('retains successful metadata Undo across a sheet remount and restores the actual SQLite producer', async () => {
  const original = '  sometime after winter  ';
  unwrap(
    await tripsUpdate({
      client: owner.client,
      path: { id: owner.tripId },
      body: { when: original },
    })
  );
  owner.requests.length = 0;
  mount();
  let form = await openMetadata();
  fireEvent.change(form.getByLabelText(enAU.when), { target: { value: 'Changed plan' } });
  fireEvent.click(form.getByRole('button', { name: enAU.save }));
  await waitFor(() => expect(form.getByRole('button', { name: enAU.undo })).toBeEnabled());
  await closeMetadata();
  form = await openMetadata();
  expect(form.getByLabelText(enAU.when)).toHaveValue('Changed plan');
  expect(form.getByRole('button', { name: enAU.undo })).toBeEnabled();
  fireEvent.click(form.getByRole('button', { name: enAU.undo }));
  await waitFor(() => expect(form.getByLabelText(enAU.when)).toHaveValue(original));
  expect(form.getByRole('button', { name: enAU.undo })).toBeDisabled();
  expect((await savedTrip()).when).toBe(original);
  expect(patches().map(({ body }) => body)).toEqual([
    { name: null, destination: '', when: 'Changed plan', notes: '' },
    { name: null, destination: '', when: original, notes: '' },
  ]);
}, 60_000);

it('shows a failed metadata GET while preserving the retained draft after cache eviction', async () => {
  mount();
  let form = await openMetadata();
  fireEvent.change(form.getByLabelText(enAU.when), {
    target: { value: 'Retained after failed read' },
  });
  await closeMetadata();
  cache.removeQueries({
    queryKey: ['trips', owner.client.getConfig().baseUrl, owner.tripId, 'metadata'],
    exact: true,
  });
  owner.failNextTripRead();
  form = await openMetadata();
  const alert = await form.findByRole('alert');
  expect(form.getByLabelText(enAU.when)).toHaveValue('Retained after failed read');
  expect(patches()).toEqual([]);
  fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(form.queryByRole('alert')).not.toBeInTheDocument());
  expect(form.getByLabelText(enAU.when)).toHaveValue('Retained after failed read');
  expect((await savedTrip()).when).toBe('');
}, 60_000);
