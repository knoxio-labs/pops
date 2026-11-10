import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { createClient } from '../trips-api/client';
import { client as defaultClient } from '../trips-api/client.gen';
import { PeopleWorkspace } from './PeopleWorkspace';
import { meetingPlan } from './test-utils';

import type { MeetingPlan } from './types';

afterEach(cleanup);

function ownerReadFixture() {
  const origin = `http://people-a-${crypto.randomUUID()}.test`;
  const requests: Request[] = [];
  let unavailable = false;
  let pending: ((response: Response) => void) | undefined;
  let defer = false;
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request.clone());
    if (unavailable)
      return Response.json(
        { code: 'offline', message: 'Unavailable', retryable: true },
        { status: 503 }
      );
    if (request.method === 'POST')
      return Response.json(
        { code: 'rejected', message: 'Conflict', retryable: false },
        { status: 409 }
      );
    if (request.url.endsWith('/meeting-plans')) {
      if (defer)
        return new Promise<Response>((resolve) => {
          pending = resolve;
        });
      return Response.json({
        meetingPlans: [meetingPlan({ title: new URL(request.url).origin, contactUri: null })],
      });
    }
    if (request.url.endsWith('/visits')) return Response.json({ visits: [] });
    if (request.url.endsWith('/places')) return Response.json({ places: [] });
    return Response.json({ id: 7, name: new URL(request.url).origin });
  };
  const client = createClient({ baseUrl: origin, fetch: transport });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = ['trips', origin, 7, 'meeting-plans'];
  const view = (useDefault = false) => (
    <QueryClientProvider client={cache}>
      <PeopleWorkspace tripId={7} client={useDefault ? undefined : client} text={(key) => key} />
    </QueryClientProvider>
  );
  return {
    origin,
    client,
    cache,
    key,
    view,
    transport,
    requests,
    unavailable: () => {
      unavailable = true;
    },
    defer: () => {
      defer = true;
    },
    release: () => {
      pending?.(Response.json({ meetingPlans: [meetingPlan({ title: 'Late A', revision: 2 })] }));
    },
  };
}

it.each([false, true])(
  'keeps captured A cache/editor/context through B refetch and unavailable A (default=%s)',
  async (useDefault) => {
    const test = ownerReadFixture();
    const original = defaultClient.getConfig();
    const client = useDefault ? defaultClient : test.client;
    if (useDefault) client.setConfig({ baseUrl: test.origin, fetch: test.transport });
    const mounted = render(test.view(useDefault));
    try {
      expect(await screen.findByLabelText('planTitle')).toHaveValue(test.origin);
      client.setConfig({ baseUrl: 'http://people-b.test' });
      await act(() => test.cache.refetchQueries({ queryKey: ['trips', test.origin] }));
      expect(screen.getByLabelText('planTitle')).toHaveValue(test.origin);
      expect(test.cache.getQueryData<MeetingPlan[]>(test.key)?.[0]?.title).toBe(test.origin);
      expect(test.requests.every((request) => new URL(request.url).origin === test.origin)).toBe(
        true
      );
      client.setConfig({ baseUrl: test.origin });
      test.unavailable();
      mounted.rerender(test.view(useDefault));
      await act(() => test.cache.refetchQueries({ queryKey: ['trips', test.origin] }));
      expect(screen.getByLabelText('planTitle')).toHaveValue(test.origin);
      expect(test.cache.getQueryData<MeetingPlan[]>(test.key)?.[0]?.title).toBe(test.origin);
    } finally {
      mounted.unmount();
      test.cache.clear();
      if (useDefault) defaultClient.setConfig(original);
    }
  }
);

it('rejects a late read after its captured transport changes and retains last good A', async () => {
  const test = ownerReadFixture();
  render(test.view());
  expect(await screen.findByLabelText('planTitle')).toHaveValue(test.origin);
  test.defer();
  let completion = Promise.resolve();
  await act(async () => {
    completion = test.cache.refetchQueries({ queryKey: test.key });
  });
  await waitFor(() =>
    expect(test.requests.filter((request) => request.url.endsWith('/meeting-plans'))).toHaveLength(
      2
    )
  );
  test.client.setConfig({ baseUrl: 'http://people-b.test' });
  await act(async () => {
    test.release();
    await completion;
  });
  expect(screen.getByLabelText('planTitle')).toHaveValue(test.origin);
  expect(test.cache.getQueryData<MeetingPlan[]>(test.key)?.[0]?.title).toBe(test.origin);
});

it('fences explicit rejected-command reload against its original editor owner', async () => {
  const test = ownerReadFixture();
  render(test.view());
  const field = await screen.findByLabelText('planTitle');
  fireEvent.change(field, { target: { value: 'Rejected draft' } });
  fireEvent.blur(field);
  await screen.findByText('rejected');
  test.client.setConfig({ baseUrl: 'http://people-b.test' });
  fireEvent.click(screen.getByRole('button', { name: 'reload' }));
  await screen.findByText('trips.people.source_changed');
  expect(test.requests.every((request) => new URL(request.url).origin === test.origin)).toBe(true);
  expect(screen.getByLabelText('planTitle')).toHaveValue('Rejected draft');
  test.client.setConfig({ baseUrl: test.origin });
  fireEvent.click(screen.getByRole('button', { name: 'reload' }));
  await waitFor(() => expect(screen.queryByText('rejected')).not.toBeInTheDocument());
  expect(screen.getByLabelText('planTitle')).toHaveValue(test.origin);
});
