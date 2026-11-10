import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, it } from 'vitest';

import { VisitWorkspace } from '@pops/trips-workspace';

import enAU from './locales/en-AU.json';
import ptBR from './locales/pt-BR.json';
import { createClient } from './trips-api/client';

import type {
  VisitsGetResponses,
  StaysListResponses,
  EventsListResponses,
} from './trips-api/types.gen';

const timestamp = '2030-01-01T00:00:00Z';
const visit: VisitsGetResponses[200] = {
  id: 31,
  tripId: 7,
  placeId: 51,
  revision: 0,
  timing: { arrival: '2030-04-15', departure: '2030-04-12' },
  notes: '',
  sourceLinks: [{ uri: 'urn:source:visit' }],
  createdAt: timestamp,
  updatedAt: timestamp,
};
const stays: StaysListResponses[200] = {
  stays: [
    {
      id: 13,
      tripId: 7,
      visitId: 31,
      name: null,
      kind: 'hotel',
      status: 'Reserved',
      timing: { arrival: '2030-04-10', departure: '2030-04-13' },
      address: null,
      reference: null,
      notes: '',
      sourceLinks: [],
      hostLinks: [],
      documentLinks: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
};
const events: EventsListResponses[200] = {
  events: [
    {
      id: 41,
      tripId: 7,
      visitId: 31,
      name: 'Harbour concert',
      intention: 'Alternative',
      arrangement: 'Not needed',
      purchase: 'Purchased',
      timing: { start: '2030-04-13' },
      address: null,
      reference: null,
      sourceUrl: null,
      ticketUrl: null,
      notes: '',
      sourceLinks: [],
      venueLinks: [],
      organiserLinks: [],
      documentLinks: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
};
const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  caches.splice(0).forEach((cache) => cache.clear());
});

it('loads Visit directly with real Portuguese translations and reacts to host language changes', async () => {
  const locale = createInstance();
  await locale.init({
    lng: 'pt-BR',
    fallbackLng: 'en-AU',
    resources: {
      'en-AU': { trips: enAU },
      'pt-BR': { trips: ptBR },
    },
    interpolation: { escapeValue: false },
  });
  const writes: Request[] = [];
  let currentVisit = visit;
  let currentStays = stays;
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method !== 'GET') writes.push(request);
    const path = new URL(request.url).pathname;
    const sources: Record<string, unknown> = {
      '/trips/7/visits/31': currentVisit,
      '/trips/7/visits': { visits: [currentVisit] },
      '/trips/7/stays': currentStays,
      '/trips/7/events': events,
      '/places': {
        places: [
          {
            id: 51,
            name: 'Wellington',
            sourceLinks: [],
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      },
      '/trips/7': {
        id: 7,
        name: 'Coast trip',
        destination: '',
        when: '',
        parentId: null,
        tagId: null,
        notes: '',
        sourceLinks: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    };
    return new Response(JSON.stringify(sources[path]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  render(
    <I18nextProvider i18n={locale}>
      <QueryClientProvider client={cache}>
        <VisitWorkspace
          tripId={7}
          visitId={31}
          client={createClient({ baseUrl: 'http://trips.test', fetch: fetcher })}
        />
      </QueryClientProvider>
    </I18nextProvider>
  );
  expect(await screen.findByLabelText('Chegada')).toHaveValue('2030-04-15');
  expect(screen.getByLabelText('Partida')).toHaveValue('2030-04-12');
  expect(screen.getByText('A chegada é posterior à partida.')).toBeVisible();
  expect(screen.getByText('Hospedagem ultrapassa as datas da visita.')).toBeVisible();
  expect(screen.getByRole('region', { name: 'Cronologia de hospedagem' })).toHaveTextContent(
    '10 de abr. de 2030'
  );
  expect(screen.getByRole('button', { name: 'Remover link de origem 1' })).toBeVisible();
  expect(screen.getByText('Não necessário')).toBeVisible();
  expect(screen.getByText('Comprado')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Nova cidade' })).toBeVisible();
  fireEvent.click(screen.getByText('Período aproximado'));
  fireEvent.change(screen.getByLabelText('Duração mínima'), { target: { value: '-1' } });
  fireEvent.blur(screen.getByLabelText('Duração mínima'));
  expect(screen.getByText('A duração deve ser um número finito não negativo.')).toBeVisible();
  await act(() => locale.changeLanguage('en-AU'));
  expect(screen.getByLabelText('Arrival')).toHaveValue('2030-04-15');
  expect(screen.getByText('Arrival is after departure.')).toBeVisible();
  expect(screen.getByRole('region', { name: 'Accommodation timeline' })).toHaveTextContent(
    '10 Apr 2030'
  );
  currentVisit = {
    ...visit,
    revision: 1,
    timing: { arrival: '2030-04-10', departure: '2030-04-16' },
  };
  currentStays = {
    stays: stays.stays.map((stay) => ({
      ...stay,
      status: 'Considering',
      timing: currentVisit.timing,
    })),
  };
  await act(() => locale.changeLanguage('pt-BR'));
  await act(() => cache.invalidateQueries());
  await waitFor(() =>
    expect(
      screen.getByText('Sem hospedagem: 10 de abr. de 2030 – 16 de abr. de 2030')
    ).toBeVisible()
  );
  expect(screen.getByText('Em consideração')).toBeVisible();
  expect(writes).toEqual([]);
});
