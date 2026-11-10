import { cleanup, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';

import enAU from './locales/en-AU.json';
import ptBR from './locales/pt-BR.json';
import { StayPage } from './StayPage';

vi.mock('@pops/trips-workspace', () => ({
  StayWorkspace: ({ formatNights }: { formatNights: (count: number) => string }) => (
    <section>
      <span>{formatNights(1)}</span>
      <span>{formatNights(2)}</span>
    </section>
  ),
}));
afterEach(cleanup);
it.each([
  ['en-AU', '1 night', '2 nights'],
  ['pt-BR', '1 noite', '2 noites'],
])(
  'supplies the active %s plural resources through the actual Stay route adapter',
  async (lng, singular, plural) => {
    const i18n = createInstance();
    await i18n.init({
      lng,
      fallbackLng: false,
      resources: { 'en-AU': { trips: enAU }, 'pt-BR': { trips: ptBR } },
    });
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/trips/7/stays/13']}>
          <Routes>
            <Route path="/trips/:tripId/stays/:stayId" element={<StayPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    );
    expect(screen.getByText(singular)).toBeVisible();
    expect(screen.getByText(plural)).toBeVisible();
  }
);
