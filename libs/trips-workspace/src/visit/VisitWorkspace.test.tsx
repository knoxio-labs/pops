import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { visitQueryKey, visitSource } from './api';
import { sourceEvent, sourceStay, sourceVisit, visitTransport } from './test-utils';
import englishFixture from './translation.test-fixture.json';
import { VisitWorkspace } from './VisitWorkspace';

const locale = createInstance();
await locale.init({
  lng: 'en-AU',
  fallbackLng: 'en-AU',
  resources: {
    'en-AU': { trips: { visitWorkspace: englishFixture } },
  },
  interpolation: { escapeValue: false },
});
const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  void locale.changeLanguage('en-AU');
  caches.splice(0).forEach((cache) => cache.clear());
});
function mount(
  transport: ReturnType<typeof visitTransport>,
  overrides: Partial<Parameters<typeof VisitWorkspace>[0]> = {}
) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
  caches.push(cache);
  render(
    <I18nextProvider i18n={locale}>
      <QueryClientProvider client={cache}>
        <VisitWorkspace tripId={7} visitId={31} client={transport.client} {...overrides} />
      </QueryClientProvider>
    </I18nextProvider>
  );
  return cache;
}
async function edit(label: string, value: string) {
  const input = await screen.findByLabelText(label);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}
async function saved() {
  await waitFor(() => expect(screen.getByText('Changes saved')).toBeVisible());
}
const failure = {
  status: 409,
  body: { code: 'trips.visit.visit_revision_conflict', message: 'Visit changed', retryable: false },
};

