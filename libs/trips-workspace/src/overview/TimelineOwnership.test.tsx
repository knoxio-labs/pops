import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { sourceRental } from '../arrangements/test-utils';
import { captureSource, sourceCapture, deferred } from '../capture/test-utils';
import { meetingPlan } from '../people/test-utils';
import { mountOverview } from './render.test-utils';
import { overviewResponses } from './test-utils';

afterEach(cleanup);

const sourceCases = [
  {
    path: '/trips/7/meeting-plans',
    key: 'meeting-plans',
    queryPath: ['meeting-plans'],
    code: 'trips.people.source_changed',
    body: (name: string) => ({ meetingPlans: [meetingPlan({ title: name })] }),
  },
  {
    path: '/trips/7/capture-workspace',
    key: 'capture_workspace',
    queryPath: ['capture_workspace', 'overview'],
    code: 'web.source.context_changed',
    body: (name: string) => captureSource([sourceCapture({ tripId: 7, title: name })]),
  },
  {
    path: '/trips/7/rentals',
    key: 'rentals',
    queryPath: ['rentals'],
    code: 'web.source.context_changed',
    body: (name: string) => ({ rentals: [sourceRental({ provider: name })] }),
  },
];

it.each(sourceCases)(
  'does not adopt mutable transport B under the captured A $key query',
  async ({ path, queryPath, body }) => {
    const responses = overviewResponses();
    responses.set(path, body('Owner A source'));
    const { cache, client, requests } = mountOverview(responses);
    await screen.findByText('Owner A source');
    const capturedKey = ['trips', 'http://overview.test', 7, ...queryPath];
    const capturedData = cache.getQueryData(capturedKey);
    expect(capturedData).toBeDefined();
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

it.each(sourceCases)(
  'rejects a $key response delivered after its captured transport changes',
  async ({ path, queryPath, body, code }) => {
    const responses = overviewResponses();
    responses.set(path, body('Late source'));
    const barrier = deferred<void>();
    const { cache, client, requests } = mountOverview(responses, { path, until: barrier.promise });
    await waitFor(() => expect(requests).toContain(path));
    client.setConfig({ baseUrl: 'http://owner-b.test' });
    const capturedKey = ['trips', 'http://overview.test', 7, ...queryPath];
    await act(async () => {
      barrier.resolve();
      await cache.refetchQueries({ queryKey: capturedKey, exact: true });
    });
    expect(cache.getQueryData(capturedKey)).toBeUndefined();
    expect(cache.getQueryState(capturedKey)?.error).toMatchObject({ code });
    expect(screen.queryByText('Late source')).not.toBeInTheDocument();
  }
);
