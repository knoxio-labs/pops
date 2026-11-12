import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, it, vi } from 'vitest';

import enAU from '../locales/en-AU.json';
import { createClient as createTagsClient } from '../tags-api/client';
import {
  creationGate,
  creationReply,
  creationSession,
  creationTransport,
} from './create-trip-test-utils';
import { metadataTrip } from './metadata-test-utils';
import { NewTripDialog } from './NewTripDialog';

import type { Trip } from '../api/types';

afterEach(cleanup);

async function mountDialog(
  transport: ReturnType<typeof creationTransport>,
  cache = new QueryClient()
) {
  const i18n = createInstance();
  await i18n.init({ lng: 'en-AU', resources: { 'en-AU': { trips: enAU } } });
  const callbacks = {
    created: vi.fn<(trip: Trip) => void>(),
    setOpen: vi.fn<(open: boolean) => void>(),
  };
  const tagsClient = createTagsClient({
    baseUrl: 'http://tags.test',
    fetch: async () => Response.json({ tags: [] }),
  });
  const element = (open: boolean) => (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={cache}>
        <NewTripDialog
          open={open}
          {...callbacks}
          trips={[]}
          clients={{ tripClient: transport.client, tagsClient }}
        />
      </QueryClientProvider>
    </I18nextProvider>
  );
  const mounted = render(element(true));
  return { ...mounted, ...callbacks, cache, element, user: userEvent.setup() };
}

it('shows the immutable unresolved fields with Retry and Close usable through close/reopen', async () => {
  const transport = creationTransport();
  transport.respond(async () => {
    throw new TypeError('Unknown outcome');
  });
  const mounted = await mountDialog(transport);
  const original = {
    ...metadataTrip,
    destination: '',
    notes: '',
    when: '  after graduation\nperhaps  ',
    name: 'Visible submitted trip',
  };
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: original.name } });
  fireEvent.change(screen.getByLabelText('When'), { target: { value: original.when } });
  await mounted.user.click(screen.getByRole('button', { name: 'Create trip' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Name')).toBeDisabled();
  expect(screen.getByLabelText('When')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Create trip' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  await mounted.user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(mounted.setOpen).toHaveBeenCalledWith(false);
  mounted.rerender(mounted.element(false));
  mounted.cache.clear();
  mounted.rerender(mounted.element(true));
  expect(await screen.findByLabelText('Name')).toHaveValue(original.name);
  expect(screen.getByLabelText('When')).toHaveValue(original.when);
  expect(screen.getByLabelText('Name')).toBeDisabled();
  transport.respond((request) => creationReply(request, original, original, true));
  await mounted.user.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(mounted.created).toHaveBeenCalledExactlyOnceWith(original));
  expect(transport.requests).toHaveLength(2);
  expect(transport.requests[1]).toEqual(transport.requests[0]);
  expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
});

it('permits correcting a validated rejected attempt through the same form with a fresh command', async () => {
  const transport = creationTransport();
  transport.reject('trips.trip.parent_invalid');
  const mounted = await mountDialog(transport);
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Rejected draft' } });
  await mounted.user.click(screen.getByRole('button', { name: 'Create trip' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Name')).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Corrected draft' } });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  const corrected = {
    ...metadataTrip,
    name: 'Corrected draft',
    destination: '',
    when: '',
    notes: '',
  };
  transport.respond((request) => creationReply(request, corrected));
  await mounted.user.click(screen.getByRole('button', { name: 'Create trip' }));
  await waitFor(() => expect(mounted.created).toHaveBeenCalledExactlyOnceWith(corrected));
  expect(transport.requests[1]?.body).not.toBe(transport.requests[0]?.body);
});

it('keeps an already-newer draft visible after definite rejection and omits Retry for the different old fields', async () => {
  const transport = creationTransport();
  const gate = creationGate();
  transport.respond(async () => {
    await gate.wait;
    return Response.json(
      {
        code: 'trips.trip.parent_invalid',
        message: 'Creation rejected',
        requestId: 'creation-test',
        retryable: false,
      },
      { status: 400 }
    );
  });
  const mounted = await mountDialog(transport);
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Original rejected draft' } });
  await mounted.user.click(screen.getByRole('button', { name: 'Create trip' }));
  await waitFor(() => expect(transport.requests).toHaveLength(1));
  const session = creationSession(transport, mounted.cache);
  const newer = {
    ...session.snapshot().draft,
    name: 'Already newer draft',
    when: '  opaque newer When  ',
  };
  act(() => session.change(newer));
  expect(screen.getByLabelText('Name')).toHaveValue('Original rejected draft');
  await act(async () => {
    gate.release();
  });
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Name')).toHaveValue(newer.name);
  expect(screen.getByLabelText('When')).toHaveValue(newer.when);
  expect(screen.getByLabelText('Name')).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  await act(() => session.retry());
  expect(transport.requests).toHaveLength(1);
  const corrected = {
    ...metadataTrip,
    name: newer.name,
    when: newer.when,
    destination: '',
    notes: '',
  };
  transport.respond((request) => creationReply(request, corrected));
  await mounted.user.click(screen.getByRole('button', { name: 'Create trip' }));
  await waitFor(() => expect(mounted.created).toHaveBeenCalledExactlyOnceWith(corrected));
  expect(transport.requests).toHaveLength(2);
  expect(transport.requests[1]?.body).not.toBe(transport.requests[0]?.body);
});
