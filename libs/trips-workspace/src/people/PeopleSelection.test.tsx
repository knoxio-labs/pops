import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { PeopleWorkspace } from './PeopleWorkspace';
import { meetingPlan } from './test-utils';
import { peopleTransport } from './transport.test-utils';

import type { MeetingPlan } from './types';

afterEach(cleanup);

function context(plans: MeetingPlan[]) {
  const api = peopleTransport();
  const fetcher = api.client.getConfig().fetch ?? fetch;
  api.client.setConfig({
    fetch: async (input, init) => {
      const request = new Request(input, init);
      if (request.method === 'GET' && new URL(request.url).pathname.endsWith('/meeting-plans'))
        return new Response(JSON.stringify({ meetingPlans: plans }), {
          headers: { 'content-type': 'application/json' },
        });
      return fetcher(request);
    },
  });
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = (meetingId: number, tripId = 7) => (
    <QueryClientProvider client={query}>
      <PeopleWorkspace
        tripId={tripId}
        meetingId={meetingId}
        client={api.client}
        text={(key) => key}
      />
    </QueryClientProvider>
  );
  return { api, view };
}

it('selects only the exact canonical ID, retains duplicate titles, and changes context without another editor', async () => {
  const test = context([meetingPlan(), meetingPlan({ id: 42 })]);
  const mounted = render(test.view(42));
  expect(await screen.findByRole('article')).toHaveFocus();
  expect(within(screen.getByRole('article')).getByLabelText('planTitle')).toHaveValue('Coffee');
  expect(screen.getAllByRole('article')).toHaveLength(1);
  test.api.replies.push(meetingPlan({ id: 42, agreement: 'Agreed' }));
  fireEvent.change(within(screen.getByRole('article')).getByLabelText('agreement'), {
    target: { value: 'Agreed' },
  });
  await waitFor(() => expect(test.api.writes).toHaveLength(1));
  expect(test.api.writes[0]).toMatchObject({ command: { id: 42 } });
  mounted.rerender(test.view(41));
  await waitFor(() =>
    expect(within(screen.getByRole('article')).getByLabelText('agreement')).toHaveValue(
      'Not agreed'
    )
  );
  expect(screen.getAllByRole('article')).toHaveLength(1);
});

it.each([999, 42])('does not fall back for a missing or foreign-trip meeting ID %s', async (id) => {
  const test = context([meetingPlan(), meetingPlan({ id: 42, tripId: 8 })]);
  render(test.view(id));
  expect(await screen.findByText('trips.people.meeting_unavailable')).toBeVisible();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(test.api.writes).toEqual([]);
});

it('retains failed draft and operation across exact context changes and remount', async () => {
  const test = context([meetingPlan(), meetingPlan({ id: 42, title: 'Another meeting' })]);
  test.api.failWrites(true);
  const mounted = render(test.view(41));
  const field = within(await screen.findByRole('article')).getByLabelText('planTitle');
  fireEvent.change(field, { target: { value: 'Retained draft' } });
  fireEvent.blur(field);
  await screen.findByText('trips.test.offline');
  const operation = test.api.writes[0];
  mounted.rerender(test.view(42));
  expect(within(screen.getByRole('article')).getByLabelText('planTitle')).toHaveValue(
    'Another meeting'
  );
  mounted.unmount();
  render(test.view(41));
  expect(within(await screen.findByRole('article')).getByLabelText('planTitle')).toHaveValue(
    'Retained draft'
  );
  test.api.failWrites(false);
  fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'retry' }));
  await waitFor(() => expect(test.api.writes).toHaveLength(2));
  expect(test.api.writes[1]).toEqual(operation);
});

it('keeps an unsaved field while another exact meeting is selected', async () => {
  const test = context([meetingPlan(), meetingPlan({ id: 42, title: 'Other' })]);
  const mounted = render(test.view(41));
  const field = within(await screen.findByRole('article')).getByLabelText('planTitle');
  fireEvent.change(field, { target: { value: 'Unsaved field' } });
  mounted.rerender(test.view(42));
  expect(screen.getByRole('article', { name: 'Other' })).toHaveFocus();
  mounted.rerender(test.view(41));
  expect(within(screen.getByRole('article')).getByLabelText('planTitle')).toHaveValue(
    'Unsaved field'
  );
  expect(test.api.writes).toEqual([]);
});

it('isolates colliding meeting IDs across API owners and owning trips', async () => {
  const first = context([meetingPlan({ title: 'First owner' })]);
  const second = context([meetingPlan({ title: 'Second owner' })]);
  const mounted = render(first.view(41));
  expect(await screen.findByRole('article', { name: 'First owner' })).toHaveFocus();
  mounted.rerender(second.view(41));
  expect(await screen.findByRole('article', { name: 'Second owner' })).toHaveFocus();
  expect(screen.queryByRole('article', { name: 'First owner' })).not.toBeInTheDocument();
  mounted.rerender(second.view(41, 8));
  expect(await screen.findByText('trips.people.meeting_unavailable')).toBeVisible();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  mounted.rerender(first.view(41));
  expect(await screen.findByRole('article', { name: 'First owner' })).toHaveFocus();
});

it.each(['planTitle', 'notes', 'startDate', 'endDate'])(
  'retains an unsaved %s through actual unmount and owner collision without sending a command',
  async (label) => {
    const first = context([meetingPlan()]);
    const second = context([meetingPlan()]);
    const mounted = render(first.view(41));
    const value = label.endsWith('Date') ? '2030-02-09' : 'Unsubmitted field';
    const field = within(await screen.findByRole('article')).getByLabelText(label);
    fireEvent.change(field, { target: { value } });
    mounted.unmount();
    const other = render(second.view(41));
    const otherField = within(await screen.findByRole('article')).getByLabelText(label);
    expect(otherField).not.toHaveValue(value);
    other.unmount();
    render(first.view(41));
    expect(within(await screen.findByRole('article')).getByLabelText(label)).toHaveValue(value);
    expect(first.api.writes).toEqual([]);
    expect(second.api.writes).toEqual([]);
  }
);
