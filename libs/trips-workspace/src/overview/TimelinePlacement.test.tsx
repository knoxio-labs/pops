import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { sourceJourney } from '../journey/test-utils';
import { meetingPlan } from '../people/test-utils';
import { routeSession } from '../route/registry';
import { routeRead } from '../route/test-utils';
import { sourceVisits } from '../stay/test-utils';
import { mountOverview } from './render.test-utils';
import { overviewResponses } from './test-utils';

afterEach(cleanup);

it('uses canonical mixed order, structural gaps and complete paths rather than collection order or dates', async () => {
  const first = sourceVisits[0];
  if (!first) throw new Error('Missing source Visit fixture');
  const responses = overviewResponses();
  responses.set('/trips/7/visits', {
    visits: [...sourceVisits, { ...first, id: 33 }, { ...first, id: 34 }],
  });
  responses.set('/trips/7/journeys', {
    journeys: [sourceJourney(), sourceJourney({ id: 21, name: 'Unplaced train' })],
  });
  responses.set('/trips/7/journeys/21/legs', { legs: [] });
  responses.set('/trips/7/meeting-plans', { meetingPlans: [meetingPlan({ visitId: 31 })] });
  responses.set(
    '/trips/7/route',
    routeRead({
      order: [
        { kind: 'journey', id: 20 },
        { kind: 'visit', id: 32 },
        { kind: 'gap', id: 90 },
        { kind: 'visit', id: 31 },
        { kind: 'visit', id: 999 },
      ],
      paths: [
        {
          id: 91,
          title: 'Actual alternative',
          gapId: 90,
          state: 'alternative',
          members: [
            { kind: 'visit', id: 33 },
            { kind: 'journey', id: 777 },
          ],
        },
        {
          id: 92,
          title: 'Applied history',
          gapId: 90,
          state: 'applied',
          members: [{ kind: 'visit', id: 31 }],
        },
      ],
      missingSources: [
        { kind: 'visit', id: 999 },
        { kind: 'journey', id: 777 },
      ],
    })
  );
  mountOverview(responses, undefined, { onOpenSource: vi.fn() });
  const root = await screen.findByRole('list', { name: 'Route' });
  expect(
    [...root.children].map((row) => [
      row.getAttribute('data-route-kind'),
      row.getAttribute('data-route-id'),
    ])
  ).toEqual([
    ['journey', '20'],
    ['visit', '32'],
    ['gap', '90'],
    ['visit', '31'],
    ['visit', '999'],
  ]);
  expect(within(root).queryByRole('button', { name: 'gap #90' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Actual alternative' })).not.toBeInTheDocument();
  const alternative = screen.getByRole('region', { name: 'Actual alternative' });
  expect(alternative).toHaveTextContent('journey #777');
  expect(alternative.querySelector('[data-route-id="777"]')).toHaveAttribute(
    'data-route-state',
    'missing'
  );
  const history = screen.getByRole('region', { name: 'Applied history' });
  expect(history).toHaveTextContent('applied');
  expect(history).toHaveTextContent('visit #31');
  expect(within(history).queryByText('Coffee')).not.toBeInTheDocument();
  const unplaced = screen.getByRole('region', { name: 'unplaced' });
  expect(unplaced.querySelector('[data-visit-id="34"]')).toBeInTheDocument();
  expect(unplaced.querySelector('[data-visit-id="33"]')).not.toBeInTheDocument();
  expect(within(unplaced).getByText('Unplaced train')).toBeVisible();
});

it('rejects an actual foreign route response without claiming empty or assigning independent source facts to a route', async () => {
  const responses = overviewResponses();
  responses.set('/trips/7/route', routeRead({ tripId: 8 }));
  responses.set('/trips/7/meeting-plans', { meetingPlans: [meetingPlan({ visitId: 31 })] });
  const onOpenPlacement = vi.fn();
  const { cache, client } = mountOverview(responses, undefined, { onOpenPlacement });
  expect(await screen.findByText('web.request.failed')).toBeVisible();
  expect(routeSession(cache, { tripId: 7, client }).session.snapshot().readError?.message).toBe(
    'Foreign route response'
  );
  expect(screen.queryByRole('list', { name: 'Route' })).not.toBeInTheDocument();
  expect(screen.queryByText('No route entries.')).not.toBeInTheDocument();
  expect(await screen.findByText('Coffee')).toBeVisible();
  expect(screen.queryByRole('region', { name: 'unplaced' })).not.toBeInTheDocument();
  expect(onOpenPlacement).not.toHaveBeenCalled();
});

it('observes the retained canonical route reader and preserves availability as unknown after a failed refresh', async () => {
  const responses = overviewResponses();
  responses.set('/trips/7/route', routeRead({ order: [{ kind: 'visit', id: 31 }] }));
  const { cache, client } = mountOverview(responses);
  const root = await screen.findByRole('list', { name: 'Route' });
  responses.set(
    '/trips/7/route',
    routeRead({
      revision: 1,
      order: [
        { kind: 'visit', id: 32 },
        { kind: 'visit', id: 31 },
      ],
    })
  );
  const binding = routeSession(cache, { tripId: 7, client });
  await act(() => cache.invalidateQueries({ queryKey: binding.queryKey }));
  expect([...root.children].map((row) => row.getAttribute('data-route-id'))).toEqual(['32', '31']);
  responses.delete('/trips/7/route');
  await act(() => cache.invalidateQueries({ queryKey: binding.queryKey }));
  expect(await screen.findByText('trips.source.unavailable')).toBeVisible();
  expect([...root.children].map((row) => row.getAttribute('data-route-id'))).toEqual(['32', '31']);
});

it('opens exact structural identities without conflating a gap and path sharing an ID', async () => {
  const responses = overviewResponses();
  responses.set(
    '/trips/7/route',
    routeRead({
      order: [{ kind: 'gap', id: 90 }],
      paths: [{ id: 90, title: 'Explicit path', gapId: 90, state: 'alternative', members: [] }],
    })
  );
  const onOpenPlacement = vi.fn();
  mountOverview(responses, undefined, { onOpenPlacement });
  fireEvent.click(await screen.findByRole('button', { name: 'gap #90' }));
  fireEvent.click(screen.getByRole('button', { name: 'Explicit path' }));
  expect(onOpenPlacement.mock.calls).toEqual([
    [{ kind: 'gap', id: 90 }],
    [{ kind: 'path', id: 90 }],
  ]);
});

it('does not replace unavailable canonical boundary Visits with the nearest resolved dates', async () => {
  const responses = overviewResponses();
  responses.set(
    '/trips/7/route',
    routeRead({
      order: [
        { kind: 'visit', id: 998 },
        { kind: 'visit', id: 31 },
        { kind: 'visit', id: 999 },
      ],
      missingSources: [
        { kind: 'visit', id: 998 },
        { kind: 'visit', id: 999 },
      ],
    })
  );
  mountOverview(responses);
  await screen.findByRole('list', { name: 'Route' });
  expect(screen.getByRole('main').querySelector(':scope > p')).toBeNull();
});
