import { act, cleanup, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { captureQueryKey } from '../capture/api';
import { captureSource, sourceCapture, sourceIdea } from '../capture/test-utils';
import { peopleQueryKey } from '../people/api';
import { meetingPlan } from '../people/test-utils';
import { mountOverview } from './render.test-utils';
import { overviewResponses } from './test-utils';

afterEach(cleanup);

it('retains explicit missing Visit references and independent meeting facts without availability or purchase inference', async () => {
  const responses = overviewResponses();
  responses.set('/trips/7/meeting-plans', {
    meetingPlans: [
      meetingPlan({
        visitId: 999,
        startDate: '2030-02-02',
        endDate: '2030-01-01',
        agreement: 'Agreed',
      }),
      meetingPlan({ id: 42, title: 'Removed meeting', removed: true }),
      meetingPlan({ id: 43, title: 'Foreign meeting', tripId: 8 }),
    ],
  });
  const captured = captureSource([
    sourceCapture({ tripId: 7, title: 'Literal capture', classification: 'idea' }),
    sourceCapture({
      id: 2,
      tripId: 7,
      title: 'Removed capture',
      removedAt: '2030-01-01T00:00:00Z',
    }),
    sourceCapture({ id: 3, tripId: 8, title: 'Foreign capture' }),
  ]);
  captured.ideas = [
    sourceIdea({ tripId: 7, name: 'Removed idea', removedAt: '2030-01-01T00:00:00Z' }),
  ];
  responses.set('/trips/7/capture-workspace', captured);
  mountOverview(responses);
  const detached = await screen.findByRole('region', { name: 'Unassociated' });
  const title = await within(detached).findByText('Coffee');
  const card = title.closest('article');
  expect(card).toHaveTextContent('2 Feb 2030 → 1 Jan 2030');
  expect(card).toHaveTextContent('Considering');
  expect(card).toHaveTextContent('Agreed');
  expect(card).toHaveAttribute('data-constraint', 'soft');
  expect(detached).toHaveTextContent('visit #999 · Source unavailable');
  expect(await within(detached).findByText('Literal capture')).toBeVisible();
  expect(
    screen.queryByText(
      /Removed meeting|Foreign meeting|Removed capture|Foreign capture|Removed idea/
    )
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Contact unavailable')).not.toBeInTheDocument();
});

it('observes People cache updates and refreshes independent Capture facts through owner invalidation', async () => {
  const responses = overviewResponses();
  responses.set('/trips/7/meeting-plans', { meetingPlans: [meetingPlan()] });
  responses.set(
    '/trips/7/capture-workspace',
    captureSource([sourceCapture({ tripId: 7, title: 'Original capture' })])
  );
  const { cache, client } = mountOverview(responses);
  await screen.findByText('Coffee');
  await screen.findByText('Original capture');
  expect(cache.getQueryData([...captureQueryKey({ tripId: 7, client }), 'overview'])).toEqual(
    captureSource([sourceCapture({ tripId: 7, title: 'Original capture' })])
  );
  act(() => {
    cache.setQueryData(peopleQueryKey({ tripId: 7, client }), [
      meetingPlan({ title: 'Changed meeting' }),
    ]);
  });
  responses.set('/trips/7/meeting-plans', {
    meetingPlans: [meetingPlan({ title: 'Changed meeting' })],
  });
  responses.set(
    '/trips/7/capture-workspace',
    captureSource([sourceCapture({ tripId: 7, title: 'Changed capture' })])
  );
  await act(() =>
    cache.invalidateQueries({ queryKey: captureQueryKey({ tripId: 7, client }).slice(0, 3) })
  );
  expect(await screen.findByText('Changed meeting')).toBeVisible();
  expect(await screen.findByText('Changed capture')).toBeVisible();
  expect(screen.queryByText('Coffee')).not.toBeInTheDocument();
  expect(screen.queryByText('Original capture')).not.toBeInTheDocument();
});

it('retains cached Capture facts and readable meeting facts during a failed refresh, then recovers from the owning query', async () => {
  const responses = overviewResponses();
  responses.set('/trips/7/meeting-plans', { meetingPlans: [meetingPlan()] });
  responses.set(
    '/trips/7/capture-workspace',
    captureSource([sourceCapture({ tripId: 7, title: 'Retained capture' })])
  );
  const { cache, client } = mountOverview(responses);
  await screen.findByText('Retained capture');
  responses.delete('/trips/7/capture-workspace');
  await act(() => cache.invalidateQueries({ queryKey: captureQueryKey({ tripId: 7, client }) }));
  expect(await screen.findByText('trips.source.unavailable')).toBeVisible();
  expect(screen.getByText('Retained capture')).toBeVisible();
  expect(screen.getByText('Coffee')).toBeVisible();
  responses.set(
    '/trips/7/capture-workspace',
    captureSource([sourceCapture({ tripId: 7, title: 'Recovered capture' })])
  );
  await act(() => cache.invalidateQueries({ queryKey: captureQueryKey({ tripId: 7, client }) }));
  expect(await screen.findByText('Recovered capture')).toBeVisible();
  expect(screen.queryByText('trips.source.unavailable')).not.toBeInTheDocument();
});

it('applies controlled exact-source visibility to linked and detached cards without hiding route/booking facts or new IDs', async () => {
  const responses = overviewResponses();
  responses.set('/trips/7/capture-workspace', {
    ...captureSource([
      sourceCapture({ id: 1, tripId: 7, visitId: 31, title: 'Linked capture' }),
      sourceCapture({ id: 2, tripId: 7, title: 'Unassigned capture' }),
      sourceCapture({ id: 3, tripId: 7, title: 'New unclassified capture' }),
    ]),
    ideas: [sourceIdea({ id: 1, tripId: 7, name: 'Same ID idea' })],
  });
  const known = [
    { kind: 'capture' as const, id: 1 },
    { kind: 'capture' as const, id: 2 },
    { kind: 'idea' as const, id: 1 },
    { kind: 'event' as const, id: 61 },
  ];
  const mounted = mountOverview(responses, undefined, {
    sourceVisibility: { known, visible: [{ kind: 'idea', id: 1 }] },
  });
  expect(await screen.findByText('New unclassified capture')).toBeVisible();
  expect(screen.getByText('Same ID idea')).toBeVisible();
  expect(screen.queryByText('Linked capture')).not.toBeInTheDocument();
  expect(screen.queryByText('Unassigned capture')).not.toBeInTheDocument();
  expect(screen.queryByText('Harbour festival')).not.toBeInTheDocument();
  expect(await screen.findByText('Wellington')).toBeVisible();
  expect(await screen.findByText('Cedar guesthouse')).toBeVisible();
  mounted.rerender({ sourceVisibility: undefined });
  expect(await screen.findByText('Linked capture')).toBeVisible();
  expect(screen.getByText('Unassigned capture')).toBeVisible();
  expect(screen.getByText('Harbour festival')).toBeVisible();
});
