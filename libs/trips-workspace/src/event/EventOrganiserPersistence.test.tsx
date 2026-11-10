import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { contactOwner, ownerSelection } from '../source-contacts/test-utils';
import { problem } from '../stay/test-utils';
import { EventWorkspace } from './EventWorkspace';
import { eventTransport, sourceEvent } from './test-utils';

const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
});
function harness() {
  const initial = sourceEvent({
    organiserLinks: [{ uri: 'https://source.example/retained', label: 'Opaque original' }],
  });
  const selected = { uri: ownerSelection.reference.uri };
  const changed = sourceEvent({ organiserLinks: [...initial.organiserLinks, selected] });
  const transport = eventTransport({
    source: initial,
    replies: [
      { status: 503, body: problem('trips.temporarily_unavailable') },
      { status: 200, body: changed },
      { status: 200, body: initial },
    ],
  });
  const owner = contactOwner();
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  const mount = () =>
    render(
      <QueryClientProvider client={cache}>
        <EventWorkspace
          tripId={7}
          eventId={19}
          client={transport.client}
          contacts={owner.capability}
        />
      </QueryClientProvider>
    );
  return { transport, owner, mount, initial, changed };
}
it('retains the exact organiser draft after a lost source write and retries/undoes only Trips', async () => {
  const { transport, owner, mount, initial, changed } = harness();
  mount();
  await screen.findByLabelText('Event name');
  fireEvent.click(screen.getByRole('button', { name: 'Add organiser' }));
  fireEvent.click(screen.getByRole('button', { name: 'Select owner contact' }));
  await screen.findByText('Changes have not been saved');
  expect(transport.patches).toEqual([{ organiserLinks: changed.organiserLinks }]);
  expect(screen.getByRole('button', { name: 'Remove organiser 2' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Remove organiser 2' })).not.toBeInTheDocument()
  );
  expect(transport.patches.slice(0, 2)).toEqual([
    { organiserLinks: changed.organiserLinks },
    { organiserLinks: changed.organiserLinks },
  ]);
  expect(transport.patches[2]).toMatchObject({ organiserLinks: initial.organiserLinks });
  expect(owner.createIntent).toHaveBeenCalledTimes(1);
});
it('recovers an issued owner reference after unmounting a failed source save without recreating the contact', async () => {
  const { transport, owner, mount, changed } = harness();
  const first = mount();
  await screen.findByLabelText('Event name');
  fireEvent.click(screen.getByRole('button', { name: 'Add organiser' }));
  fireEvent.click(screen.getByRole('button', { name: 'Select owner contact' }));
  await screen.findByText('Changes have not been saved');
  first.unmount();
  mount();
  await screen.findByText('Changes have not been saved');
  expect(screen.getByRole('button', { name: 'Remove organiser 2' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(transport.patches).toHaveLength(2));
  expect(transport.patches).toEqual([
    { organiserLinks: changed.organiserLinks },
    { organiserLinks: changed.organiserLinks },
  ]);
  expect(owner.createIntent).toHaveBeenCalledTimes(1);
});
