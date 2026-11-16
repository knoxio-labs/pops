import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { captureSource } from '../capture/test-utils';
import { sourceJourney, sourceLeg } from '../journey/test-utils';
import { routeRead } from '../route/test-utils';
import { sourceStay, sourceVisits } from '../stay/test-utils';
import { mountOverview as mount } from './render.test-utils';
import { overviewResponses, overviewTrip } from './test-utils';

afterEach(cleanup);

describe('source-backed TripOverview', () => {
  it('shows the known Journey day without inventing a clock or changing its independent source', async () => {
    const responses = overviewResponses();
    responses.set('/trips/7/journeys/20/legs', {
      legs: [sourceLeg({ from: { date: '2028-02-29' }, to: {} })],
    });
    mount(responses);
    expect(await screen.findByText('29 Feb 2028 → …')).toBeVisible();
    expect(screen.queryByText(/2028-02-29T00:00/)).not.toBeInTheDocument();
  });
  it('searches recorded visit and booking facts and switches between sheet and journey layouts', async () => {
    const responses = overviewResponses();
    responses.set('/trips/7/stays', {
      stays: [
        sourceStay({
          timing: { arrival: '2029-05-01', departure: '2029-05-04' },
          status: 'Reserved',
        }),
      ],
    });
    responses.set('/trips/7/events', { events: [] });
    mount(responses);
    const search = await screen.findByRole('textbox', { name: 'workspace.search' });
    await userEvent.type(search, 'Cedar Lane');
    expect(await screen.findByRole('link', { name: 'Wellington' })).toBeVisible();
    await userEvent.clear(search);
    await userEvent.click(screen.getByRole('button', { name: 'workspace.booked' }));
    expect(await screen.findByRole('link', { name: 'Cedar guesthouse' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'workspace.journey' }));
    expect(screen.getByRole('list', { name: 'Route' })).toHaveAttribute(
      'data-workspace-display',
      'journey'
    );
  });
  it('searches unplaced arrangements and keeps only confirmed sources in the booked filter', async () => {
    const responses = overviewResponses();
    responses.set('/trips/7/stays', {
      stays: [
        sourceStay({ visitId: null, name: "Dad's place", status: 'Agreed' }),
        sourceStay({ id: 14, visitId: null, name: 'Coast hotel idea', status: 'Considering' }),
      ],
    });
    responses.set('/trips/7/events', { events: [] });
    mount(responses);
    const search = await screen.findByRole('textbox', { name: 'workspace.search' });
    await userEvent.type(search, "Dad's");
    expect(await screen.findByRole('link', { name: "Dad's place" })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Wellington' })).not.toBeInTheDocument();
    await userEvent.clear(search);
    await userEvent.click(screen.getByRole('button', { name: 'workspace.booked' }));
    expect(screen.getByRole('link', { name: "Dad's place" })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Coast hotel idea' })).not.toBeInTheDocument();
  });
  it('keeps route and orphaned stay issues while hiding complete visits and journeys', async () => {
    const responses = overviewResponses();
    responses.set('/trips/7/journeys', {
      journeys: [sourceJourney(), sourceJourney({ id: 21, name: 'Unplaced ferry' })],
    });
    responses.set('/trips/7/stays', {
      stays: [
        sourceStay({
          timing: { arrival: '2029-05-01', departure: '2029-05-09' },
          status: 'Reserved',
        }),
        sourceStay({
          id: 14,
          visitId: 998,
          name: 'Orphaned stay',
          timing: {},
          status: 'Considering',
        }),
      ],
    });
    responses.set(
      '/trips/7/route',
      routeRead({
        order: [
          { kind: 'visit', id: 31 },
          { kind: 'gap', id: 90 },
          { kind: 'journey', id: 20 },
          { kind: 'visit', id: 999 },
        ],
        missingSources: [{ kind: 'visit', id: 999 }],
      })
    );
    mount(responses);
    expect(await screen.findByRole('link', { name: 'Harbour connection' })).toBeVisible();
    expect(await screen.findByRole('link', { name: 'Unplaced ferry' })).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'workspace.needs-attention' }));

    const route = screen.getByRole('list', { name: 'Route' });
    expect(within(route).getByText('gap #90')).toBeVisible();
    expect(within(route).getByRole('link', { name: 'visit #999 · missing' })).toBeVisible();
    expect(within(route).queryByRole('link', { name: 'Wellington' })).not.toBeInTheDocument();
    expect(
      within(route).queryByRole('link', { name: 'Harbour connection' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Orphaned stay' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Unplaced ferry' })).not.toBeInTheDocument();
  });
  it('searches journey leg details while retaining the owning Journey source', async () => {
    mount(overviewResponses());
    const search = await screen.findByRole('textbox', { name: 'workspace.search' });
    await userEvent.type(search, 'Harbour operator');
    expect(await screen.findByRole('link', { name: 'Harbour connection' })).toBeVisible();
    expect(await screen.findByText('Hydrofoil · Harbour operator')).toBeVisible();
    expect(screen.queryByRole('link', { name: /Cedar guesthouse/ })).not.toBeInTheDocument();
  });
  it('shows an empty result when a Journey leg does not match the search', async () => {
    const responses = overviewResponses();
    responses.set('/trips/7/route', routeRead({ order: [{ kind: 'journey', id: 20 }] }));
    mount(responses);
    const search = await screen.findByRole('textbox', { name: 'workspace.search' });
    await userEvent.type(search, 'not in this itinerary');
    expect(await screen.findByText('workspace.noRouteResults')).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Route' })).not.toBeInTheDocument();
  });
  it('shows an empty result when the booked filter excludes every Journey leg', async () => {
    const responses = overviewResponses();
    responses.set('/trips/7/route', routeRead({ order: [{ kind: 'journey', id: 20 }] }));
    responses.set('/trips/7/journeys/20/legs', {
      legs: [sourceLeg({ arrangement: 'Not arranged' })],
    });
    mount(responses);
    await screen.findByRole('textbox', { name: 'workspace.search' });
    await userEvent.click(screen.getByRole('button', { name: 'workspace.booked' }));
    expect(await screen.findByText('workspace.noRouteResults')).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Route' })).not.toBeInTheDocument();
  });
  it('searches Journey legs inside an applied path and shows only the matching legs', async () => {
    const responses = overviewResponses();
    responses.set(
      '/trips/7/route',
      routeRead({
        order: [{ kind: 'gap', id: 90 }],
        paths: [
          {
            id: 8,
            title: 'Applied path',
            gapId: 90,
            state: 'applied',
            members: [{ kind: 'journey', id: 20 }],
          },
        ],
      })
    );
    responses.set('/trips/7/journeys/20/legs', {
      legs: [
        sourceLeg(),
        sourceLeg({
          id: 41,
          mode: 'Rail',
          operator: 'Other operator',
          arrangement: 'Not arranged',
        }),
      ],
    });
    mount(responses);
    const search = await screen.findByRole('textbox', { name: 'workspace.search' });
    await userEvent.type(search, 'Harbour operator');
    const path = screen.getByRole('region', { name: 'Applied path' });
    expect(await within(path).findByRole('link', { name: 'Harbour connection' })).toBeVisible();
    expect(await within(path).findByText('Hydrofoil · Harbour operator')).toBeVisible();
    expect(within(path).queryByText('Rail · Other operator')).not.toBeInTheDocument();
  });
  it('applies the booked filter to Journey legs inside an applied path', async () => {
    const responses = overviewResponses();
    responses.set(
      '/trips/7/route',
      routeRead({
        order: [{ kind: 'gap', id: 90 }],
        paths: [
          {
            id: 8,
            title: 'Applied path',
            gapId: 90,
            state: 'applied',
            members: [{ kind: 'journey', id: 20 }],
          },
        ],
      })
    );
    responses.set('/trips/7/journeys/20/legs', {
      legs: [
        sourceLeg(),
        sourceLeg({
          id: 41,
          mode: 'Rail',
          operator: 'Unarranged service',
          arrangement: 'Not arranged',
        }),
      ],
    });
    mount(responses);
    await screen.findByRole('textbox', { name: 'workspace.search' });
    await userEvent.click(screen.getByRole('button', { name: 'workspace.booked' }));
    const path = screen.getByRole('region', { name: 'Applied path' });
    expect(await within(path).findByText('Hydrofoil · Harbour operator')).toBeVisible();
    expect(within(path).queryByText('Rail · Unarranged service')).not.toBeInTheDocument();
  });
  it('opens the published Documents workspace even before the first association exists', async () => {
    mount(overviewResponses(), undefined, { documentsHref: '/trips/7/documents' });
    expect(await screen.findByRole('link', { name: 'Documents' })).toHaveAttribute(
      'href',
      '/trips/7/documents'
    );
    expect(screen.queryByRole('region', { name: 'Documents' })).not.toBeInTheDocument();
  });
  it('renders calendar navigation only when the host supplies its published route and label', async () => {
    mount();
    await screen.findByRole('heading', { name: 'Coast trip' });
    expect(screen.queryByRole('link', { name: 'Calendar' })).not.toBeInTheDocument();
    cleanup();
    mount(overviewResponses(), undefined, {
      calendarLink: { href: '/trips/7/calendar', label: 'Calendar' },
    });
    expect(await screen.findByRole('link', { name: 'Calendar' })).toHaveAttribute(
      'href',
      '/trips/7/calendar'
    );
    expect(screen.getByRole('link', { name: 'Trip settings' })).toHaveAttribute(
      'href',
      '/trips/7/settings'
    );
  });
  it('keeps initial loading distinct from an empty successful route', async () => {
    let finish = (): void => undefined;
    const tripWait = new Promise<void>((resolve) => {
      finish = resolve;
    });
    mount(overviewResponses(), { path: '/trips/7', until: tripWait });
    expect(screen.getByRole('status')).toHaveTextContent('Loading trip sources…');
    expect(screen.queryByText('No route entries.')).not.toBeInTheDocument();
    await act(async () => {
      finish();
    });
    expect(await screen.findByRole('heading', { name: 'Coast trip' })).toBeVisible();
  });
  it('renders real facts, independent statuses and only purchased arrangements as hard', async () => {
    const responses = overviewResponses();
    responses.set('/trips/7/stays', { stays: [sourceStay({ status: 'Purchased' })] });
    const { requests } = mount(responses);
    await screen.findByRole('heading', { name: 'Coast trip' });
    expect(screen.getByText('After the exams')).toBeVisible();
    const event = await screen.findByRole('link', { name: /Harbour festival/ });
    expect(event.closest('article')).toHaveAttribute('data-constraint', 'soft');
    expect(within(event).getByText('Alternative')).toBeVisible();
    expect(within(event).getByText('Booked')).toBeVisible();
    const stay = screen.getByRole('link', { name: /Cedar guesthouse/ });
    expect(stay.closest('article')).toHaveAttribute('data-constraint', 'hard');
    expect(stay).toHaveAttribute('href', '/trips/7/stays/13');
    expect(screen.getByRole('link', { name: /Harbour connection/ })).toHaveAttribute(
      'href',
      '/trips/7/journeys/20'
    );
    expect(await screen.findByText('Hydrofoil · Harbour operator')).toBeVisible();
    expect(screen.getByText('Hydrofoil · Harbour operator').closest('article')).toHaveAttribute(
      'data-constraint',
      'soft'
    );
    expect(requests).toEqual(
      expect.arrayContaining([
        '/trips/7/events',
        '/trips/7/document-associations',
        '/trips/7/journey-groups',
      ])
    );
    expect(screen.queryByText(/unset|Before|After Wellington/)).not.toBeInTheDocument();
  });

  it('keeps repeated towns distinct and does not assign an independent journey to matching places', async () => {
    const responses = overviewResponses();
    responses.set('/trips/7/visits', {
      visits: [sourceVisits[0]!, { ...sourceVisits[0]!, id: 32, timing: {} }],
    });
    responses.set(
      '/trips/7/route',
      routeRead({
        order: [
          { kind: 'visit', id: 32 },
          { kind: 'visit', id: 31 },
        ],
      })
    );
    mount(responses);
    await screen.findByRole('list', { name: 'Route' });
    await screen.findAllByRole('heading', { name: /Wellington/ });
    const occurrences = document.querySelectorAll('[data-visit-id]');
    expect(occurrences).toHaveLength(2);
    expect(
      within(screen.getByRole('region', { name: 'Route' }))
        .getAllByRole('link', { name: 'Wellington' })
        .map((link) => link.getAttribute('href'))
    ).toEqual(['/trips/7/visits/32', '/trips/7/visits/31']);
    expect(occurrences[0]).not.toHaveTextContent('Cedar guesthouse');
    expect(occurrences[1]).toHaveTextContent('Cedar guesthouse');
    expect(occurrences[1]).toHaveTextContent('Harbour festival');
    const journeys = await screen.findByRole('region', { name: 'unplaced' });
    expect(within(journeys).getByText('Harbour connection')).toBeVisible();
    expect(
      within(screen.getByRole('region', { name: 'Route' })).queryByText('Harbour connection')
    ).not.toBeInTheDocument();
  });

  it('retains every group alternative and missing source identity while showing current membership', async () => {
    const responses = overviewResponses();
    responses.set('/trips/7/journeys', {
      journeys: [sourceJourney(), sourceJourney({ id: 21, name: 'Other ferry' })],
    });
    responses.set('/trips/7/journeys/21/legs', {
      legs: [sourceLeg({ id: 41, journeyId: 21, purchase: 'Purchased' })],
    });
    responses.set('/trips/7/journey-groups', {
      groups: [
        {
          id: 2,
          tripId: 7,
          currentJourneyId: 20,
          alternativeJourneyIds: [21, 999],
          revision: 0,
          createdAt: '',
          updatedAt: '',
        },
      ],
    });
    mount(responses);
    await screen.findByText('Current journey');
    await userEvent.click(screen.getByText('Alternatives (2)'));
    expect(screen.getByRole('link', { name: /Other ferry/ })).toBeVisible();
    expect(screen.getByText('journey #999 · Source unavailable')).toBeVisible();
    expect(screen.getByRole('link', { name: /Harbour festival/ })).toBeVisible();
  });

  it('distinguishes an unresolved journey read from an unavailable referenced source', async () => {
    const responses = overviewResponses();
    responses.set('/trips/7/journey-groups', {
      groups: [
        {
          id: 2,
          tripId: 7,
          currentJourneyId: 20,
          alternativeJourneyIds: [],
          revision: 0,
          createdAt: '',
          updatedAt: '',
        },
      ],
    });
    let finish = (): void => undefined;
    const until = new Promise<void>((resolve) => {
      finish = resolve;
    });
    mount(responses, { path: '/trips/7/journeys', until });
    await screen.findByText('Current journey');
    expect(screen.getByRole('link', { name: 'journey #20' })).toBeVisible();
    expect(screen.queryByText(/Source unavailable/)).not.toBeInTheDocument();
    await act(async () => {
      finish();
    });
    expect(await screen.findByRole('link', { name: /Harbour connection/ })).toBeVisible();
  });

  it('distinguishes failed Visit context from an empty route and retains linked facts at explicit canonical references', async () => {
    const responses = overviewResponses();
    responses.delete('/trips/7/visits');
    mount(responses);
    await screen.findByText('trips.source.unavailable');
    expect(screen.queryByText('No route entries.')).not.toBeInTheDocument();
    const root = await screen.findByRole('list', { name: 'Route' });
    expect(within(root).getByText('Cedar guesthouse')).toBeVisible();
    expect(within(root).getByText('Harbour festival')).toBeVisible();
    expect(within(root).getByText('visit #31 · Source unavailable')).toBeVisible();
    expect(within(root).queryByText('Wellington')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trip settings' })).toBeVisible();
  });

  it('retains cached route facts and successful collections when a later refresh fails, then recovers on Retry', async () => {
    const responses = overviewResponses();
    const { cache } = mount(responses);
    await screen.findByRole('link', { name: /Harbour festival/ });
    responses.delete('/trips/7/events');
    await act(async () => {
      await cache.refetchQueries({
        queryKey: ['trips', 'http://overview.test', 7, 'events'],
        exact: true,
      });
    });
    expect(await screen.findByText('trips.source.unavailable')).toBeVisible();
    expect(screen.getByRole('link', { name: /Harbour festival/ })).toBeVisible();
    expect(screen.getByRole('link', { name: /Cedar guesthouse/ })).toBeVisible();
    responses.set('/trips/7/events', { events: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /Harbour festival/ })).not.toBeInTheDocument()
    );
  });

  it('retains missing document targets and decisions without fabricating document resolution', async () => {
    const responses = overviewResponses();
    responses.set('/trips/7/decisions', {
      decisions: [
        {
          id: 9,
          tripId: 7,
          question: 'Which ferry?',
          deadline: '2029-04-20',
          selectedOptionId: null,
          revision: 0,
          notes: '',
          sourceLinks: [],
          createdAt: overviewTrip.createdAt,
          updatedAt: overviewTrip.updatedAt,
        },
      ],
    });
    responses.set('/trips/7/document-associations', {
      associations: [
        {
          id: 1,
          tripId: 7,
          documentId: 102,
          targetKind: 'stay',
          targetId: 999,
          createdAt: overviewTrip.createdAt,
        },
      ],
    });
    mount(responses);
    expect(await screen.findByRole('link', { name: /Which ferry/ })).toHaveAttribute(
      'href',
      '/trips/7/decisions/9'
    );
    expect(screen.getByText('unresolved')).toBeVisible();
    expect(screen.getByText('document #102')).toBeVisible();
    expect(screen.getByRole('link', { name: 'stay #999' })).toHaveAttribute(
      'href',
      '/trips/7/stays/999'
    );
    expect(screen.queryByRole('link', { name: 'Documents' })).not.toBeInTheDocument();
  });

  it('renders an empty route after success and the source error alone when trip identity cannot load', async () => {
    const responses = overviewResponses();
    for (const [path] of responses) {
      if (path === '/trips/7') continue;
      let key = path.split('/').at(-1)!;
      if (key === 'document-associations') key = 'associations';
      if (key === 'journey-groups') key = 'groups';
      responses.set(path, { [key]: [] });
    }
    responses.set('/trips/7/route', routeRead({ order: [] }));
    responses.set('/trips/7/capture-workspace', captureSource());
    responses.set('/trips/7/meeting-plans', { meetingPlans: [] });
    mount(responses);
    expect(await screen.findByText('No route entries.')).toBeVisible();
    cleanup();
    responses.delete('/trips/7');
    mount(responses);
    expect(await screen.findByText('trips.source.unavailable')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Coast trip' })).not.toBeInTheDocument();
    expect(screen.queryByText('No route entries.')).not.toBeInTheDocument();
  });
});
