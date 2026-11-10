import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';

import { Button } from '@pops/ui';

import { VisitPage } from './VisitPage';

import type { JSX } from 'react';

import type { VisitWorkspaceProps } from '@pops/trips-workspace';

vi.mock('@pops/trips-workspace', () => ({
  VisitWorkspace: ({
    tripId,
    visitId,
    onViewVisit,
    onViewStay,
    onViewEvent,
  }: VisitWorkspaceProps): JSX.Element => (
    <div>
      <p>{`Visit ${tripId}:${visitId}`}</p>
      <Button onClick={() => onViewVisit?.(32)}>Other occurrence</Button>
      <Button onClick={() => onViewStay?.(13)}>Stay</Button>
      <Button onClick={() => onViewEvent?.(41)}>Event</Button>
    </div>
  ),
}));
afterEach(cleanup);
function Location(): JSX.Element {
  return <p>{useLocation().pathname}</p>;
}
function mount(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Location />
      <Routes>
        <Route path="/trips/:tripId/visits/:visitId" element={<VisitPage />} />
        <Route path="/trips/:tripId/stays/:stayId" element={<p>Stay source</p>} />
        <Route path="/trips/:tripId/events/:eventId" element={<p>Event source</p>} />
      </Routes>
    </MemoryRouter>
  );
}
it('passes literal source IDs and navigates repeated occurrences and accommodation through their source routes', async () => {
  mount('/trips/7/visits/31');
  expect(screen.getByText('Visit 7:31')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Other occurrence' }));
  expect(screen.getByText('/trips/7/visits/32')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Stay' }));
  expect(screen.getByText('/trips/7/stays/13')).toBeVisible();
});
it('opens an activity through its literal source route', async () => {
  mount('/trips/7/visits/31');
  await userEvent.click(screen.getByRole('button', { name: 'Event' }));
  expect(screen.getByText('/trips/7/events/41')).toBeVisible();
});
it.each(['/trips/0/visits/31', '/trips/7/visits/invalid', '/trips/7/visits/9007199254740992'])(
  'rejects invalid route identity %s without mounting an editable source',
  (path) => {
    mount(path);
    expect(screen.getByRole('heading', { name: 'Choose a valid trip and visit' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Other occurrence' })).toBeNull();
  }
);
