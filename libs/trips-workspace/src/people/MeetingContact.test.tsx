import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { MeetingContact } from './MeetingContact';

import type { ContactReferenceReadResult, ContactsHostCapability } from '@pops/pillar-sdk';

afterEach(cleanup);
function mount(readContactReference?: ContactsHostCapability['readContactReference']) {
  const clear = vi.fn();
  const contacts: ContactsHostCapability = {
    createIntent: () => ({ Chooser: () => null }),
    readContactReference,
  };
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={query}>
      <MeetingContact
        uri="pops:contacts/contact/historical"
        contacts={contacts}
        text={(key, values) => (values ? `${key}:${values.uri}` : key)}
        canChoose
        choose={vi.fn()}
        clear={clear}
      />
    </QueryClientProvider>
  );
  return { ...view, clear };
}

const cases: { result: ContactReferenceReadResult; label: string }[] = [
  { result: { status: 'missing' }, label: 'contactMissing' },
  {
    result: {
      status: 'unavailable',
      reference: { canonicalId: 'canonical', uri: 'pops:contacts/contact/canonical' },
    },
    label: 'contactUnavailable',
  },
  {
    result: {
      status: 'readError',
      reference: { canonicalId: 'canonical', uri: 'pops:contacts/contact/canonical' },
    },
    label: 'contactReadError',
  },
];

it.each(cases)(
  'keeps owner $result.status distinct and clearable without borrowing missing semantics',
  async ({ result, label }) => {
    const reader = vi.fn(async () => result);
    mount(reader);
    expect(await screen.findByText(label)).toBeVisible();
    expect(screen.getByRole('button', { name: 'clearContact' })).toBeEnabled();
    expect(screen.getByText('pops:contacts/contact/historical')).toBeVisible();
    if (result.status !== 'missing') {
      expect(screen.queryByText('contactMissing')).not.toBeInTheDocument();
      expect(screen.getByText('contactCanonical:pops:contacts/contact/canonical')).toBeVisible();
    }
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  }
);

it('uses the owner supplied canonical display and source route without rewriting the stored historical URI', async () => {
  const reader = vi.fn(async (): Promise<ContactReferenceReadResult> => ({
    status: 'available',
    name: 'Canonical person',
    reference: { canonicalId: 'canonical', uri: 'pops:contacts/contact/canonical' },
    href: '/contacts/canonical',
  }));
  mount(reader);
  expect(await screen.findByText('Canonical person')).toBeVisible();
  expect(screen.getByRole('link', { name: 'openContact' })).toHaveAttribute(
    'href',
    '/contacts/canonical'
  );
  expect(reader).toHaveBeenCalledWith('pops:contacts/contact/historical', {
    signal: expect.any(AbortSignal),
  });
});

it('shows unverified before proof and forwards cancellation to the pending owner read', () => {
  let signal: AbortSignal | undefined;
  const reader: NonNullable<ContactsHostCapability['readContactReference']> = (_uri, options) => {
    signal = options?.signal;
    return new Promise<ContactReferenceReadResult>(() => undefined);
  };
  const view = mount(reader);
  expect(screen.getByText('contactUnverified')).toBeVisible();
  expect(screen.queryByText('contactMissing')).not.toBeInTheDocument();
  view.unmount();
  expect(signal?.aborted).toBe(true);
});
