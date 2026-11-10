import { cleanup, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TRIPS_PAGES } from '@pops/trips/pages';

import enAU from './locales/en-AU.json';
import ptBR from './locales/pt-BR.json';
import { TripOverviewPage } from './TripOverviewPage';

import type { TripOverviewProps } from '@pops/trips-workspace';

vi.mock('@pops/trips-workspace', () => ({
  TripOverview: ({ calendarLink, documentsHref, labels, href }: TripOverviewProps) => (
    <>
      <a href={href('visit', 31)}>Visit source</a>
      {calendarLink && <a href={calendarLink.href}>{calendarLink.label}</a>}
      {documentsHref && <a href={documentsHref}>{labels.documents}</a>}
    </>
  ),
}));

const translation = createInstance();

beforeEach(async () => {
  await translation.init({
    lng: 'en-AU',
    resources: { 'en-AU': { trips: enAU }, 'pt-BR': { trips: ptBR } },
    interpolation: { escapeValue: false },
  });
});
afterEach(cleanup);

function mount(path: string) {
  render(
    <I18nextProvider i18n={translation}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/:tripId" element={<TripOverviewPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>
  );
}

describe('Trip overview navigation', () => {
  it('links explicit Visit identities to the published owning editor', () => {
    mount('/7');
    const route = TRIPS_PAGES.find((page) => page.bundleSlot === 'trips-visit');
    expect(route).toBeDefined();
    expect(screen.getByRole('link', { name: 'Visit source' })).toHaveAttribute(
      'href',
      `/trips/${route?.path.replace(':tripId', '7').replace(':visitId', '31')}`
    );
  });
  it('links the published Calendar route using the owning trip identity', () => {
    mount('/7');
    const route = TRIPS_PAGES.find((page) => page.bundleSlot === 'trips-calendar');
    expect(route).toBeDefined();
    expect(screen.getByRole('link', { name: 'Calendar' })).toHaveAttribute(
      'href',
      `/trips/${route?.path.replace(':tripId', '7')}`
    );
  });

  it('links the published Documents route using the owning trip identity', () => {
    mount('/7');
    const route = TRIPS_PAGES.find((page) => page.bundleSlot === 'trips-documents');
    expect(route).toBeDefined();
    expect(screen.getByRole('link', { name: 'Documents' })).toHaveAttribute(
      'href',
      `/trips/${route?.path.replace(':tripId', '7')}`
    );
  });

  it('translates the Calendar and Documents labels', async () => {
    await translation.changeLanguage('pt-BR');
    mount('/19');
    expect(screen.getByRole('link', { name: ptBR.overview.documents })).toHaveAttribute(
      'href',
      '/trips/19/documents'
    );
    expect(screen.getByRole('link', { name: ptBR.calendar })).toHaveAttribute(
      'href',
      '/trips/19/calendar'
    );
  });

  it('rejects invalid trip identities before offering source navigation', () => {
    mount('/01');
    expect(screen.getByText('Choose a valid trip')).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
