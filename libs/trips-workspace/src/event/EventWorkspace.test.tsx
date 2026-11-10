import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { problem } from '../stay/test-utils';
import { eventQueryKey } from './api';
import { EventWorkspace } from './EventWorkspace';
import { eventSource } from './model';
import { eventTransport, sourceEvent } from './test-utils';

const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  caches.forEach((cache) => cache.clear());
  caches.length = 0;
});
function mount(
  transport: ReturnType<typeof eventTransport>,
  identity = { tripId: 7, eventId: 19 }
) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
  caches.push(cache);
  render(
    <QueryClientProvider client={cache}>
      <EventWorkspace {...identity} client={transport.client} />
    </QueryClientProvider>
  );
  return cache;
}
async function edit(label: string, value: string) {
  const field = await screen.findByLabelText(label);
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}
async function saved() {
  await waitFor(() => expect(screen.getByText('Changes saved')).toBeVisible());
}

describe('Source-backed event workspace', () => {
  it('persists Associated visit changes and clearing, moves route placement, and restores association through Undo', async () => {
    const linked = sourceEvent({ visitId: 90 });
    const transport = eventTransport({
      replies: [
        { status: 200, body: linked },
        { status: 200, body: sourceEvent({ visitId: null }) },
        { status: 200, body: linked },
      ],
    });
    mount(transport);
    await screen.findByRole('heading', { name: 'Wellington' });
    fireEvent.change(screen.getByLabelText('Associated visit'), { target: { value: '90' } });
    await saved();
    const route = screen.getByRole('region', { name: 'Event route context' });
    expect(
      within(route)
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent)
    ).toEqual(['North inlet', 'Wellington']);
    expect(route.firstElementChild).toContainElement(
      screen.getByRole('article', { name: 'Event editor' })
    );
    fireEvent.change(screen.getByLabelText('Associated visit'), { target: { value: '' } });
    await saved();
    expect(screen.getByText('No visit linked', { selector: 'p' })).toBeVisible();
    expect(within(route).queryAllByRole('heading', { level: 2 })).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await saved();
    expect(screen.getByLabelText('Associated visit')).toHaveValue('90');
    expect(
      within(route)
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent)
    ).toEqual(['North inlet', 'Wellington']);
    expect(transport.patches).toEqual([{ visitId: 90 }, { visitId: null }, eventSource(linked)]);
  });

  it('preserves an unavailable Associated visit on unrelated edits and only unlinks on explicit selection', async () => {
    const initial = sourceEvent({ visitId: 999 });
    const changed = sourceEvent({ visitId: 999, address: 'East quay' });
    const transport = eventTransport({
      source: initial,
      replies: [
        { status: 200, body: changed },
        { status: 200, body: { ...changed, visitId: null } },
      ],
    });
    mount(transport);
    expect(await screen.findByLabelText('Associated visit')).toHaveValue('999');
    expect(screen.getByRole('option', { name: 'Visit 999 unavailable' })).toBeVisible();
    expect(screen.getByText('Linked visit 999 is unavailable')).toBeVisible();
    await edit('Address', 'East quay');
    await saved();
    expect(screen.getByLabelText('Associated visit')).toHaveValue('999');
    expect(transport.patches).toEqual([{ address: 'East quay' }]);
    fireEvent.change(screen.getByLabelText('Associated visit'), { target: { value: '' } });
    await saved();
    expect(transport.patches).toEqual([{ address: 'East quay' }, { visitId: null }]);
    expect(screen.queryByRole('option', { name: 'Visit 999 unavailable' })).toBeNull();
  });

  it('preserves a draft and its editor through a failed background refresh and recovery', async () => {
    const transport = eventTransport();
    const cache = mount(transport);
    const field = await screen.findByLabelText('Event name');
    fireEvent.change(field, { target: { value: 'Uncommitted event' } });
    transport.failReads();
    const queryKey = eventQueryKey({ tripId: 7, eventId: 19, client: transport.client });
    await act(async () => {
      await cache.refetchQueries({ queryKey });
    });
    expect(await screen.findByText('trips.temporarily_unavailable')).toBeVisible();
    expect(screen.getByLabelText('Event name')).toHaveValue('Uncommitted event');
    expect(screen.getByText('Unsaved changes')).toBeVisible();
    transport.restoreReads();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByText('trips.temporarily_unavailable')).toBeNull());
    expect(screen.getByLabelText('Event name')).toHaveValue('Uncommitted event');
    expect(transport.patches).toEqual([]);
  });
  it('places the editor inside the explicit visit and preserves unknown source timing and opaque references', async () => {
    const transport = eventTransport();
    mount(transport);
    expect(await screen.findByLabelText('Event name')).toHaveValue('Harbour performance');
    const route = screen.getByRole('region', { name: 'Event route context' });
    await waitFor(() =>
      expect(
        within(route)
          .getAllByRole('heading', { level: 2 })
          .map((heading) => heading.textContent)
      ).toEqual(['North inlet', 'Wellington', 'South island'])
    );
    expect(screen.getByLabelText('Start date')).toHaveValue('2029-04-12');
    for (const label of ['End date', 'Start time', 'End time', 'Time zone'])
      expect(screen.getByLabelText(label)).toHaveValue('');
    expect(screen.getByText('pops:contacts/person/venue')).toBeVisible();
    expect(screen.getByText('pops:documents/document/ticket')).toBeVisible();
    expect(screen.getByRole('article', { name: 'Event editor' })).toHaveClass('border-dashed');
    expect(transport.patches).toEqual([]);
  });
  it('saves independent states, gives only Purchased hard styling, and persists Undo', async () => {
    const initial = sourceEvent();
    const arranged = sourceEvent({ arrangement: 'Booked' });
    const purchased = sourceEvent({ arrangement: 'Booked', purchase: 'Purchased' });
    const transport = eventTransport({
      replies: [
        { status: 200, body: arranged },
        { status: 200, body: purchased },
        { status: 200, body: arranged },
      ],
    });
    mount(transport);
    fireEvent.change(await screen.findByLabelText('Arrangement'), { target: { value: 'Booked' } });
    await saved();
    expect(screen.getByRole('article', { name: 'Event editor' })).toHaveClass('border-dashed');
    expect(screen.getByLabelText('Intention')).toHaveValue(initial.intention);
    fireEvent.change(screen.getByLabelText('Purchase'), { target: { value: 'Purchased' } });
    await saved();
    expect(screen.getByRole('article', { name: 'Event editor' })).toHaveClass('border-l-4');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await saved();
    expect(transport.patches).toEqual([
      { arrangement: 'Booked' },
      { purchase: 'Purchased' },
      eventSource(arranged),
    ]);
    expect(screen.getByLabelText('Purchase')).toHaveValue('');
  });
  it('clears only one timing member and retains clocks and zone without deriving dates', async () => {
    const initial = sourceEvent({
      timing: {
        start: '2029-04-12',
        startTime: '19:00',
        endTime: '22:30',
        timeZone: 'Pacific/Auckland',
      },
    });
    const next = sourceEvent({
      timing: { startTime: '19:00', endTime: '22:30', timeZone: 'Pacific/Auckland' },
    });
    const transport = eventTransport({ source: initial, replies: [{ status: 200, body: next }] });
    mount(transport);
    await edit('Start date', '');
    await saved();
    expect(transport.patches).toEqual([{ timing: next.timing }]);
    expect(screen.getByLabelText('Start date')).toHaveValue('');
    expect(screen.getByLabelText('End date')).toHaveValue('');
    expect(screen.getByLabelText('Start time')).toHaveValue('19:00');
  });
  it('keeps failed drafts visible with a safe error and retries the exact explicit patch', async () => {
    const transport = eventTransport({
      replies: [
        { status: 400, body: problem('trips.request.invalid') },
        { status: 200, body: sourceEvent({ address: 'East quay' }) },
      ],
    });
    mount(transport);
    await edit('Address', 'East quay');
    expect(await screen.findByText('trips.request.invalid')).toBeVisible();
    expect(screen.getByLabelText('Address')).toHaveValue('East quay');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await saved();
    expect(transport.patches).toEqual([{ address: 'East quay' }, { address: 'East quay' }]);
  });
  it('does not infer a route for an unlinked event and keeps editing available when context fails', async () => {
    const transport = eventTransport({
      source: sourceEvent({ visitId: null, timing: {} }),
      failContext: true,
    });
    mount(transport);
    expect(await screen.findByLabelText('Event name')).toBeEnabled();
    expect(screen.getByText('No visit linked', { selector: 'p' })).toBeVisible();
    expect(await screen.findAllByText('trips.scope.denied')).toHaveLength(3);
    expect(screen.getByLabelText('Start date')).toHaveValue('');
    expect(screen.queryByRole('heading', { name: 'Wellington' })).toBeNull();
  });
  it('accepts untouched fresh reads but protects unsaved input from background responses', async () => {
    const transport = eventTransport();
    const cache = mount(transport);
    await screen.findByLabelText('Event name');
    const key = eventQueryKey({ tripId: 7, eventId: 19, client: transport.client });
    act(() => cache.setQueryData(key, sourceEvent({ name: 'Fresh source' })));
    await waitFor(() => expect(screen.getByLabelText('Event name')).toHaveValue('Fresh source'));
    fireEvent.change(screen.getByLabelText('Event name'), { target: { value: 'Draft' } });
    act(() => cache.setQueryData(key, sourceEvent({ name: 'Background source' })));
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeVisible());
    expect(screen.getByLabelText('Event name')).toHaveValue('Draft');
  });
  it('adds an opaque reference without hydration and persists its reversible removal', async () => {
    const initial = sourceEvent({ sourceLinks: [] });
    const next = sourceEvent({
      sourceLinks: [{ uri: 'https://source.example/new', label: 'Original source' }],
    });
    const transport = eventTransport({
      source: initial,
      replies: [
        { status: 200, body: next },
        { status: 200, body: initial },
      ],
    });
    mount(transport);
    fireEvent.change(await screen.findByLabelText('Sources URI'), {
      target: { value: 'https://source.example/new' },
    });
    fireEvent.change(screen.getByLabelText('Sources label'), {
      target: { value: 'Original source' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add sources link' }));
    await saved();
    expect(transport.patches).toEqual([{ sourceLinks: next.sourceLinks }]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await saved();
    expect(transport.patches[1]).toEqual(eventSource(initial));
    expect(
      transport.requests.every((request) => new URL(request.url).origin === 'http://event.test')
    ).toBe(true);
  });
  it('rejects invalid identities without requests and exposes missing-record errors without a fabricated editor', async () => {
    const invalid = eventTransport();
    mount(invalid, { tripId: 0, eventId: 19 });
    expect(screen.getByText('trips.identity.invalid')).toBeVisible();
    expect(invalid.requests).toEqual([]);
    cleanup();
    mount(eventTransport({ missing: true }));
    expect(await screen.findByText('trips.record.not_found')).toBeVisible();
    expect(screen.queryByLabelText('Event name')).toBeNull();
  });
});
