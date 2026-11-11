import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { calendarSnapshot } from '../calendar/test-utils';
import { mountOverview } from './render.test-utils';
import { overviewResponses } from './test-utils';

afterEach(cleanup);

it('embeds existing controlled calendar filters with no nested main, page header or destination', async () => {
  const snapshot = calendarSnapshot();
  const responses = overviewResponses();
  responses.set('/trips/7/journeys', { journeys: snapshot.journeys.map(({ journey }) => journey) });
  responses.set('/trips/7/stays', { stays: snapshot.stays });
  responses.set('/trips/7/events', { events: snapshot.events });
  responses.set('/trips/7/journeys/20/workspace', snapshot.journeys[0]);
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
