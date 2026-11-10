import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { contactOwner, ownerSelection } from '../source-contacts/test-utils';
import { stayQueryKey } from './api';
import { StayWorkspace } from './StayWorkspace';
import { sourceStay, testNightLabel, workspaceTransport } from './test-utils';

import type { TestResponse } from './test-utils';

let cache: QueryClient | undefined;
afterEach(() => {
  cleanup();
  cache?.clear();
});
it('keeps observed foreign Host facts through a late older response, explicit reset and subsequent replacement without stale Undo', async () => {
  const original = sourceStay();
  const confirmed = sourceStay({ address: 'Saved address' });
  const foreign = { uri: 'https://foreign.example/host', label: 'Independent opaque source' };
  const fresh = { ...confirmed, hostLinks: [...original.hostLinks, foreign] };
  const replaced = { ...fresh, hostLinks: [{ uri: ownerSelection.reference.uri }, foreign] };
  let release: ((response: TestResponse) => void) | undefined;
  const pending = new Promise<TestResponse>((resolve) => {
    release = resolve;
  });
  const transport = workspaceTransport({
    stay: original,
    patches: [pending, { status: 200, body: replaced }],
  });
  const owner = contactOwner();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cache = client;
  const identity = { tripId: 7, stayId: 13, client: transport.client };
  const content = () => (
    <QueryClientProvider client={client}>
      <StayWorkspace {...identity} contacts={owner.capability} formatNights={testNightLabel} />
    </QueryClientProvider>
  );
  const view = render(content());
  const address = await screen.findByLabelText('Address');
  fireEvent.change(address, { target: { value: confirmed.address } });
  fireEvent.blur(address);
  await waitFor(() => expect(transport.patches).toHaveLength(1));
  await act(async () => {
    client.setQueryData(stayQueryKey(identity), fresh);
    view.rerender(content());
  });
  await act(async () => {
    release?.({ status: 200, body: confirmed });
  });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Use refreshed values for conflicting fields' })
  );
  expect(screen.getByRole('button', { name: 'Remove host link 2' })).toBeEnabled();
  expect(screen.getByLabelText('Address')).toHaveValue(confirmed.address);
  fireEvent.click(screen.getByRole('button', { name: 'Replace host 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Select owner contact' }));
  await waitFor(() => expect(transport.patches).toHaveLength(2));
  expect(transport.patches[1]).toEqual({ hostLinks: replaced.hostLinks });
  await screen.findByText('Changes saved');
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  expect(owner.createIntent).toHaveBeenCalledTimes(1);
});
