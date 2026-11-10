import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';

import { CalendarPage } from './CalendarPage';

import type { CalendarWorkspaceProps } from '@pops/trips-workspace';

vi.mock('@pops/trips-workspace', () => ({
  CalendarWorkspace: (props: CalendarWorkspaceProps) => (
    <>
      <button onClick={() => props.onOpenSource({ kind: 'journey', id: 20 })}>
        Journey {props.tripId}
      </button>
      <button onClick={() => props.onOpenSource({ kind: 'stay', id: 30 })}>Stay</button>
      <button onClick={() => props.onOpenSource({ kind: 'event', id: 60 })}>Event</button>
    </>
  ),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
    i18n: { resolvedLanguage: 'en-AU', language: 'en' },
  }),
}));
afterEach(cleanup);

function Location() {
  return <p>{useLocation().pathname}</p>;
}
function mount(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/trips/:tripId/calendar" element={<CalendarPage />} />
        <Route path="*" element={<Location />} />
      </Routes>
    </MemoryRouter>
  );
}
it.each([
  { button: 'Journey 7', path: '/trips/7/journeys/20' },
  { button: 'Stay', path: '/trips/7/stays/30' },
  { button: 'Event', path: '/trips/7/events/60' },
])('opens the exact $button source route', async ({ button, path }) => {
  mount('/trips/7/calendar');
  screen.getByRole('button', { name: button }).click();
  expect(await screen.findByText(path)).toBeVisible();
});
it.each(['0', '-1', '7.5', 'not-an-id'])(
  'rejects the invalid trip identity %s before mounting a source',
  (id) => {
    mount(`/trips/${id}/calendar`);
    expect(screen.getByText('trips.identity.invalid')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Stay' })).toBeNull();
  }
);
