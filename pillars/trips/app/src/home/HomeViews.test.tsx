import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enAU from '../locales/en-AU.json';
import ptBR from '../locales/pt-BR.json';
import { TripPreview } from './TripPreview';
import { TripRows } from './TripRows';

import type { Place, Trip, Visit } from '../api/types';
import type { HomeRecord } from './model';

const translation = createInstance();

beforeEach(async () => {
  await translation.init({
    lng: 'en-AU',
    resources: { 'en-AU': { trips: enAU }, 'pt-BR': { trips: ptBR } },
    interpolation: { escapeValue: false },
  });
});
afterEach(cleanup);

function trip(id: number, overrides: Partial<Trip> = {}): Trip {
  return {
    id,
    name: `Trip ${id}`,
    destination: '',
    when: '',
    parentId: null,
    tagId: null,
    notes: '',
    sourceLinks: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function visit(id: number, timing: Visit['timing'] = {}): Visit {
  return {
    id,
    tripId: 1,
    placeId: id,
    timing,
    notes: '',
    sourceLinks: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

const places: Place[] = [
  {
    id: 1,
    name: 'Paris',
    sourceLinks: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    name: 'Lyon',
    sourceLinks: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

function rows(records: HomeRecord[], allTrips: Trip[] = []) {
  const onSelect = vi.fn();
  render(
    <I18nextProvider i18n={translation}>
      <TripRows
        records={records}
        allTrips={allTrips}
        places={places}
        referenceDate="2026-11-09"
        onSelect={onSelect}
      />
    </I18nextProvider>
  );
  return onSelect;
}

function preview(source: Trip, visits: Visit[] | undefined, allTrips: Trip[] = []) {
  const onBack = vi.fn();
  render(
    <I18nextProvider i18n={translation}>
      <MemoryRouter>
        <TripPreview
          trip={source}
          visits={visits}
          allTrips={allTrips}
          places={places}
          onBack={onBack}
        />
      </MemoryRouter>
    </I18nextProvider>
  );
  return onBack;
}

describe('TripRows', () => {
  it('omits empty route noise and avoids repeating a single place equal to the derived title', () => {
    rows([
      { trip: trip(1, { name: 'Empty' }), visits: [] },
      { trip: trip(2, { name: null, destination: 'Paris' }), visits: [visit(1)] },
    ]);
    expect(screen.getByRole('button', { name: 'Empty' })).toBeVisible();
    expect(screen.getAllByText('Paris')).toHaveLength(1);
    expect(within(screen.getByRole('button', { name: /^Paris/ })).getByText('… → …')).toBeVisible();
    expect(screen.queryByText('No visits')).not.toBeInTheDocument();
    expect(screen.queryByText('Route unavailable')).not.toBeInTheDocument();
  });

  it('retains distinct and repeated ordered place facts and selects the source trip id', async () => {
    const onSelect = rows(
      [
        {
          trip: trip(7, { name: 'Rail', when: 'After graduation', parentId: 9 }),
          visits: [visit(1), visit(2), visit(1)],
        },
      ],
      [trip(9, { name: null, destination: 'France' })]
    );
    const row = screen.getByRole('button', { name: /Rail/ });
    expect(within(row).getByText('Paris → Lyon → Paris')).toBeVisible();
    expect(within(row).getByText('After graduation')).toBeVisible();
    expect(within(row).getByText('Parent: France')).toBeVisible();
    await userEvent.click(row);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(7);
  });

  it('renders nonempty groups in the approved order and keeps source failures neutral', () => {
    rows([
      { trip: trip(1, { name: 'Past' }), visits: [visit(1, { departure: '2026-11-08' })] },
      { trip: trip(2, { name: 'Missing route', parentId: 90 }), visits: undefined },
      { trip: trip(3, { name: 'Next' }), visits: [visit(3, { arrival: '2026-11-10' })] },
      {
        trip: trip(4, { name: 'Now' }),
        visits: [visit(1, { arrival: '2026-11-09', departure: '2026-11-09' })],
      },
    ]);
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    ).toEqual(['Current', 'Upcoming', 'Other', 'Past']);
    expect(screen.getByText('Route unavailable')).toBeVisible();
    expect(screen.getByText('Parent: Parent unavailable')).toBeVisible();
    expect(screen.getByText('Place unavailable')).toBeVisible();
    expect(screen.queryByText(/90|Place 3/)).not.toBeInTheDocument();
  });

  it('shows translated empty results without empty groups', async () => {
    await translation.changeLanguage('pt-BR');
    rows([]);
    expect(screen.getByRole('status')).toHaveTextContent(ptBR.homeRows.empty);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});

describe('TripPreview', () => {
  it('renders only selected source facts and opens the selected calendar and offers the working back action', async () => {
    const onBack = preview(
      trip(4, {
        name: 'Holiday',
        when: 'After the exams',
        parentId: 9,
        notes: 'Keep this source note.',
        sourceLinks: [{ uri: 'pops:documents/document/12', label: 'Private document' }],
      }),
      [visit(2, { arrival: '2026-11-10', departure: '2026-11-12' }), visit(1)],
      [trip(9, { name: 'Family' }), trip(10, { name: 'Unrelated' })]
    );
    expect(screen.getByRole('heading', { name: 'Holiday', level: 1 })).toBeVisible();
    expect(screen.getByText('After the exams')).toBeVisible();
    expect(screen.getByText('Parent: Family')).toBeVisible();
    expect(screen.getByText('Keep this source note.')).toBeVisible();
    const route = screen.getByRole('list');
    expect(
      within(route)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['LyonVisit10 Nov 2026 → 12 Nov 2026', 'ParisVisit… → …']);
    expect(screen.queryByText('Unrelated')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Calendar' })).toHaveAttribute(
      'href',
      '/trips/4/calendar'
    );
    expect(screen.getByRole('link', { name: 'Documents' })).toHaveAttribute(
      'href',
      '/trips/4/documents'
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Trips' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it.each([
    { visits: undefined, message: 'Route unavailable' },
    { visits: [], message: 'No visits' },
  ])('distinguishes $message without inventing route coverage', ({ visits, message }) => {
    preview(trip(1, { parentId: 80 }), visits);
    expect(screen.getByRole('status')).toHaveTextContent(message);
    expect(screen.getByText('Parent: Parent unavailable')).toBeVisible();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Route' })).not.toBeInTheDocument();
  });
});