describe('Direct visit editing and accommodation workspace', () => {
  it('shows only explicit occurrence associations, all activity intentions and independent purchased styling', async () => {
    const transport = visitTransport({
      stays: [sourceStay(), sourceStay({ id: 14, visitId: 32, name: 'Other occurrence' })],
      events: [
        sourceEvent(),
        sourceEvent({ id: 42, name: 'Purchased event', purchase: 'Purchased' }),
        sourceEvent({ id: 43, visitId: null, name: 'Unplaced event' }),
      ],
    });
    mount(transport);
    expect(await screen.findByRole('heading', { name: 'Cedar guesthouse' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Harbour concert' }).closest('article')).toHaveClass(
      'border-dashed'
    );
    expect(screen.getByRole('heading', { name: 'Purchased event' }).closest('article')).toHaveClass(
      'border-solid'
    );
    expect(screen.getAllByText('Alternative')).toHaveLength(2);
    expect(screen.queryByText('Other occurrence')).toBeNull();
    expect(screen.queryByText('Unplaced event')).toBeNull();
    expect(transport.patches).toEqual([]);
  });
  it('persists only explicit visit timing and revision-guarded Undo without mutating arrangements', async () => {
    const initial = sourceVisit({
      timing: {
        arrival: '2030-04-10',
        departure: '2030-04-16',
        month: { year: 2030, month: 5, part: 'late' },
        duration: { max: 2.5, unit: 'weeks' },
      },
    });
    const changed = {
      ...initial,
      timing: { ...initial.timing, arrival: '2030-04-12' },
      revision: 1,
    };
    const transport = visitTransport({ source: initial });
    transport.patchReplies.push(
      { status: 200, body: changed },
      { status: 200, body: { ...initial, revision: 2 } }
    );
    mount(transport);
    await edit('Arrival', '2030-04-12');
    await saved();
    expect(transport.patches).toEqual([{ timing: changed.timing, expectedRevision: 0 }]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await saved();
    expect(transport.patches).toEqual([
      { timing: changed.timing, expectedRevision: 0 },
      { ...visitSource(initial), expectedRevision: 1 },
    ]);
    expect(screen.getByLabelText('Arrival')).toHaveValue('2030-04-10');
    expect(
      transport.requests
        .filter((request) => request.method !== 'GET')
        .map((request) => new URL(request.url).pathname)
    ).toEqual(['/trips/7/visits/31', '/trips/7/visits/31']);
  });
  it('clears only the selected exact date while retaining approximate and one-sided timing', async () => {
    const initial = sourceVisit({
      timing: {
        arrival: '2030-04-10',
        departure: '2030-04-16',
        month: { year: 2030, month: 5 },
        duration: { min: 0, unit: 'days' },
      },
    });
    const timing = {
      departure: '2030-04-16',
      month: { year: 2030, month: 5 },
      duration: { min: 0, unit: 'days' as const },
    };
    const transport = visitTransport({ source: initial });
    transport.patchReplies.push({ status: 200, body: { ...initial, timing, revision: 1 } });
    mount(transport);
    await edit('Arrival', '');
    await saved();
    expect(transport.patches).toEqual([{ timing, expectedRevision: 0 }]);
    expect(screen.getByLabelText('Arrival')).toHaveValue('');
    expect(screen.getByLabelText('Departure')).toHaveValue('2030-04-16');
    expect(screen.getByLabelText('Minimum duration')).toHaveValue(0);
    expect(screen.getByLabelText('Maximum duration')).toHaveValue(null);
  });

  it('retains a failed draft and retries at its confirmed revision instead of borrowing a foreign read', async () => {
    const transport = visitTransport();
    transport.patchReplies.push(failure, failure);
    const cache = mount(transport);
    await edit('Arrival', '2030-04-11');
    expect(await screen.findByText('Changes have not been saved')).toBeVisible();
    const foreign = sourceVisit({ revision: 7, notes: 'Foreign notes' });
    await act(async () => {
      cache.setQueryData(
        visitQueryKey({ tripId: 7, visitId: 31, client: transport.client }),
        foreign
      );
    });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(transport.patches).toHaveLength(2));
    expect(transport.patches[1]).toEqual(transport.patches[0]);
    expect(screen.getByLabelText('Arrival')).toHaveValue('2030-04-11');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });
  it('invalidates Undo on a foreign canonical refresh and restores no foreign revision', async () => {
    const transport = visitTransport();
    transport.patchReplies.push({
      status: 200,
      body: sourceVisit({ revision: 1, notes: 'Own notes' }),
    });
    const cache = mount(transport);
    await edit('Visit notes', 'Own notes');
    await saved();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
    await act(async () => {
      cache.setQueryData(
        visitQueryKey({ tripId: 7, visitId: 31, client: transport.client }),
        sourceVisit({ revision: 3, notes: 'Foreign notes' })
      );
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled());
    expect(screen.getByLabelText('Visit notes')).toHaveValue('Foreign notes');
  });
  it('retries only association after acknowledged city creation and never recreates or deletes the place on Undo', async () => {
    const initial = sourceVisit();
    const transport = visitTransport();
    transport.patchReplies.push(
      failure,
      { status: 200, body: sourceVisit({ placeId: 53, revision: 1 }) },
      { status: 200, body: sourceVisit({ revision: 2 }) }
    );
    mount(transport);
    fireEvent.click(await screen.findByRole('button', { name: 'New city' }));
    fireEvent.change(screen.getByLabelText('City name'), { target: { value: 'New city' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add city' }));
    expect(await screen.findByText('Changes have not been saved')).toBeVisible();
    expect(transport.creates).toEqual([{ name: 'New city' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await saved();
    expect(transport.patches).toEqual([
      { placeId: 53, expectedRevision: 0 },
      { placeId: 53, expectedRevision: 0 },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await saved();
    expect(transport.patches.at(-1)).toEqual({ ...visitSource(initial), expectedRevision: 1 });
    expect(transport.creates).toHaveLength(1);
    expect(transport.requests.some((request) => request.method === 'DELETE')).toBe(false);
  });
  it('preserves max-only duration and lets unrelated edits persist when optional context is unavailable', async () => {
    const initial = sourceVisit({ timing: { duration: { max: 0, unit: 'days' } } });
    const transport = visitTransport({ source: initial, failContext: true });
    transport.patchReplies.push({
      status: 200,
      body: { ...initial, revision: 1, notes: 'Independent edit' },
    });
    mount(transport);
    expect(await screen.findByLabelText('Minimum duration')).toHaveValue(null);
    expect(screen.getByLabelText('Maximum duration')).toHaveValue(0);
    expect(screen.queryByText(/^No accommodation:/u)).toBeNull();
    await edit('Visit notes', 'Independent edit');
    await saved();
    expect(transport.patches).toEqual([{ notes: 'Independent edit', expectedRevision: 0 }]);
  });
  it('accepts day focus outside visit shortcuts, preserves source dates and selects literal repeated-visit identities', async () => {
    const onViewVisit = vi.fn();
    const transport = visitTransport({
      events: [sourceEvent({ timing: { start: '2031-01-03' } })],
    });
    mount(transport, { onViewVisit });
    fireEvent.change(await screen.findByLabelText('Day'), { target: { value: '2031-01-03' } });
    expect(screen.getByRole('heading', { name: 'Harbour concert' })).toBeVisible();
    fireEvent.change(screen.getByLabelText('Visit'), { target: { value: '32' } });
    expect(onViewVisit).toHaveBeenCalledWith(32);
    expect(transport.patches).toEqual([]);
  });
});

it.each(['Agreed', 'Reserved', 'Purchased'] as const)(
  'counts %s accommodation as covering nights while Purchased alone has a solid boundary',
  async (status) => {
    mount(visitTransport({ stays: [sourceStay({ status, timing: sourceVisit().timing })] }));
    const stay = await screen.findByRole('heading', { name: 'Cedar guesthouse' });
    expect(stay.closest('article')).toHaveClass(
      status === 'Purchased' ? 'border-solid' : 'border-dashed'
    );
    expect(screen.queryByText(/^No accommodation:/u)).toBeNull();
  }
);
it('keeps a dated Considering idea visible without letting it hide missing accommodation', async () => {
  const transport = visitTransport({
    stays: [
      sourceStay({
        status: 'Considering',
        timing: { arrival: '2030-04-08', departure: '2030-04-18' },
      }),
    ],
  });
  mount(transport);
  expect(await screen.findByRole('heading', { name: 'Cedar guesthouse' })).toBeVisible();
  expect(screen.getByText('Considering')).toBeVisible();
  expect(screen.getByText('No accommodation: 10 Apr 2030 – 16 Apr 2030')).toBeVisible();
  expect(screen.getByRole('region', { name: 'Accommodation timeline' })).toHaveTextContent(
    '8 Apr 2030'
  );
  expect(screen.getByRole('region', { name: 'Accommodation timeline' })).toHaveTextContent(
    '18 Apr 2030'
  );
  fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2030-04-08' } });
  expect(screen.queryByText(/^No accommodation:/u)).toBeNull();
  fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2030-04-10' } });
  expect(screen.getByText('No accommodation: 10 Apr 2030 – 16 Apr 2030')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2030-04-16' } });
  expect(screen.queryByText(/^No accommodation:/u)).toBeNull();
  expect(transport.patches).toEqual([]);
});
it('keeps missing accommodation unasserted when a same-visit source has unknown bounds', async () => {
  mount(
    visitTransport({
      stays: [
        sourceStay({ status: 'Considering', timing: sourceVisit().timing }),
        sourceStay({ id: 14, name: 'Undated agreement', status: 'Agreed', timing: {} }),
      ],
    })
  );
  expect(await screen.findByRole('heading', { name: 'Cedar guesthouse' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Undated agreement' })).toBeVisible();
  expect(screen.queryByText(/^No accommodation:/u)).toBeNull();
});
