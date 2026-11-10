import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { CalendarWorkspace } from './CalendarWorkspace';
import { calendarSnapshot, calendarTransport, sourceEvent } from './test-utils';

const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
});
function mount(transport = calendarTransport()) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  const open = vi.fn();
  const view = render(
    <QueryClientProvider client={cache}>
      <CalendarWorkspace tripId={7} client={transport.client} locale="en-AU" onOpenSource={open} />
    </QueryClientProvider>
  );
  return { cache, open, view };
}
async function chooseZone() {
  fireEvent.change(await screen.findByLabelText('Display time zone'), {
    target: { value: 'Pacific/Auckland' },
  });
}

it('requires explicit zone, preserves all source intentions and opens exact owning source IDs directly', async () => {
  const { open } = mount();
  expect(screen.getByText('Loading calendar…')).toBeVisible();
  expect(await screen.findByText('Choose a valid display time zone')).toBeVisible();
  expect(screen.queryByText('Evening exhibition')).toBeNull();
  await chooseZone();
  fireEvent.click(screen.getByRole('button', { name: /Evening exhibition/ }));
  expect(open).toHaveBeenLastCalledWith({ kind: 'event', id: 60 });
  fireEvent.click(screen.getByRole('button', { name: /Harbour connection Departure/ }));
  expect(open).toHaveBeenLastCalledWith({ kind: 'journey', id: 20 });
  fireEvent.click(screen.getByRole('button', { name: /Harbour house Check-in/ }));
  expect(open).toHaveBeenLastCalledWith({ kind: 'stay', id: 30 });
  expect(screen.getByRole('button', { name: /Evening exhibition/ })).toHaveClass('border-dashed');
  expect(screen.getByText(/Start · Alternative · Booked/)).toBeVisible();
  expect(screen.queryByText(/Inspect/)).toBeNull();
  fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'event' } });
  expect(screen.queryByRole('button', { name: /Harbour connection/ })).toBeNull();
  fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2029-06-03' } });
  fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2029-06-01' } });
  expect(screen.getByRole('alert')).toHaveTextContent('Choose a valid date range');
  expect(screen.queryByText('No entries in this range')).toBeNull();
});

it('reports failed required collections with retry and never renders a fake empty calendar', async () => {
  const transport = calendarTransport();
  transport.fail('/trips/7/events');
  mount(transport);
  expect(await screen.findByText('trips.calendar.unavailable')).toBeVisible();
  expect(screen.queryByText('No entries in this range')).toBeNull();
  expect(screen.queryByLabelText('Calendar filters')).toBeNull();
  transport.fail();
  fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
  await chooseZone();
  expect(screen.getByText('Evening exhibition')).toBeVisible();
});

it('retains the last complete snapshot during a failed refresh and preserves chosen controls through retry', async () => {
  const transport = calendarTransport();
  const { cache } = mount(transport);
  await chooseZone();
  fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'event' } });
  transport.fail('/trips/7/journey-groups');
  await act(() => cache.invalidateQueries());
  expect(await screen.findByText(/Showing the last complete read/)).toBeVisible();
  expect(screen.getByText('Evening exhibition')).toBeVisible();
  const next = calendarSnapshot();
  next.events = [sourceEvent({ name: 'Updated source' })];
  transport.setSnapshot(next);
  transport.fail();
  fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
  expect(await screen.findByText('Updated source')).toBeVisible();
  expect(screen.getByLabelText('Kind')).toHaveValue('event');
  expect(screen.getByLabelText('Display time zone')).toHaveValue('Pacific/Auckland');
  expect(screen.queryByText(/Showing the last complete read/)).toBeNull();
});

it('renders unknown source timing and actual journey bounds without classifying a mode from text', async () => {
  const snapshot = calendarSnapshot();
  snapshot.events = [sourceEvent({ timing: {} })];
  mount(calendarTransport(snapshot));
  await chooseZone();
  expect(screen.getByRole('heading', { name: 'Date unknown' })).toBeVisible();
  expect(screen.getByText('Unresolved time')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Journey window'), { target: { value: '20' } });
  expect(
    screen.getByText(/Journey window: 2029-01-31T11:00:00Z → 2029-02-03T11:00:00Z/)
  ).toBeVisible();
  expect(screen.getByText('Evening exhibition')).toBeVisible();
  expect(screen.queryByText(/Flight window/)).toBeNull();
});

it('does not read an invalid source identity', async () => {
  const transport = calendarTransport();
  render(
    <CalendarWorkspace
      tripId={0}
      client={transport.client}
      locale="en-AU"
      onOpenSource={() => {}}
    />
  );
  await waitFor(() => expect(screen.getByText('trips.identity.invalid')).toBeVisible());
  expect(transport.requests).toEqual([]);
});

it('cancels obsolete reads and never replaces a new transport view with a late snapshot', async () => {
  const old = calendarTransport();
  let release = () => {};
  old.wait(
    new Promise<void>((resolve) => {
      release = resolve;
    })
  );
  const { view, cache, open } = mount(old);
  await waitFor(() => expect(old.requests).toHaveLength(4));
  const snapshot = calendarSnapshot();
  snapshot.events = [sourceEvent({ name: 'New origin source' })];
  const current = calendarTransport(snapshot, 'http://calendar-new.test');
  view.rerender(
    <QueryClientProvider client={cache}>
      <CalendarWorkspace tripId={7} client={current.client} locale="en-AU" onOpenSource={open} />
    </QueryClientProvider>
  );
  await chooseZone();
  expect(screen.getByRole('button', { name: 'New origin source Start' })).toBeVisible();
  await act(async () => {
    release();
  });
  expect(old.requests.every(({ signal }) => signal.aborted)).toBe(true);
  expect(screen.queryByRole('button', { name: 'Evening exhibition Start' })).toBeNull();
});
