import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TRIPS_PAGES } from '@pops/trips/pages';

import enAU from './locales/en-AU.json';
import ptBR from './locales/pt-BR.json';
import { bundles } from './routes';
import { TripCalendarPage, TripOverviewPage } from './TripOverviewPage';
import { createClient } from './trips-api/client';

import type { ReactNode } from 'react';

import type { ContactsHostCapability } from '@pops/pillar-sdk';
import type {
  AccommodationGapContext,
  EventWorkspaceProps,
  OverviewSource,
  OverviewTool,
  StayWorkspaceProps,
  TripOverviewProps,
  VisitWorkspaceProps,
  ArrangementResponsibilityFieldProps,
} from '@pops/trips-workspace';

import type { CaptureContextProps } from './CaptureContext';
import type { PeopleContextProps } from './PeopleContext';

const observed = vi.hoisted(() => ({
  overview: vi.fn<(props: TripOverviewProps) => void>(),
  accommodation: vi.fn<(props: Parameters<typeof AccommodationGapContext>[0]) => void>(),
  stay: vi.fn<(props: StayWorkspaceProps) => void>(),
  event: vi.fn<(props: EventWorkspaceProps) => void>(),
  responsibility: vi.fn<(props: ArrangementResponsibilityFieldProps) => void>(),
  capture: vi.fn<(props: CaptureContextProps) => void>(),
  people: vi.fn<(props: PeopleContextProps) => void>(),
}));
vi.mock('@pops/trips-workspace', () => ({
  AccommodationGapProvider: ({ children }: { children: ReactNode }) => children,
  AccommodationGapContext: (props: Parameters<typeof AccommodationGapContext>[0]) => {
    observed.accommodation(props);
    return null;
  },
  formatTripDate: (value: string, locale: string) => `${locale}:${value}`,
  ArrangementResponsibilityProvider: ({ children }: { children: ReactNode }) => children,
  ArrangementResponsibilityField: (props: ArrangementResponsibilityFieldProps) => {
    observed.responsibility(props);
    return (
      <p>
        Handled by {props.target.targetKind} {props.target.targetId}
      </p>
    );
  },
  useTripRoute: () => ({}),
  TripOverview: (props: TripOverviewProps) => {
    observed.overview(props);
    const sources: OverviewSource[] = [
      { kind: 'visit', id: 31 },
      { kind: 'stay', id: 42 },
      { kind: 'event', id: 53 },
      { kind: 'journey', id: 64 },
      { kind: 'decision', id: 75 },
      { kind: 'rental', id: 86 },
      { kind: 'meeting', id: 97 },
      { kind: 'capture', id: 108 },
      { kind: 'idea', id: 119 },
    ];
    const tools: OverviewTool[] = ['people', 'capture', 'inbox', 'explore'];
    return (
      <>
        <main>
          <h1>Timeline {props.tripId}</h1>
          {props.controls}
          {props.renderVisitContext?.({ tripId: props.tripId, visitId: 31 })}
          {sources.map((source) => (
            <button key={source.kind} onClick={() => props.onOpenSource?.(source)}>
              Open {source.kind}
            </button>
          ))}
          {tools.map((tool) => (
            <button key={tool} onClick={() => props.onOpenTool?.(tool)}>
              Tool {tool}
            </button>
          ))}
          <a href={props.documentsHref}>{props.labels.documents}</a>
        </main>
        {props.contextualEditor}
      </>
    );
  },
  VisitWorkspace: (props: VisitWorkspaceProps) => (
    <button onClick={() => props.onViewStay?.(42)}>Visit {props.visitId}</button>
  ),
  StayWorkspace: (props: StayWorkspaceProps) => {
    observed.stay(props);
    return (
      <p>
        Stay {props.stayId}: {props.formatNights(1)}
      </p>
    );
  },
  EventWorkspace: (props: EventWorkspaceProps) => {
    observed.event(props);
    return <p>Event {props.eventId}</p>;
  },
  JourneyWorkspace: ({ journeyId }: { journeyId: number }) => <p>Journey {journeyId}</p>,
  DecisionWorkspace: ({ decisionId }: { decisionId: number }) => <p>Decision {decisionId}</p>,
}));
vi.mock('./CaptureContext', () => ({
  CaptureContext: (props: CaptureContextProps) => {
    observed.capture(props);
    return (
      <p>
        Capture context{' '}
        {props.selectedSource
          ? `${props.selectedSource.kind} ${props.selectedSource.id}`
          : props.view}
      </p>
    );
  },
}));
vi.mock('./PeopleContext', () => ({
  PeopleContext: (props: PeopleContextProps) => {
    observed.people(props);
    return <p>{props.meetingId === undefined ? 'People context' : `Meeting ${props.meetingId}`}</p>;
  },
}));
vi.mock('./TimelineRental', () => ({
  TimelineRental: ({ id }: { id: number }) => <p>Rental {id}</p>,
}));
vi.mock('./settings/TripSettingsPage', () => ({
  TripSettingsContext: ({ tripId }: { tripId: number }) => <p>Metadata {tripId}</p>,
}));

