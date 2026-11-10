import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { contactOwner, ownerSelection } from '../source-contacts/test-utils';
import { StayHost } from './StayHost';
import { StayReferences } from './StayReferences';
import { sourceStay } from './test-utils';

import type { Stay, StayPatch } from './types';

const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
});
function mount(links: Stay['hostLinks']) {
  const owner = contactOwner();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(client);
  const commit = vi.fn<(patch: StayPatch) => void>();
  const content = (next: Stay['hostLinks']) => (
    <QueryClientProvider client={client}>
      <StayHost
        identity={{ tripId: 7, stayId: 13, contacts: owner.capability }}
        links={next}
        disabled={false}
        commit={commit}
      />
    </QueryClientProvider>
  );
  const view = render(content(links));
  return { owner, commit, replace: (next: Stay['hostLinks']) => view.rerender(content(next)) };
}
it('appends only the owner-issued Host URI, keeping every existing opaque link and source label', () => {
  const existing = [{ uri: 'https://source.example/host', label: 'Unresolved source host' }];
  const { owner, commit } = mount(existing);
  fireEvent.click(screen.getByRole('button', { name: 'Choose host' }));
  fireEvent.click(screen.getByRole('button', { name: 'Select owner contact' }));
  expect(commit).toHaveBeenCalledExactlyOnceWith({
    hostLinks: [...existing, { uri: ownerSelection.reference.uri }],
  });
  expect(owner.createIntent).toHaveBeenCalledTimes(1);
});
it('replaces exactly one duplicate occurrence, preserving other references without count or contact-type restrictions', () => {
  const existing = [
    { uri: 'https://source.example/host', label: 'First source' },
    { uri: 'https://source.example/host', label: 'Second source' },
  ];
  const { commit } = mount(existing);
  fireEvent.click(screen.getByRole('button', { name: 'Replace host 2' }));
  fireEvent.click(screen.getByRole('button', { name: 'Select owner contact' }));
  expect(commit).toHaveBeenCalledExactlyOnceWith({
    hostLinks: [existing[0], { uri: ownerSelection.reference.uri }],
  });
});
it('does not apply a pending replacement after its source array changes; its issued reference stays explicitly recoverable', () => {
  const existing = [
    { uri: 'https://source.example/first' },
    { uri: 'https://source.example/second' },
  ];
  const view = mount(existing);
  fireEvent.click(screen.getByRole('button', { name: 'Replace host 2' }));
  const select = view.owner.current().onSelect;
  view.replace([existing[0]!]);
  act(() => select(ownerSelection));
  expect(view.commit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Add selected host' }));
  expect(view.commit).toHaveBeenCalledExactlyOnceWith({
    hostLinks: [existing[0], { uri: ownerSelection.reference.uri }],
  });
});
it('keeps unavailable Host references removable and retries the actual owner read', async () => {
  const view = mount([{ uri: ownerSelection.reference.uri }]);
  await screen.findByRole('link', { name: ownerSelection.name });
  view.owner.reply({ status: 'unavailable' });
  view.replace([{ uri: 'pops:contacts/contact/other-owner-reference' }]);
  expect(await screen.findByText('Contacts unavailable')).toBeVisible();
  view.owner.reply({ status: 'available', ...ownerSelection, href: '/actual-owner-host' });
  fireEvent.click(screen.getByRole('button', { name: 'Retry contact read' }));
  expect(await screen.findByRole('link', { name: ownerSelection.name })).toHaveAttribute(
    'href',
    '/actual-owner-host'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remove host link 1' }));
  expect(view.commit).toHaveBeenCalledWith({ hostLinks: [] });
});
it('hides empty read-only provenance rows while retaining stored opaque Documents/Sources independently', () => {
  const commit = vi.fn<(patch: StayPatch) => void>();
  const view = render(
    <StayReferences stay={sourceStay({ documentLinks: [], sourceLinks: [] })} commit={commit} />
  );
  expect(screen.queryByText('No links recorded')).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Host' })).not.toBeInTheDocument();
  view.rerender(<StayReferences stay={sourceStay()} commit={commit} />);
  expect(screen.getByRole('region', { name: 'Document references' })).toBeVisible();
  expect(screen.getByRole('region', { name: 'Sources' })).toBeVisible();
  expect(commit).not.toHaveBeenCalled();
});
