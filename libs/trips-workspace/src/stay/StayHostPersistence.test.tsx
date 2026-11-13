import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { getSourceRetry } from '../shared/source-retry-test-utils';
import { contactOwner, ownerSelection } from '../source-contacts/test-utils';
import { StayWorkspace } from './StayWorkspace';
import { testNightLabel, problem, sourceStay, workspaceTransport } from './test-utils';

const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
});
function harness() {
  const original = sourceStay();
  const changed = sourceStay({
    hostLinks: [...original.hostLinks, { uri: ownerSelection.reference.uri }],
  });
  const transport = workspaceTransport({
    stay: original,
    patches: [
      { status: 503, body: problem('trips.temporarily_unavailable') },
      { status: 200, body: changed },
      { status: 200, body: original },
    ],
  });
  const owner = contactOwner();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(client);
  const mount = () =>
    render(
      <QueryClientProvider client={client}>
        <StayWorkspace
          formatNights={testNightLabel}
          tripId={7}
          stayId={13}
          client={transport.client}
          contacts={owner.capability}
        />
      </QueryClientProvider>
    );
  return { original, changed, transport, owner, mount };
}
it('retries a lost Host source write and persists Undo without rewriting addresses or recreating the Contact', async () => {
  const { transport, changed, original, owner, mount } = harness();
  mount();
  await screen.findByLabelText('Stay name');
  fireEvent.click(screen.getByRole('button', { name: 'Choose host' }));
  fireEvent.click(screen.getByRole('button', { name: 'Select owner contact' }));
  await screen.findByText('Changes have not been saved');
  expect(transport.patches).toEqual([{ hostLinks: changed.hostLinks }]);
  expect(screen.getByLabelText('Address')).toHaveValue(original.address);
  fireEvent.click(getSourceRetry());
  await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Remove host link 2' })).not.toBeInTheDocument()
  );
  expect(transport.patches.slice(0, 2)).toEqual([
    { hostLinks: changed.hostLinks },
    { hostLinks: changed.hostLinks },
  ]);
  expect(transport.patches[2]).toMatchObject({
    hostLinks: original.hostLinks,
    address: original.address,
  });
  expect(owner.createIntent).toHaveBeenCalledTimes(1);
});
it('retains owner-issued evidence across a failed source save and route remount for explicit recovery', async () => {
  const { transport, owner, changed, mount } = harness();
  const first = mount();
  await screen.findByLabelText('Stay name');
  fireEvent.click(screen.getByRole('button', { name: 'Choose host' }));
  fireEvent.click(screen.getByRole('button', { name: 'Select owner contact' }));
  await screen.findByText('Changes have not been saved');
  first.unmount();
  mount();
  await screen.findByText('Changes have not been saved');
  expect(screen.getByRole('button', { name: 'Remove host link 2' })).toBeInTheDocument();
  fireEvent.click(getSourceRetry());
  await waitFor(() => expect(transport.patches).toHaveLength(2));
  expect(transport.patches).toEqual([
    { hostLinks: changed.hostLinks },
    { hostLinks: changed.hostLinks },
  ]);
  expect(owner.createIntent).toHaveBeenCalledTimes(1);
});
