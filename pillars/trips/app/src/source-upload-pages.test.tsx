import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';

import { createDocumentUploadHost } from './document-upload-host-fixture';
import { EventPage } from './EventPage';
import { JourneyPage } from './JourneyPage';
import { StayPage } from './StayPage';

import type {
  DocumentUploadProviderProps,
  EventWorkspaceProps,
  JourneyWorkspaceProps,
  StayWorkspaceProps,
} from '@pops/trips-workspace';

const provider = vi.hoisted(() => vi.fn());
vi.mock('@pops/trips-workspace', () => ({
  DocumentUploadProvider: (props: DocumentUploadProviderProps) => {
    provider(props);
    return <section aria-label="Upload boundary">{props.children}</section>;
  },
  EventWorkspace: ({ tripId, eventId }: EventWorkspaceProps) => (
    <p>
      Event {tripId}:{eventId}
    </p>
  ),
  StayWorkspace: ({ tripId, stayId }: StayWorkspaceProps) => (
    <p>
      Stay {tripId}:{stayId}
    </p>
  ),
  JourneyWorkspace: ({ tripId, journeyId }: JourneyWorkspaceProps) => (
    <p>
      Journey {tripId}:{journeyId}
    </p>
  ),
}));
afterEach(() => {
  cleanup();
  provider.mockClear();
});

const cases = [
  {
    Page: EventPage,
    route: '/:tripId/events/:eventId',
    path: '/7/events/19',
    source: 'Event 7:19',
  },
  { Page: StayPage, route: '/:tripId/stays/:stayId', path: '/7/stays/13', source: 'Stay 7:13' },
  {
    Page: JourneyPage,
    route: '/:tripId/journeys/:journeyId',
    path: '/7/journeys/20',
    source: 'Journey 7:20',
  },
];

it.each(cases)(
  'binds $source uploads to the exact shell capability and owning Trip',
  ({ Page, route, path, source }) => {
    const host = createDocumentUploadHost('https://source-owner.test');
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={<Page documentUploads={host} />} />
        </Routes>
      </MemoryRouter>
    );
    expect(
      within(screen.getByRole('region', { name: 'Upload boundary' })).getByText(source)
    ).toBeVisible();
    expect(provider).toHaveBeenCalledExactlyOnceWith({
      host,
      tripId: 7,
      children: expect.anything(),
    });
  }
);

it.each(cases)(
  'rejects invalid owning Trip before admitting $source upload authority',
  ({ Page, route, path }) => {
    const host = createDocumentUploadHost('https://source-owner.test');
    render(
      <MemoryRouter initialEntries={[path.replace('/7/', '/0/')]}>
        <Routes>
          <Route path={route} element={<Page documentUploads={host} />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByRole('region', { name: 'Upload boundary' })).not.toBeInTheDocument();
    expect(provider).not.toHaveBeenCalled();
  }
);

it.each(cases)(
  'rejects invalid source before admitting $source upload authority',
  ({ Page, route, path }) => {
    const host = createDocumentUploadHost('https://source-owner.test');
    render(
      <MemoryRouter initialEntries={[path.replace(/\/\d+$/, '/0')]}>
        <Routes>
          <Route path={route} element={<Page documentUploads={host} />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByRole('region', { name: 'Upload boundary' })).not.toBeInTheDocument();
    expect(provider).not.toHaveBeenCalled();
  }
);
