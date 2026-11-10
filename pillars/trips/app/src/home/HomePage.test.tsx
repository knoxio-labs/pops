import { once } from 'node:events';
import { createServer } from 'node:http';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { tripKeys } from '../api/source';
import enAU from '../locales/en-AU.json';
import { createClient as createTagsClient } from '../tags-api/client';
import { createClient } from '../trips-api/client';
import { HomePage } from './HomePage';

import type { Server } from 'node:http';

import type { ApiClients, Trip } from '../api/types';

const trip: Trip = {
  id: 7,
  name: 'Saved source',
  destination: '',
  when: '',
  notes: '',
  tagId: null,
  parentId: null,
  sourceLinks: [],
  createdAt: '2026-11-09T00:00:00Z',
  updatedAt: '2026-11-09T00:00:00Z',
};
let server: Server;
let clients: ApiClients;
let refuseTrips: boolean;
const paths: (string | undefined)[] = [];

beforeEach(async () => {
  refuseTrips = false;
  paths.length = 0;
  server = createServer((request, response) => {
    paths.push(request.url);
    response.setHeader('content-type', 'application/json');
    if (request.url === '/trips' && refuseTrips) {
      response.writeHead(503);
      response.end(
        JSON.stringify({
          code: 'trips.catalogue.unavailable',
          message: 'Trip catalogue unavailable',
          retryable: true,
          requestId: 'catalogue-test',
        })
      );
      return;
    }
    if (request.url === '/trips') response.end(JSON.stringify({ trips: [trip] }));
    else if (request.url === '/places') response.end(JSON.stringify({ places: [] }));
    else if (request.url === '/trips/7/visits') response.end(JSON.stringify({ visits: [] }));
    else if (request.url === '/tags') response.end(JSON.stringify({ tags: [] }));
    else {
      response.writeHead(404);
      response.end('{}');
    }
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP listener');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  clients = { tripClient: createClient({ baseUrl }), tagsClient: createTagsClient({ baseUrl }) };
});

afterEach(async () => {
  cleanup();
  server.closeIdleConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe('HomePage source refresh', () => {
  it('retains an open creation draft when a background trips refresh fails and allows source retry', async () => {
    const i18n = createInstance();
    await i18n.init({
      lng: 'en-AU',
      resources: { 'en-AU': { trips: enAU } },
      interpolation: { escapeValue: false },
    });
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={cache}>
          <MemoryRouter>
            <HomePage clients={clients} />
          </MemoryRouter>
        </QueryClientProvider>
      </I18nextProvider>
    );
    await screen.findByText('Saved source');
    await waitFor(() =>
      expect(paths).toEqual(expect.arrayContaining(['/trips', '/places', '/trips/7/visits']))
    );
    await user.click(screen.getByRole('button', { name: 'New trip' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(paths).toContain('/tags'));
    await user.type(within(dialog).getByLabelText('Destination'), '  Montréal  ');
    await user.type(within(dialog).getByLabelText('When'), '  after graduation  ');
    refuseTrips = true;
    await act(async () => {
      await cache.refetchQueries({ queryKey: tripKeys(clients).all, exact: true });
    });
    await waitFor(() => expect(cache.getQueryState(tripKeys(clients).all)?.status).toBe('error'));
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(within(dialog).getByLabelText('Destination')).toHaveValue('  Montréal  ');
    expect(within(dialog).getByLabelText('When')).toHaveValue('  after graduation  ');
    expect(screen.getByText('Trip catalogue unavailable')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    refuseTrips = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(screen.queryByText('Trip catalogue unavailable')).not.toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: 'New trip' }));
    expect(screen.getByLabelText('Destination')).toHaveValue('  Montréal  ');
    expect(screen.getByLabelText('When')).toHaveValue('  after graduation  ');
  });
});
