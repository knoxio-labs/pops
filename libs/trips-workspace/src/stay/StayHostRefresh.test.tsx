import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { getSourceRetry, querySourceRetry } from '../shared/source-retry-test-utils';
import { contactOwner, ownerSelection } from '../source-contacts/test-utils';
import { stayQueryKey } from './api';
import { StayWorkspace } from './StayWorkspace';
import { problem, sourceStay, testNightLabel, workspaceTransport } from './test-utils';

import type { Stay } from './types';

const caches: QueryClient[] = [];
const foreign = { uri: 'https://foreign.example/host', label: 'Independent source' };
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
});
function setup(links: Stay['hostLinks'], failHost = false) {
  const original = sourceStay();
  const fresh = sourceStay({ hostLinks: [...original.hostLinks, foreign] });
  const changed = sourceStay({ address: 'Pending address', hostLinks: links });
  const transport = workspaceTransport({
    stay: original,
    patches: [
      { status: 503, body: problem('trips.temporarily_unavailable') },
      failHost
        ? { status: 503, body: problem('trips.temporarily_unavailable') }
        : { status: 200, body: changed },
      { status: 200, body: failHost ? { ...fresh, address: 'Pending address' } : fresh },
    ],
  });
  const owner = contactOwner();
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  const identity = { tripId: 7, stayId: 13, client: transport.client };
  render(
    <QueryClientProvider client={cache}>
      <StayWorkspace {...identity} contacts={owner.capability} formatNights={testNightLabel} />
    </QueryClientProvider>
  );
  const refresh = async () => {
    await act(async () => {
      cache.setQueryData(stayQueryKey(identity), fresh);
    });
  };
  return { original, fresh, transport, owner, refresh };
}
async function failAddress() {
  const field = await screen.findByLabelText('Address');
  fireEvent.change(field, { target: { value: 'Pending address' } });
  fireEvent.blur(field);
  await screen.findByText('Changes have not been saved');
}
it('fences a stale replacement, retains its receipt and preserves refreshed foreign Hosts through save and Undo', async () => {
  const links = [{ uri: ownerSelection.reference.uri }, foreign];
  const { owner, transport, fresh, refresh } = setup(links);
  await failAddress();
  fireEvent.click(screen.getByRole('button', { name: 'Replace host 1' }));
  const staleSelect = owner.current().onSelect;
  await refresh();
  await screen.findByRole('button', { name: 'Remove host link 2' });
  expect(screen.getByLabelText('Address')).toHaveValue('Pending address');
  act(() => staleSelect(ownerSelection));
  expect(transport.patches).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Replace host 1' }));
  expect(owner.createIntent).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'Select owner contact' }));
  await waitFor(() => expect(transport.patches).toHaveLength(2));
  expect(transport.patches[1]).toEqual({ address: 'Pending address', hostLinks: links });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() => expect(transport.patches).toHaveLength(3));
  expect(transport.patches[2]).toMatchObject({
    hostLinks: fresh.hostLinks,
    address: fresh.address,
  });
});
it.each(['add', 'remove'] as const)(
  'preserves a refreshed foreign Host during %s after an unrelated failed Address save',
  async (operation) => {
    const original = sourceStay();
    const links =
      operation === 'add'
        ? [...original.hostLinks, foreign, { uri: ownerSelection.reference.uri }]
        : [foreign];
    const { transport, refresh } = setup(links);
    await failAddress();
    await refresh();
    await screen.findByRole('button', { name: 'Remove host link 2' });
    if (operation === 'add') {
      fireEvent.click(screen.getByRole('button', { name: 'Choose host' }));
      fireEvent.click(screen.getByRole('button', { name: 'Select owner contact' }));
    } else fireEvent.click(screen.getByRole('button', { name: 'Remove host link 1' }));
    await waitFor(() => expect(transport.patches).toHaveLength(2));
    expect(transport.patches[1]).toEqual({ address: 'Pending address', hostLinks: links });
  }
);

it('resumes an unresolved replacement intent after an unrelated canonical Host append', async () => {
  const links = [{ uri: ownerSelection.reference.uri }, foreign];
  const { owner, transport, refresh } = setup(links);
  await failAddress();
  fireEvent.click(screen.getByRole('button', { name: 'Replace host 1' }));
  await refresh();
  await screen.findByRole('button', { name: 'Remove host link 2' });
  fireEvent.click(screen.getByRole('button', { name: 'Replace host 1' }));
  expect(owner.createIntent).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Select owner contact' }));
  await waitFor(() => expect(transport.patches).toHaveLength(2));
  expect(transport.patches[1]).toEqual({ address: 'Pending address', hostLinks: links });
});

it('requires explicit conflict resolution while preserving the unrelated failed Address and owner receipt', async () => {
  const original = sourceStay();
  const links = [...original.hostLinks, { uri: ownerSelection.reference.uri }];
  const { transport, refresh } = setup(links, true);
  await failAddress();
  fireEvent.click(screen.getByRole('button', { name: 'Choose host' }));
  fireEvent.click(screen.getByRole('button', { name: 'Select owner contact' }));
  await waitFor(() => expect(transport.patches).toHaveLength(2));
  await screen.findByText('Changes have not been saved');
  await refresh();
  const reset = await screen.findByRole('button', {
    name: 'Use refreshed values for conflicting fields',
  });
  expect(screen.getByRole('button', { name: 'Choose host' })).toBeDisabled();
  expect(querySourceRetry()).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  fireEvent.click(reset);
  expect(screen.getByLabelText('Address')).toHaveValue('Pending address');
  expect(screen.getByRole('button', { name: 'Add selected host' })).toBeEnabled();
  fireEvent.click(getSourceRetry());
  await waitFor(() => expect(transport.patches).toHaveLength(3));
  expect(transport.patches[2]).toEqual({ address: 'Pending address' });
});
