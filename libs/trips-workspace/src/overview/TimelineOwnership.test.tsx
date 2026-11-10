import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { sourceRental } from '../arrangements/test-utils';
import { captureSource, sourceCapture, deferred } from '../capture/test-utils';
import { meetingPlan } from '../people/test-utils';
import { mountOverview } from './render.test-utils';
import { overviewResponses } from './test-utils';

afterEach(cleanup);

it.each([
  {
    path: '/trips/7/meeting-plans',
    key: 'meeting-plans',
    body: (name: string) => ({ meetingPlans: [meetingPlan({ title: name })] }),
  },
  {
    path: '/trips/7/capture-workspace',
    key: 'capture_workspace',
    body: (name: string) => captureSource([sourceCapture({ tripId: 7, title: name })]),
  },
  {
    path: '/trips/7/rentals',
    key: 'rentals',
    body: (name: string) => ({ rentals: [sourceRental({ provider: name })] }),
  },
])(
  'does not adopt mutable transport B under the captured A $key query',
  async ({ path, key, body }) => {
    const responses = overviewResponses();
    responses.set(path, body('Owner A source'));
    const { cache, client, requests } = mountOverview(responses);
    await screen.findByText('Owner A source');
    const capturedKey = ['trips', 'http://overview.test', 7, key];
    const capturedData = cache.getQueryData(capturedKey);
    const initialRequests = requests.filter((request) => request === path).length;
    responses.set(path, body('Owner B source'));
    client.setConfig({ baseUrl: 'http://owner-b.test' });
    await act(() => cache.refetchQueries({ queryKey: capturedKey, exact: true }));
    expect(requests.filter((request) => request === path)).toHaveLength(initialRequests);
    client.setConfig({ baseUrl: 'http://overview.test' });
    responses.delete(path);
    await act(() => cache.refetchQueries({ queryKey: capturedKey, exact: true }));
    expect(cache.getQueryData(capturedKey)).toEqual(capturedData);
  }
);

it('does not adopt a mutable origin during an ordinary host rerender', async () => {
  const responses = overviewResponses();
  responses.set('/trips/7/meeting-plans', {
    meetingPlans: [meetingPlan({ title: 'Captured owner' })],
  });
  const { client, rerender } = mountOverview(responses);
  await screen.findByText('Captured owner');
  responses.set('/trips/7/meeting-plans', {
    meetingPlans: [meetingPlan({ title: 'Foreign origin' })],
  });
  client.setConfig({ baseUrl: 'http://owner-b.test' });
  rerender();
  expect(await screen.findByText('web.source.context_changed')).toBeVisible();
  expect(screen.queryByText('Captured owner')).not.toBeInTheDocument();
  expect(screen.queryByText('Foreign origin')).not.toBeInTheDocument();
});

it('rejects a collection response delivered after its captured transport changes', async () => {
  const responses = overviewResponses();
  responses.set('/trips/7/meeting-plans', {
    meetingPlans: [meetingPlan({ title: 'Late source' })],
  });
  const barrier = deferred<void>();
  const { cache, client, requests } = mountOverview(responses, {
    path: '/trips/7/meeting-plans',
    until: barrier.promise,
  });
  await waitFor(() => expect(requests).toContain('/trips/7/meeting-plans'));
  client.setConfig({ baseUrl: 'http://owner-b.test' });
  const key = ['trips', 'http://overview.test', 7, 'meeting-plans'];
  await act(async () => {
    barrier.resolve();
    await cache.refetchQueries({ queryKey: key, exact: true });
  });
  expect(cache.getQueryData(key)).toBeUndefined();
  expect(cache.getQueryState(key)?.error).toMatchObject({ code: 'web.source.context_changed' });
  expect(screen.queryByText('Late source')).not.toBeInTheDocument();
});
