import { once } from 'node:events';
import { createServer } from 'node:http';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { tripKeys } from '../api/source';
import enAU from '../locales/en-AU.json';
import { client as tagsClient } from '../tags-api/client.gen';
import { client as tripClient } from '../trips-api/client.gen';
import { NewTripDialog } from './NewTripDialog';
import { TripSettingsPage } from './TripSettingsPage';

import type { Server } from 'node:http';

import type { ReactNode } from 'react';

import type { Trip } from '../api/types';

const original: Trip = {
  id: 7,
  name: 'Original name',
  destination: '  Québec  ',
  when: '  after winter, perhaps  ',
  notes: 'Original notes',
  tagId: null,
  parentId: null,
  sourceLinks: [{ uri: 'https://example.test/source' }],
  createdAt: '2026-11-09T00:00:00Z',
  updatedAt: '2026-11-09T00:00:00Z',
};
let server: Server;
let source: Trip;
let failTags: boolean;
let failTrips: boolean;
let failTripRead: boolean;
const writes: (Trip | 'error')[] = [];
const requests: { method: string | undefined; path: string | undefined; body: string }[] = [];
const originalTripConfig = tripClient.getConfig();
const originalTagsConfig = tagsClient.getConfig();

beforeEach(async () => {
  source = structuredClone(original);
  failTags = false;
  failTrips = false;
  failTripRead = false;
  writes.length = 0;
  requests.length = 0;
  server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on('end', () => {
      requests.push({ method: request.method, path: request.url, body });
      response.setHeader('content-type', 'application/json');
      if (request.url === '/tags') {
        response.writeHead(failTags ? 503 : 200);
        response.end(
          JSON.stringify(
            failTags
              ? {
                  code: 'tags.unavailable',
                  message: 'Tags unavailable',
                  retryable: true,
                  requestId: 'tags-test',
                }
              : { tags: [] }
          )
        );
        return;
      }
      if (request.method === 'GET' && request.url === '/trips' && failTrips) {
        response.writeHead(503);
        response.end(
          JSON.stringify({
            code: 'trips.unavailable',
            message: 'Trips unavailable',
            retryable: true,
            requestId: 'trips-test',
          })
        );
        return;
      }
      if (request.method === 'GET' && request.url === '/trips/7' && failTripRead) {
        response.writeHead(503);
        response.end(
          JSON.stringify({
            code: 'trips.source.unavailable',
            message: 'Source trip unavailable',
            retryable: true,
            requestId: 'trip-read-test',
          })
        );
        return;
      }
      if (request.method === 'GET') {
        response.end(JSON.stringify(request.url === '/trips' ? { trips: [source] } : source));
        return;
      }
      const result = writes.shift();
      if (result === 'error' || !result) {
        response.writeHead(400);
        response.end(
          JSON.stringify({
            code: 'trips.request.invalid',
            message: 'Source validation failed',
            retryable: false,
            requestId: 'write-test',
          })
        );
        return;
      }
      source = result;
      response.writeHead(request.method === 'POST' ? 201 : 200);
      if (request.url === '/trips/operations') {
        const command: unknown = JSON.parse(body);
        if (typeof command !== 'object' || command === null || !('operationId' in command))
          throw new Error('Missing creation UUID');
        response.end(
          JSON.stringify({
            receipt: { operationId: command.operationId, trip: source },
            current: { trip: source },
            replayed: false,
          })
        );
      } else response.end(JSON.stringify(source));
    });
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP listener');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  tripClient.setConfig({ baseUrl });
  tagsClient.setConfig({ baseUrl });
});
afterEach(async () => {
  cleanup();
  tripClient.setConfig(originalTripConfig);
  tagsClient.setConfig(originalTagsConfig);
  server.closeIdleConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function mount(children: ReactNode) {
  const i18n = createInstance();
  await i18n.init({
    lng: 'en-AU',
    resources: { 'en-AU': { trips: enAU } },
    interpolation: { escapeValue: false },
  });
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const result = render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    </I18nextProvider>
  );
  return { ...result, cache, user: userEvent.setup() };
}

function settings() {
  return (
    <MemoryRouter initialEntries={['/trips/7/settings']}>
      <Routes>
        <Route path="/trips/:tripId/settings" element={<TripSettingsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function mutations() {
  return requests.filter(({ method }) => method !== 'GET');
}

function metadata(trip: Trip, includeAssociations = true) {
  return {
    name: trip.name,
    destination: trip.destination,
    when: trip.when,
    ...(includeAssociations && { tagId: trip.tagId, parentId: trip.parentId }),
    notes: trip.notes,
  };
}

describe('NewTripDialog persistence', () => {
  it('creates permanently through POST despite an optional tag outage, with no Undo or DELETE', async () => {
    failTags = true;
    const created = vi.fn<(trip: Trip) => void>();
    const setOpen = vi.fn<(open: boolean) => void>();
    const persisted: Trip = {
      ...original,
      name: null,
      notes: '',
      destination: '  Montréal  ',
      when: '  after graduation  ',
    };
    writes.push(persisted);
    const { user, cache } = await mount(
      <NewTripDialog open setOpen={setOpen} trips={[]} created={created} />
    );
    await screen.findByText('Shared tags could not be loaded.');
    await user.type(screen.getByLabelText('Destination'), persisted.destination);
    await user.type(screen.getByLabelText('When'), persisted.when);
    expect(screen.getByRole('button', { name: 'Create trip' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create trip' }));
    await waitFor(() => expect(created).toHaveBeenCalledWith(persisted));
    expect(setOpen).toHaveBeenCalledWith(false);
    expect(cache.getQueryData(['trips', tripClient.getConfig().baseUrl, 7])).toEqual(persisted);
    expect(mutations()).toHaveLength(1);
    expect(mutations()[0]).toMatchObject({ method: 'POST', path: '/trips/operations' });
    expect(JSON.parse(mutations()[0]?.body ?? '')).toEqual({
      operationId: expect.any(String),
      command: { kind: 'trip.create', input: metadata(persisted) },
    });
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    expect(mutations().some(({ method }) => method === 'DELETE')).toBe(false);
  });

  it('retains a failed creation draft and retries the same explicit fields', async () => {
    writes.push('error', {
      ...original,
      name: 'Retained draft',
      destination: '',
      when: '',
      notes: '',
    });
    const created = vi.fn<(trip: Trip) => void>();
    const setOpen = vi.fn<(open: boolean) => void>();
    const { user } = await mount(
      <NewTripDialog open setOpen={setOpen} trips={[]} created={created} />
    );
    await user.type(screen.getByLabelText('Name'), 'Retained draft');
    await user.click(screen.getByRole('button', { name: 'Create trip' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Source validation failed');
    expect(screen.getByLabelText('Name')).toHaveValue('Retained draft');
    expect(created).not.toHaveBeenCalled();
    expect(setOpen).not.toHaveBeenCalled();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(created).toHaveBeenCalledTimes(1));
    expect(mutations()).toHaveLength(2);
    expect(mutations()[0]).toEqual(mutations()[1]);
    expect(JSON.parse(mutations()[0]?.body ?? '')).toEqual({
      operationId: expect.any(String),
      command: {
        kind: 'trip.create',
        input: {
          name: 'Retained draft',
          destination: '',
          when: '',
          tagId: null,
          parentId: null,
          notes: '',
        },
      },
    });
  });
});

describe('TripSettingsPage persistence', () => {
  it('retains unsaved settings when a background source refresh fails and allows source retry', async () => {
    const { user, cache } = await mount(settings());
    const destination = await screen.findByLabelText('Destination');
    const when = screen.getByLabelText('When');
    fireEvent.change(destination, { target: { value: '  unsaved destination  ' } });
    fireEvent.change(when, { target: { value: '  after graduation  ' } });
    failTripRead = true;
    await act(async () => {
      await cache.refetchQueries({ queryKey: [...tripKeys().one(7), 'metadata'], exact: true });
    });
    await waitFor(() =>
      expect(cache.getQueryState([...tripKeys().one(7), 'metadata'])?.status).toBe('error')
    );
    expect(screen.getByLabelText('Destination')).toBe(destination);
    expect(destination).toHaveValue('  unsaved destination  ');
    expect(when).toHaveValue('  after graduation  ');
    expect(screen.getByText('Source trip unavailable')).toBeInTheDocument();
    failTripRead = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(screen.queryByText('Source trip unavailable')).not.toBeInTheDocument()
    );
    expect(destination).toHaveValue('  unsaved destination  ');
    expect(when).toHaveValue('  after graduation  ');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    expect(mutations()).toEqual([]);
  });

  it('saves and undoes metadata through PATCH while retaining unrelated source links', async () => {
    const edited: Trip = {
      ...original,
      name: 'Edited name',
      sourceLinks: [{ uri: 'https://example.test/concurrent-source' }],
    };
    const undone: Trip = { ...original, sourceLinks: edited.sourceLinks };
    writes.push(edited, undone);
    const { user, cache } = await mount(settings());
    const name = await screen.findByLabelText('Name');
    expect(name).toHaveValue(original.name);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    fireEvent.change(name, { target: { value: edited.name } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled());
    expect(name).toHaveValue(edited.name);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(name).toHaveValue(original.name));
    expect(mutations()).toEqual([
      { method: 'PATCH', path: '/trips/7', body: JSON.stringify(metadata(edited, false)) },
      { method: 'PATCH', path: '/trips/7', body: JSON.stringify(metadata(original, false)) },
    ]);
    expect(cache.getQueryData(['trips', tripClient.getConfig().baseUrl, 7])).toEqual(undone);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('retains saved metadata when Undo fails and retries the original metadata rather than the current draft', async () => {
    const edited: Trip = { ...original, name: 'Saved edit' };
    writes.push(edited, 'error', original);
    const { user } = await mount(settings());
    const name = await screen.findByLabelText('Name');
    fireEvent.change(name, { target: { value: edited.name } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    const alert = await screen.findByRole('alert');
    expect(name).toHaveValue(edited.name);
    expect(screen.getByText('Changes have not been saved')).toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(name).toHaveValue(original.name));
    expect(mutations()).toEqual([
      { method: 'PATCH', path: '/trips/7', body: JSON.stringify(metadata(edited, false)) },
      { method: 'PATCH', path: '/trips/7', body: JSON.stringify(metadata(original, false)) },
      { method: 'PATCH', path: '/trips/7', body: JSON.stringify(metadata(original, false)) },
    ]);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('keeps opaque source references visible and saves other metadata when both catalogues fail', async () => {
    source = { ...original, tagId: '11111111-1111-4111-8111-111111111111', parentId: 42 };
    failTags = true;
    failTrips = true;
    const edited: Trip = { ...source, name: 'Edited with unavailable references' };
    writes.push(edited);
    const { user, cache } = await mount(settings());
    const name = await screen.findByLabelText('Name');
    await screen.findByText('Shared tags could not be loaded.');
    await screen.findByText('Parent trips could not be loaded.');
    expect(
      screen.getByText('Source reference unavailable: 11111111-1111-4111-8111-111111111111')
    ).toBeInTheDocument();
    expect(screen.getByText('Source reference unavailable: 42')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.change(name, { target: { value: edited.name } });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled());
    expect(mutations()).toEqual([
      { method: 'PATCH', path: '/trips/7', body: JSON.stringify(metadata(edited, false)) },
    ]);
    expect(cache.getQueryData(['trips', tripClient.getConfig().baseUrl, 7])).toEqual(edited);
    expect(
      screen.getByText('Source reference unavailable: 11111111-1111-4111-8111-111111111111')
    ).toBeInTheDocument();
    expect(screen.getByText('Source reference unavailable: 42')).toBeInTheDocument();
  });

  it('retains failed settings and retries without treating them as saved', async () => {
    failTags = true;
    const edited: Trip = { ...original, name: 'Pending edit' };
    writes.push('error', edited);
    const { user } = await mount(settings());
    const name = await screen.findByLabelText('Name');
    await screen.findByText('Shared tags could not be loaded.');
    fireEvent.change(name, { target: { value: edited.name } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    const alert = await screen.findByRole('alert');
    expect(name).toHaveValue(edited.name);
    expect(screen.getByText('Changes have not been saved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled());
    expect(mutations()).toHaveLength(2);
    expect(mutations()[0]).toEqual(mutations()[1]);
  });
});
