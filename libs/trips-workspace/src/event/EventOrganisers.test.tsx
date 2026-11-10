import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { contactOwner, ownerSelection } from '../source-contacts/test-utils';
import { createClient } from '../trips-api/client';
import { EventOrganisers } from './EventOrganisers';

import type { ReactElement } from 'react';

import type { ContactReferenceReadResult } from '@pops/pillar-sdk';

import type { EventPatch, EventWorkspaceProps, TripEvent } from './types';

const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
});
function mount(identity: EventWorkspaceProps, links: TripEvent['organiserLinks'] = []) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  const commit = vi.fn<(patch: EventPatch) => void>();
  const content = (next: EventWorkspaceProps): ReactElement => (
    <QueryClientProvider client={cache}>
      <EventOrganisers identity={next} links={links} disabled={false} commit={commit} />
    </QueryClientProvider>
  );
  const view = render(content(identity));
  return {
    ...view,
    commit,
    replace: (next: EventWorkspaceProps) => view.rerender(content(next)),
    reopen: () => render(content(identity)),
  };
}

it('uses only owner-read names and hrefs, preserving opaque references and removing the exact selected occurrence', async () => {
  const owner = contactOwner();
  const links = [
    { uri: 'https://source.example/old', label: 'Unverified source label' },
    { uri: ownerSelection.reference.uri },
    { uri: ownerSelection.reference.uri, label: 'Retained source label' },
  ];
  const view = mount({ tripId: 7, eventId: 19, contacts: owner.capability }, links);
  expect(
    (await screen.findAllByRole('link', { name: ownerSelection.name })).every(
      (link) => link.getAttribute('href') === '/owner-issued/contact-link'
    )
  ).toBe(true);
  expect(screen.queryByRole('link', { name: 'Unverified source label' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove organiser 2' }));
  expect(view.commit).toHaveBeenCalledExactlyOnceWith({ organiserLinks: [links[0], links[2]] });
  expect(screen.queryByLabelText('Organiser references URI')).not.toBeInTheDocument();
});

it.each([
  [{ status: 'missing' }, 'Contact not found'],
  [{ status: 'unavailable' }, 'Contacts unavailable'],
  [{ status: 'readError' }, 'Contact details unavailable'],
] satisfies [ContactReferenceReadResult, string][])(
  'preserves and permits removal of %j references',
  async (reply, label) => {
    const owner = contactOwner();
    owner.reply(reply);
    const view = mount({ tripId: 7, eventId: 19, contacts: owner.capability }, [
      { uri: ownerSelection.reference.uri },
    ]);
    expect(await screen.findByText(label)).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove organiser 1' }));
    expect(view.commit).toHaveBeenCalledWith({ organiserLinks: [] });
  }
);

it('shows a failed owner read without fabricating metadata or blocking clear', async () => {
  const owner = contactOwner();
  owner.readContactReference.mockRejectedValue(new Error('Owner down'));
  const view = mount({ tripId: 7, eventId: 19, contacts: owner.capability }, [
    { uri: ownerSelection.reference.uri },
  ]);
  expect(await screen.findByRole('alert')).toHaveTextContent('Contact read failed');
  expect(screen.getByRole('button', { name: 'Remove organiser 1' })).toBeEnabled();
  expect(view.commit).not.toHaveBeenCalled();
});

it('retains a closed unresolved owner intent and ignores late selection until explicitly recovered', async () => {
  const owner = contactOwner();
  const view = mount({ tripId: 7, eventId: 19, contacts: owner.capability });
  fireEvent.click(screen.getByRole('button', { name: 'Add organiser' }));
  const callback = owner.current().onSelect;
  fireEvent.click(screen.getByRole('button', { name: 'Close owner chooser' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add organiser' }));
  expect(owner.createIntent).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Close owner chooser' }));
  act(() => callback(ownerSelection));
  expect(view.commit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Add selected organiser' }));
  expect(view.commit).toHaveBeenCalledExactlyOnceWith({
    organiserLinks: [{ uri: ownerSelection.reference.uri }],
  });
});

it('isolates same-origin source-client replacement and retains old-context owner evidence for return', async () => {
  const owner = contactOwner();
  const first = {
    tripId: 7,
    eventId: 19,
    client: createClient({ baseUrl: 'https://trips.example' }),
    contacts: owner.capability,
  };
  const view = mount(first);
  fireEvent.click(screen.getByRole('button', { name: 'Add organiser' }));
  const callback = owner.current().onSelect;
  view.replace({ ...first, client: createClient({ baseUrl: 'https://trips.example' }) });
  act(() => callback(ownerSelection));
  expect(view.commit).not.toHaveBeenCalled();
  expect(screen.queryByText(/Selected in Contacts/)).not.toBeInTheDocument();
  view.replace(first);
  expect(screen.getByText(/Selected in Contacts/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Add selected organiser' }));
  expect(view.commit).toHaveBeenCalledWith({
    organiserLinks: [{ uri: ownerSelection.reference.uri }],
  });
});

it('fences origin mutation between rendering the chooser and its selection callback', async () => {
  const owner = contactOwner();
  const client = createClient({ baseUrl: 'https://trips.example' });
  const view = mount({ tripId: 7, eventId: 19, client, contacts: owner.capability });
  fireEvent.click(screen.getByRole('button', { name: 'Add organiser' }));
  client.setConfig({ baseUrl: 'https://different.example' });
  act(() => owner.current().onSelect(ownerSelection));
  expect(view.commit).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Add selected organiser' })).toBeDisabled();
  await waitFor(() => expect(owner.createIntent).toHaveBeenCalledTimes(1));
});
