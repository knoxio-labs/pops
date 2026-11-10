import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContactReference, ReferenceDetails } from './ContactReference';
import { Responsibility } from './Responsibility';
import { arrangementsTransport, labels } from './test-utils';

import type { ContactReferenceReadResult, ContactsHostCapability } from '@pops/pillar-sdk';

const uri = 'pops:contacts/contact/retained-original';
const base = { tripId: 7, labels, formatDate: (date: string): string => date };
const available: ContactReferenceReadResult = {
  status: 'available',
  name: 'Actual owner name',
  href: '/owner-issued/navigation',
  reference: { canonicalId: 'canonical-proof', uri: 'pops:contacts/contact/canonical-proof' },
};
afterEach(cleanup);
function mount(read?: ContactsHostCapability['readContactReference'], interactive = false) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const createIntent = vi.fn(() => ({ Chooser: () => null }));
  const identity = { ...base, contacts: { createIntent, readContactReference: read } };
  const view = render(
    <QueryClientProvider client={cache}>
      {interactive ? (
        <ContactReference identity={identity} uri={uri} interactive />
      ) : (
        <button>
          <ContactReference identity={identity} uri={uri} />
        </button>
      )}
      <ReferenceDetails identity={identity} value={uri} />
    </QueryClientProvider>
  );
  return { ...view, createIntent };
}
describe('Owner-issued responsibility labels', () => {
  it('uses only the actual owner name and href and keeps the original stored URI in details', async () => {
    const reader = vi
      .fn<NonNullable<ContactsHostCapability['readContactReference']>>()
      .mockResolvedValue(available);
    const { createIntent } = mount(reader, true);
    expect(await screen.findByRole('link', { name: 'Actual owner name' })).toHaveAttribute(
      'href',
      '/owner-issued/navigation'
    );
    expect(reader).toHaveBeenCalledExactlyOnceWith(uri, { signal: expect.any(AbortSignal) });
    expect(createIntent).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText('Reference details'));
    expect(screen.getByText(uri)).toBeVisible();
    expect(screen.queryByText(available.reference.uri)).not.toBeInTheDocument();
  });
  it('renders passive source names without nesting a link in the arrangement action', async () => {
    mount(async () => available);
    expect(await screen.findByRole('button', { name: 'Actual owner name' })).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
  it.each([
    [{ status: 'missing' }, 'Contact not found'],
    [{ status: 'unavailable', reference: available.reference }, 'Contacts unavailable'],
    [{ status: 'readError' }, 'Contact could not be loaded'],
  ] satisfies [ContactReferenceReadResult, string][])(
    'keeps owner state %s distinct',
    async (result, label) => {
      mount(async () => result);
      expect(await screen.findByText(label)).toBeVisible();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.getByText(uri)).toBeInTheDocument();
    }
  );
  it('retains a neutral label when a host omits the optional reader', () => {
    const { createIntent } = mount();
    expect(screen.getByRole('button', { name: 'Contact' })).toBeVisible();
    expect(screen.queryByText('Contacts unavailable')).not.toBeInTheDocument();
    expect(createIntent).not.toHaveBeenCalled();
  });
  it('reports a thrown read error without converting it to missing or starting hidden retries', async () => {
    const reader = vi
      .fn<NonNullable<ContactsHostCapability['readContactReference']>>()
      .mockRejectedValue(new Error('Read failed'));
    mount(reader);
    expect(await screen.findByText('Contact could not be loaded')).toBeVisible();
    expect(screen.queryByText('Contact not found')).not.toBeInTheDocument();
    expect(reader).toHaveBeenCalledTimes(1);
  });
  it('forwards cancellation and never turns a pending owner read into an unavailable identity', async () => {
    const reader = vi.fn<NonNullable<ContactsHostCapability['readContactReference']>>(
      () => new Promise(() => {})
    );
    const { unmount } = mount(reader);
    await waitFor(() => expect(reader).toHaveBeenCalledTimes(1));
    const signal = reader.mock.calls[0]?.[1]?.signal;
    expect(signal?.aborted).toBe(false);
    expect(screen.getByRole('button', { name: 'Contact' })).toBeVisible();
    unmount();
    expect(signal?.aborted).toBe(true);
  });
  it('clears the stored source reference while the owner read remains pending', async () => {
    const transport = arrangementsTransport();
    transport.replies.push({
      status: 200,
      body: { tripId: 7, targetKind: 'rental', targetId: 61, responsibility: null, revision: 5 },
    });
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const reader = vi.fn<NonNullable<ContactsHostCapability['readContactReference']>>(
      () => new Promise(() => {})
    );
    render(
      <QueryClientProvider client={cache}>
        <Responsibility
          identity={{
            ...base,
            client: transport.client,
            contacts: {
              createIntent: () => ({ Chooser: () => null }),
              readContactReference: reader,
            },
          }}
          target={{ targetKind: 'rental', targetId: 61 }}
        />
      </QueryClientProvider>
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Clear responsibility' }));
    await waitFor(() => expect(screen.getByText('Unset')).toBeVisible());
    expect(transport.writes).toEqual([
      {
        method: 'PUT',
        path: '/trips/7/responsibilities/rental/61',
        body: { expectedRevision: 4, responsibility: null },
      },
    ]);
    expect(reader).toHaveBeenCalledTimes(1);
  });
});
