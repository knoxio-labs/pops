import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PeopleWorkspace } from './PeopleWorkspace';
import { meetingPlan } from './test-utils';
import { peopleTransport } from './transport.test-utils';

import type { ContactsHostCapability } from '@pops/pillar-sdk';

import type { PeopleWorkspaceProps } from './types';
function contactHost(
  readContactReference: NonNullable<ContactsHostCapability['readContactReference']>
): ContactsHostCapability {
  return { createIntent: () => ({ Chooser: () => null }), readContactReference };
}

afterEach(cleanup);
function mount(props: PeopleWorkspaceProps) {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={query}>
      <PeopleWorkspace {...props} />
    </QueryClientProvider>
  );
  return { ...view, query };
}

describe('meeting workspace source actions', () => {
  it('searches resolved owner names without changing source identity or treating a failed lookup as unavailable', async () => {
    const api = peopleTransport();
    mount({
      tripId: 7,
      client: api.client,
      text: (key) => key,
      contacts: contactHost(async () => ({
        status: 'available',
        reference: { canonicalId: 'canonical', uri: 'pops:contacts/contact/canonical' },
        name: 'Casey Park',
        href: '/contacts/reference/owner-issued',
      })),
    });
    await screen.findByText('Casey Park');
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('search'), { target: { value: 'Casey' } });
    expect(screen.getByRole('article', { name: 'Coffee' })).toBeVisible();
    fireEvent.change(screen.getByLabelText('search'), { target: { value: 'Different person' } });
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(api.writes).toEqual([]);
  });
  it('edits exact association, agreement and independent reversed dates while keeping unavailable identity', async () => {
    const api = peopleTransport();
    const resolveContact = vi
      .fn<NonNullable<ContactsHostCapability['readContactReference']>>()
      .mockResolvedValue({ status: 'unavailable' });
    mount({
      tripId: 7,
      client: api.client,
      text: (key) => key,
      contacts: contactHost(resolveContact),
    });
    let card = await screen.findByRole('article', { name: 'Coffee' });
    expect(await within(card).findByText('contactUnavailable')).toBeVisible();
    expect(within(card).getByText('pops:contacts/contact/owner-issued')).toBeVisible();
    api.replies.push(meetingPlan({ visitId: 2, revision: 2 }));
    fireEvent.change(within(card).getByLabelText('visit'), { target: { value: '2' } });
    await waitFor(() => expect(api.writes).toHaveLength(1));
    expect(api.writes[0]).toMatchObject({
      command: { kind: 'update', id: 41, expectedRevision: 1, patch: { visitId: 2 } },
    });
    await waitFor(() => expect(screen.getByRole('article', { name: 'Coffee' })).not.toBe(card));
    card = screen.getByRole('article', { name: 'Coffee' });
    await waitFor(() => expect(within(card).getByLabelText('agreement')).toBeEnabled());
    api.replies.push(meetingPlan({ visitId: 2, revision: 3, agreement: 'Agreed' }));
    fireEvent.change(within(card).getByLabelText('agreement'), { target: { value: 'Agreed' } });
    await waitFor(() => expect(within(card).getByLabelText('agreement')).toHaveValue('Agreed'));
    expect(api.writes[1]).toMatchObject({
      command: { expectedRevision: 2, patch: { agreement: 'Agreed' } },
    });
    expect(within(card).getByLabelText('intention')).toHaveValue('Considering');
    api.replies.push(
      meetingPlan({ visitId: 2, revision: 4, agreement: 'Agreed', startDate: '2030-02-01' })
    );
    const start = within(card).getByLabelText('startDate');
    fireEvent.change(start, { target: { value: '2030-02-01' } });
    fireEvent.blur(start);
    expect(await within(card).findByText('reversedDates')).toBeVisible();
    expect(api.writes[2]).toMatchObject({
      command: { expectedRevision: 3, patch: { startDate: '2030-02-01' } },
    });
    expect(resolveContact).toHaveBeenCalledWith('pops:contacts/contact/owner-issued', {
      signal: expect.any(AbortSignal),
    });
  });

  it('keeps failed draft and exact operation across workspace unmount before retry', async () => {
    const api = peopleTransport();
    api.failWrites(true);
    const props = { tripId: 7, client: api.client, text: (key: string) => key };
    const first = mount(props);
    const title = await screen.findByLabelText('planTitle');
    fireEvent.change(title, { target: { value: 'Retained draft' } });
    fireEvent.blur(title);
    await screen.findByText('trips.test.offline');
    first.unmount();
    mount(props);
    expect(await screen.findByLabelText('planTitle')).toHaveValue('Retained draft');
    api.failWrites(false);
    api.replies.push(meetingPlan({ title: 'Retained draft', revision: 2 }));
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    await waitFor(() => expect(screen.queryByText('trips.test.offline')).not.toBeInTheDocument());
    expect(api.writes).toHaveLength(2);
    expect(api.writes[1]).toEqual(api.writes[0]);
    expect(screen.getByLabelText('planTitle')).toHaveValue('Retained draft');
  });

  it('distinguishes unverified reads and permits clearing identity without Contacts or route availability', async () => {
    const api = peopleTransport();
    mount({
      tripId: 7,
      client: api.client,
      text: (key) => key,
      contacts: contactHost(async () => {
        throw new Error('offline');
      }),
    });
    await screen.findByText('trips.contact.read');
    expect(screen.queryByText('contactUnavailable')).not.toBeInTheDocument();
    expect(screen.getByText('contactUnverified')).toBeVisible();
    api.replies.push(meetingPlan({ contactUri: null, revision: 2 }));
    fireEvent.click(screen.getByRole('button', { name: 'clearContact' }));
    expect(await screen.findByText('contactCleared')).toBeVisible();
    expect(api.writes[0]).toMatchObject({ command: { patch: { contactUri: null } } });
  });
});
