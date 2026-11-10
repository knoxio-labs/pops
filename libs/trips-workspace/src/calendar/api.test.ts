import { describe, expect, it, vi } from 'vitest';

import { loadCalendar } from './api';
import { calendarSnapshot, calendarTransport } from './test-utils';

it('loads every published source collection plus owning legs and timing without pagination guesses', async () => {
  const transport = calendarTransport();
  expect(await loadCalendar({ tripId: 7, client: transport.client })).toEqual(calendarSnapshot());
  expect(transport.requests.map(({ path }) => path).toSorted()).toEqual([
    '/trips/7/events',
    '/trips/7/journey-groups',
    '/trips/7/journeys',
    '/trips/7/journeys/20/workspace',
    '/trips/7/stays',
  ]);
});

describe('required calendar reads', () => {
  it.each(['events', 'journey-groups', 'journeys', 'stays', 'journeys/20/workspace'])(
    'rejects %s failure rather than asserting an empty source',
    async (path) => {
      const transport = calendarTransport();
      transport.fail(`/trips/7/${path}`);
      await expect(loadCalendar({ tripId: 7, client: transport.client })).rejects.toMatchObject({
        code: 'trips.calendar.unavailable',
      });
    }
  );

  it('propagates cancellation to obsolete source requests', async () => {
    const transport = calendarTransport();
    let release = () => {};
    transport.wait(
      new Promise<void>((resolve) => {
        release = resolve;
      })
    );
    const cancellation = new AbortController();
    const read = loadCalendar({ tripId: 7, client: transport.client }, cancellation.signal);
    await vi.waitFor(() => expect(transport.requests).toHaveLength(4));
    cancellation.abort();
    expect(transport.requests).toHaveLength(4);
    expect(transport.requests.every(({ signal }) => signal.aborted)).toBe(true);
    release();
    await expect(read).rejects.toBeDefined();
  });
});

it('uses the atomic response source metadata rather than an earlier journey-list version', async () => {
  const transport = calendarTransport();
  const workspace = calendarSnapshot().journeys[0];
  if (!workspace) throw new Error('fixture missing');
  transport.setWorkspaceBody({
    ...workspace,
    journey: { ...workspace.journey, name: 'Latest atomic source' },
  });
  expect(
    (await loadCalendar({ tripId: 7, client: transport.client })).journeys[0]?.journey.name
  ).toBe('Latest atomic source');
});

it.each([
  'trip',
  'journey',
  'timing-owner',
  'missing-timing',
  'extra-timing',
  'foreign-leg',
  'duplicate-leg',
  'connection',
  'finding',
])(
  'rejects %s mismatch at the generated wire boundary without rendering invented unknown clocks',
  async (mismatch) => {
    const transport = calendarTransport();
    const workspace = calendarSnapshot().journeys[0];
    if (!workspace) throw new Error('fixture missing');
    switch (mismatch) {
      case 'trip':
        workspace.journey.tripId = 99;
        break;
      case 'journey':
        workspace.journey.id = 99;
        break;
      case 'timing-owner':
        workspace.timing.journeyId = 99;
        break;
      case 'missing-timing':
        workspace.timing.legs = [];
        break;
      case 'extra-timing':
        workspace.timing.legs.push({
          legId: 99,
          departure: null,
          arrival: null,
          elapsedMinutes: null,
        });
        break;
      case 'foreign-leg': {
        const leg = workspace.legs[0];
        if (!leg) throw new Error('fixture missing');
        leg.journeyId = 99;
        break;
      }
      case 'duplicate-leg': {
        const leg = workspace.legs[0];
        if (!leg) throw new Error('fixture missing');
        workspace.legs.push(leg);
        break;
      }
      case 'connection':
        workspace.timing.connections = [
          { previousLegId: 40, nextLegId: 99, availableMinutes: null },
        ];
        break;
      case 'finding':
        workspace.timing.findings = [
          { id: 'foreign', kind: 'conflict', code: 'clock_unresolved', legIds: [99] },
        ];
        break;
    }
    transport.setWorkspaceBody(workspace);
    await expect(loadCalendar({ tripId: 7, client: transport.client })).rejects.toMatchObject({
      code: 'trips.calendar.snapshot_invalid',
      retryable: true,
    });
  }
);
