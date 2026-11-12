import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { calendarSnapshot } from '../calendar/test-utils';
import { mountOverview } from './render.test-utils';
import { overviewResponses } from './test-utils';

afterEach(cleanup);

it('embeds existing controlled calendar filters with no nested main, page header or destination', async () => {
  const responses = calendarResponses();
  const onChange = vi.fn();
  const onOpenSource = vi.fn();
  const selection = {
    from: '',
    to: '',
    zone: 'Pacific/Auckland',
    kind: 'all' as const,
    journey: '',
  };
  mountOverview(responses, undefined, { calendar: { selection, onChange }, onOpenSource });
  const filters = await screen.findByRole('region', { name: 'Calendar filters' });
  expect(screen.getAllByRole('main')).toHaveLength(1);
  expect(screen.queryByRole('heading', { name: 'Trip calendar' })).not.toBeInTheDocument();
  fireEvent.change(within(filters).getByLabelText('From date'), {
    target: { value: '2029-02-01' },
  });
  expect(onChange).toHaveBeenLastCalledWith({ ...selection, from: '2029-02-01' });
  const results = await screen.findByRole('region', { name: 'Calendar results' });
  fireEvent.click(within(results).getByRole('button', { name: /Evening exhibition Start/ }));
  expect(onOpenSource).toHaveBeenLastCalledWith({ kind: 'event', id: 60 });
});

it('preserves the authoritative selected window and zone through host-controlled changes and removal', async () => {
  const selection = {
    from: '',
    to: '',
    zone: 'Pacific/Auckland',
    kind: 'all' as const,
    journey: '20',
  };
  const onChange = vi.fn();
  const view = mountOverview(calendarResponses(), undefined, {
    calendar: { selection, onChange },
    onOpenSource: vi.fn(),
  });
  expect(
    await screen.findByText(
      'Display zone: Pacific/Auckland · Journey window: 2029-01-31T11:00:00Z → 2029-02-03T11:00:00Z (exclusive)'
    )
  ).toBeVisible();
  fireEvent.change(screen.getByLabelText('Display time zone'), { target: { value: 'UTC' } });
  expect(onChange).toHaveBeenLastCalledWith({ ...selection, zone: 'UTC' });
  const changed = { ...selection, zone: 'UTC' };
  view.rerender({ calendar: { selection: changed, onChange } });
  expect(
    screen.getByText(
      'Display zone: UTC · Journey window: 2029-01-31T11:00:00Z → 2029-02-03T11:00:00Z (exclusive)'
    )
  ).toBeVisible();
  fireEvent.change(screen.getByLabelText('Journey window'), { target: { value: '' } });
  expect(onChange).toHaveBeenLastCalledWith({ ...changed, journey: '' });
  view.rerender({ calendar: { selection: { ...changed, journey: '' }, onChange } });
  expect(screen.getByText('Display zone: UTC')).toBeVisible();
  expect(screen.queryByText(/Journey window:/)).not.toBeInTheDocument();
});

it.each([
  { zone: '', from: '', to: '', journey: '20', problem: 'zone' },
  { zone: 'Not/AZone', from: '', to: '', journey: '20', problem: 'zone' },
  { zone: 'UTC', from: '2029-02-03', to: '2029-02-01', journey: '20', problem: 'range' },
  { zone: 'UTC', from: '', to: '', journey: '999', problem: 'window' },
])(
  'does not present active window/zone context for invalid selection %j',
  async ({ problem, ...selection }) => {
    mountOverview(calendarResponses(), undefined, {
      calendar: { selection: { ...selection, kind: 'all' }, onChange: vi.fn() },
      onOpenSource: vi.fn(),
    });
    expect(await screen.findByText(`calendar.${problem}`)).toBeVisible();
    expect(screen.queryByText(/Display zone:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Journey window:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Calendar results' })).not.toBeInTheDocument();
  }
);

it('keeps unavailable canonical journey timing diagnostic instead of manufacturing a window', async () => {
  const snapshot = calendarSnapshot();
  snapshot.journeys = snapshot.journeys.map((row) => ({
    ...row,
    timing: { ...row.timing, window: null },
  }));
  mountOverview(calendarResponses(snapshot), undefined, {
    calendar: {
      selection: { from: '', to: '', zone: 'UTC', kind: 'all', journey: '20' },
      onChange: vi.fn(),
    },
    onOpenSource: vi.fn(),
  });
  expect(await screen.findByText('calendar.window')).toBeVisible();
  expect(screen.queryByText(/Display zone:/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Journey window:/)).not.toBeInTheDocument();
  expect(screen.getByLabelText('Journey window')).toHaveValue('20');
  expect(screen.getByRole('option', { name: 'Harbour connection' })).toBeDisabled();
});

function calendarResponses(snapshot = calendarSnapshot()) {
  const responses = overviewResponses();
  responses.set('/trips/7/journeys', { journeys: snapshot.journeys.map(({ journey }) => journey) });
  responses.set('/trips/7/stays', { stays: snapshot.stays });
  responses.set('/trips/7/events', { events: snapshot.events });
  responses.set('/trips/7/journeys/20/workspace', snapshot.journeys[0]);
  return responses;
}

it('does not present a selected window or display-zone context without its complete source read', async () => {
  const responses = calendarResponses();
  responses.delete('/trips/7/journeys/20/workspace');
  mountOverview(responses, undefined, {
    calendar: {
      selection: { from: '', to: '', zone: 'UTC', kind: 'all', journey: '20' },
      onChange: vi.fn(),
    },
    onOpenSource: vi.fn(),
  });
  const calendar = await screen.findByRole('region', { name: 'calendar' });
  expect(await within(calendar).findByText('trips.source.unavailable')).toBeVisible();
  expect(within(calendar).queryByText(/Display zone:/)).not.toBeInTheDocument();
  expect(within(calendar).queryByText(/Journey window:/)).not.toBeInTheDocument();
  expect(
    within(calendar).queryByRole('region', { name: 'Calendar filters' })
  ).not.toBeInTheDocument();
});