const translation = createInstance();
beforeEach(async () => {
  vi.clearAllMocks();
  await translation.init({
    lng: 'en-AU',
    resources: { 'en-AU': { trips: enAU }, 'pt-BR': { trips: ptBR } },
    interpolation: { escapeValue: false },
  });
});
afterEach(cleanup);

function mount(path: string, props: Parameters<typeof TripOverviewPage>[0] = {}) {
  return render(
    <I18nextProvider i18n={translation}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/:tripId" element={<TripOverviewPage {...props} />} />
          <Route path="/:tripId/calendar" element={<TripCalendarPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>
  );
}

describe('Selected Trip Timeline host', () => {
  it('opens only the acknowledged Stay for the exact accommodation owner and Visit', () => {
    const client = createClient({ baseUrl: 'https://gap-owner.invalid' });
    mount('/7', { client });
    const context = observed.accommodation.mock.lastCall?.[0];
    expect(context?.identity).toEqual({ tripId: 7, client });
    expect(context?.visitId).toBe(31);
    expect(context?.labels.accommodationMissing).toBe(enAU.arrangements.accommodationMissing);
    expect(context?.formatDate('2027-01-02')).toBe('en-AU:2027-01-02');
    act(() => context?.onOpenStay({ tripId: 8, visitId: 31, stayId: 147 }));
    act(() => context?.onOpenStay({ tripId: 7, visitId: 32, stayId: 147 }));
    expect(observed.stay).not.toHaveBeenCalled();
    act(() => context?.onOpenStay({ tripId: 7, visitId: 31, stayId: 147 }));
    expect(observed.stay.mock.lastCall?.[0]).toMatchObject({ tripId: 7, stayId: 147, client });
    expect(screen.getByRole('dialog', { name: 'Stay #147' })).toBeVisible();
    expect(
      observed.overview.mock.lastCall?.[0].renderVisitContext?.({ tripId: 8, visitId: 31 })
    ).toBeNull();
  });
  it('keeps a newer source selection when an earlier accommodation create completes', async () => {
    mount('/7');
    const context = observed.accommodation.mock.lastCall?.[0];
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open event' }));
    act(() => context?.onOpenStay({ tripId: 7, visitId: 31, stayId: 147 }));
    expect(observed.stay).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Event #53' })).toBeVisible();
  });
  it('rejects an old accommodation acknowledgement after the client changes origin', () => {
    const client = createClient({ baseUrl: 'https://original-gap.invalid' });
    mount('/7', { client });
    const context = observed.accommodation.mock.lastCall?.[0];
    client.setConfig({ baseUrl: 'https://changed-gap.invalid' });
    act(() => context?.onOpenStay({ tripId: 7, visitId: 31, stayId: 147 }));
    expect(observed.stay).not.toHaveBeenCalled();
    expect(screen.getByText(enAU.overview.status.connectionChanged)).toBeVisible();
  });
  it('rejects a stale source opener after the owning client changes origin', () => {
    const client = createClient({ baseUrl: 'https://first.invalid' });
    mount('/7', { client });
    const open = observed.overview.mock.lastCall?.[0].onOpenSource;
    client.setConfig({ baseUrl: 'https://second.invalid' });
    act(() => open?.({ kind: 'stay', id: 42 }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(enAU.overview.status.connectionChanged)).toBeVisible();
    expect(observed.stay).not.toHaveBeenCalled();
  });
  it('offers Documents as the only separate Trip shortcut and preserves source routes', () => {
    mount('/7');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Documents' })).toHaveAttribute(
      'href',
      '/trips/7/documents'
    );
    expect(observed.overview.mock.lastCall?.[0].calendarLink).toBeUndefined();
    expect(observed.overview.mock.lastCall?.[0].href?.('visit', 31)).toBe('/trips/7/visits/31');
    expect(TRIPS_PAGES.find((page) => page.bundleSlot === 'trips-visit')).toBeDefined();
  });
  it('keeps metadata editing in the owning Trip context', async () => {
    mount('/7');
    await userEvent.click(screen.getByRole('button', { name: enAU.settings }));
    expect(screen.getByRole('dialog', { name: enAU.settings })).toBeVisible();
    expect(screen.getByText('Metadata 7')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Timeline 7', hidden: true })).toBeInTheDocument();
  });

  it('toggles the controlled calendar within the Timeline and retains its explicit selections', async () => {
    const user = userEvent.setup();
    mount('/7');
    expect(observed.overview.mock.lastCall?.[0].calendar).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Calendar' }));
    expect(observed.overview.mock.lastCall?.[0].calendar?.selection).toEqual({
      from: '',
      to: '',
      zone: '',
      kind: 'all',
      journey: '',
    });
    act(() =>
      observed.overview.mock.lastCall?.[0].calendar?.onChange({
        from: '2027-01-02',
        to: '2027-01-04',
        zone: 'Australia/Sydney',
        kind: 'stay',
        journey: '',
      })
    );
    await user.click(screen.getByRole('button', { name: 'Calendar' }));
    expect(observed.overview.mock.lastCall?.[0].calendar).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Calendar' }));
    expect(observed.overview.mock.lastCall?.[0].calendar?.selection).toEqual({
      from: '2027-01-02',
      to: '2027-01-04',
      zone: 'Australia/Sydney',
      kind: 'stay',
      journey: '',
    });
    expect(screen.getByRole('heading', { name: 'Timeline 7' })).toBeVisible();
  });

  it('preserves the Calendar URL as the same Timeline with its filter enabled', () => {
    mount('/19/calendar');
    expect(screen.getByRole('heading', { name: 'Timeline 19' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Calendar' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(observed.overview.mock.lastCall?.[0].calendar).toBeDefined();
  });

  it('resolves the legacy Arrangements slot to the same selected-Trip host', () => {
    expect(bundles['trips-arrangements']).toBe(bundles['trips-overview']);
    for (const path of [':tripId/people', ':tripId/inbox', ':tripId/explore'])
      expect(TRIPS_PAGES.map((page) => page.path)).not.toContain(path);
  });

  it.each([
    ['visit', 'Visit 31'],
    ['stay', 'Stay 42: 1 night'],
    ['event', 'Event 53'],
    ['journey', 'Journey 64'],
    ['decision', 'Decision 75'],
    ['rental', 'Rental 86'],
    ['meeting', 'Meeting 97'],
    ['capture', 'Capture context capture 108'],
    ['idea', 'Capture context idea 119'],
  ])('opens the exact %s canonical editor inside the owning Timeline', async (kind, content) => {
    mount('/7');
    await userEvent.click(screen.getByRole('button', { name: `Open ${kind}` }));
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.getByText(content)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Timeline 7', hidden: true })).toBeInTheDocument();
  });

  it('forwards literal owner transports and capabilities through contextual source jumps', async () => {
    const client = createClient({ baseUrl: 'https://trips.invalid' });
    const documentsClient = createClient({ baseUrl: 'https://documents.invalid' });
    const contacts: ContactsHostCapability = { createIntent: () => ({ Chooser: () => null }) };
    mount('/7', { client, documentsClient, contacts });
    await userEvent.click(screen.getByRole('button', { name: 'Open visit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Visit 31' }));
    expect(observed.stay.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        tripId: 7,
        stayId: 42,
        client,
        documentsClient,
        contacts,
      })
    );
    expect(screen.getByRole('dialog', { name: 'Stay #42' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(['people', 'capture', 'inbox', 'explore'])(
    'mounts %s as a contextual tool without another Trip destination',
    async (tool) => {
      mount('/7');
      await userEvent.click(screen.getByRole('button', { name: `Tool ${tool}` }));
      expect(screen.getByRole('dialog')).toBeVisible();
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
      expect(
        screen.getByText(tool === 'people' ? 'People context' : `Capture context ${tool}`)
      ).toBeVisible();
    }
  );

  it('translates contextual labels and night counts through the active host locale', async () => {
    await translation.changeLanguage('pt-BR');
    mount('/19');
    expect(screen.getByRole('link', { name: ptBR.overview.documents })).toHaveAttribute(
      'href',
      '/trips/19/documents'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open stay' }));
    expect(screen.getByRole('dialog', { name: 'Hospedagem #42' })).toBeVisible();
    expect(screen.getByText('Stay 42: 1 noite')).toBeVisible();
  });

  it.each([
    ['en-AU', enAU],
    ['pt-BR', ptBR],
  ])('translates the controlled calendar diagnostics for %s', async (language, resource) => {
    await translation.changeLanguage(language);
    mount('/7');
    const labels = observed.overview.mock.lastCall?.[0].labels;
    expect(labels?.status('calendar')).toBe(resource.calendar);
    for (const key of ['zone', 'range', 'window', 'empty'] as const)
      expect(labels?.status(`calendar.${key}`)).toBe(resource.overview.status.calendar[key]);
  });

  it.each(['01', '0', '-1', '1.5', 'not-an-id'])(
    'rejects invalid owning Trip %s before mounting workspaces or controls',
    (id) => {
      mount(`/${id}`);
      expect(screen.getByText('Choose a valid trip')).toBeVisible();
      expect(observed.overview).not.toHaveBeenCalled();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    }
  );
});
