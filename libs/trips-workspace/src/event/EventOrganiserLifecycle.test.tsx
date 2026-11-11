import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { lazy } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { contactOwner, ownerSelection } from '../source-contacts/test-utils';
import { EventOrganisers } from './EventOrganisers';
import { EventWorkspace } from './EventWorkspace';
import { eventTransport } from './test-utils';

import type { ComponentType } from 'react';

import type { ContactChooserMountProps } from '@pops/pillar-sdk';

const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
});
function cache(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(client);
  return client;
}
it('contains owner Suspense inside the retained intent and preserves source drafts through chooser close', async () => {
  const owner = contactOwner();
  let load: (module: { default: ComponentType<ContactChooserMountProps> }) => void = () => {
    throw new Error('Owner import not requested');
  };
  const Chooser = lazy(
    () =>
      new Promise<{ default: ComponentType<ContactChooserMountProps> }>((resolve) => {
        load = resolve;
      })
  );
  const createIntent = vi.fn(() => ({ Chooser }));
  const transport = eventTransport();
  render(
    <QueryClientProvider client={cache()}>
      <EventWorkspace
        tripId={7}
        eventId={19}
        client={transport.client}
        contacts={{ ...owner.capability, createIntent }}
      />
    </QueryClientProvider>
  );
  const name = await screen.findByLabelText('Event name');
  fireEvent.change(name, { target: { value: 'Pending source name' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add organiser' }));
  expect(screen.getByText('Loading Contacts chooser…')).toBeVisible();
  expect(name).toHaveValue('Pending source name');
  await act(async () => load({ default: owner.createIntent().Chooser }));
  fireEvent.click(await screen.findByRole('button', { name: 'Close owner chooser' }));
  expect(name).toHaveValue('Pending source name');
  fireEvent.click(screen.getByRole('button', { name: 'Add organiser' }));
  expect(createIntent).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('region', { name: 'Owner chooser' })).toBeVisible();
  expect(transport.patches).toEqual([]);
});
it('does not reuse passive owner metadata when the capability is replaced and forwards cancellation', async () => {
  const first = contactOwner();
  const second = contactOwner();
  second.reply({ status: 'unavailable' });
  const client = cache();
  const commit = vi.fn();
  const content = (contacts: typeof first.capability) => (
    <QueryClientProvider client={client}>
      <EventOrganisers
        identity={{ tripId: 7, eventId: 19, contacts }}
        links={[{ uri: ownerSelection.reference.uri }]}
        disabled={false}
        commit={commit}
      />
    </QueryClientProvider>
  );
  const view = render(content(first.capability));
  await screen.findByRole('link', { name: ownerSelection.name });
  view.rerender(content(second.capability));
  expect(await screen.findByText('Contacts unavailable')).toBeVisible();
  expect(screen.queryByRole('link', { name: ownerSelection.name })).not.toBeInTheDocument();
  expect(second.readContactReference.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  expect(commit).not.toHaveBeenCalled();
});
it('displays an owner refresh error instead of presenting cached metadata as a successful current read', async () => {
  const owner = contactOwner();
  const client = cache();
  render(
    <QueryClientProvider client={client}>
      <EventOrganisers
        identity={{ tripId: 7, eventId: 19, contacts: owner.capability }}
        links={[{ uri: ownerSelection.reference.uri }]}
        disabled={false}
        commit={vi.fn()}
      />
    </QueryClientProvider>
  );
  await screen.findByRole('link', { name: ownerSelection.name });
  owner.readContactReference.mockRejectedValue(new Error('Owner unavailable'));
  await act(async () => client.invalidateQueries({ queryKey: ['source-contact'] }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Contact read failed');
  expect(screen.queryByRole('link', { name: ownerSelection.name })).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Remove organiser 1' })).toBeEnabled()
  );
});
