import { describe, expect, it } from 'vitest';

import { sourceJourney, sourceLeg } from '../journey/test-utils';
import { activeJourneys, calendarEntries, selectionProblem, visibleEntries } from './model';
import { calendarSnapshot, sourceEvent } from './test-utils';
import { calendarInstant, displayDate, validDate } from './time';

import type { CalendarSelection } from './types';

const selection: CalendarSelection = {
  from: '',
  to: '',
  zone: 'Pacific/Auckland',
  kind: 'all',
  journey: '',
};

describe('source calendar clocks', () => {
  it.each([false, true])(
    'preserves explicit local/local interval clipping with resolved instants: %s',
    (resolved) => {
      const snapshot = calendarSnapshot();
      const row = snapshot.journeys[0];
      if (!row) throw new Error('fixture missing');
      row.legs = [
        sourceLeg({
          from: { local: '2028-02-29T12:00', ...(resolved ? { timeZone: 'UTC' } : {}) },
          to: { local: '2028-03-02T12:00', ...(resolved ? { timeZone: 'UTC' } : {}) },
        }),
      ];
      row.timing = {
        journeyId: 20,
        legs: [
          {
            legId: 40,
            departure: resolved ? '2028-02-29T12:00:00Z' : null,
            arrival: resolved ? '2028-03-02T12:00:00Z' : null,
            elapsedMinutes: resolved ? 2880 : null,
          },
        ],
        connections: [],
        findings: [],
        window: null,
      };
      const entries = visibleEntries(snapshot, {
        ...selection,
        kind: 'journey',
        zone: 'UTC',
        from: '2028-03-01',
        to: '2028-03-01',
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        key: 'leg:40:departure',
        date: '2028-02-29',
        clock: '12:00',
        instant: resolved ? '2028-02-29T12:00:00Z' : null,
        endDate: '2028-03-02',
        endInstant: resolved ? '2028-03-02T12:00:00Z' : null,
        endExclusive: true,
        placementDate: '2028-03-01',
        continuing: true,
      });
    }
  );

  it.each([
    { precision: 'day/local', from: { date: '2028-02-29' }, to: { local: '2028-03-02T12:00' } },
    { precision: 'local/day', from: { local: '2028-02-29T12:00' }, to: { date: '2028-03-02' } },
  ])('keeps mixed $precision endpoints as independent source-day points', ({ from, to }) => {
    const snapshot = calendarSnapshot();
    const row = snapshot.journeys[0];
    if (!row) throw new Error('fixture missing');
    row.legs = [sourceLeg({ from, to })];
    row.timing = {
      journeyId: 20,
      legs: [{ legId: 40, departure: null, arrival: null, elapsedMinutes: null }],
      connections: [],
      findings: [],
      window: null,
    };
    const entries = calendarEntries(snapshot).filter((entry) => entry.source.kind === 'journey');
    expect(entries.map((entry) => entry.date)).toEqual(['2028-02-29', '2028-03-02']);
    for (const entry of entries) {
      expect(entry.instant).toBeNull();
      expect(entry).not.toHaveProperty('endDate');
      expect(entry).not.toHaveProperty('endInstant');
      expect(entry).not.toHaveProperty('endExclusive');
    }
    expect(
      visibleEntries(snapshot, {
        ...selection,
        kind: 'journey',
        zone: 'UTC',
        from: '2028-03-01',
        to: '2028-03-01',
      })
    ).toEqual([]);
  });

  it('places day-only Journey endpoints on their exact supplied days without a duration or all-day range', () => {
    const snapshot = calendarSnapshot();
    const row = snapshot.journeys[0];
    if (!row) throw new Error('fixture missing');
    row.legs = [
      sourceLeg({
        from: { date: '2028-02-29', timeZone: 'Pacific/Kiritimati' },
        to: { date: '2028-03-02' },
      }),
    ];
    row.timing = {
      journeyId: 20,
      legs: [
        {
          legId: 40,
          departure: null,
          arrival: null,
          elapsedMinutes: null,
          departureSource: { date: '2028-02-29', precision: 'day' },
          arrivalSource: { date: '2028-03-02', precision: 'day' },
        },
      ],
      connections: [],
      findings: [],
      window: null,
    };
    const entries = calendarEntries(snapshot).filter((entry) => entry.source.kind === 'journey');
    expect(entries.map((entry) => entry.date)).toEqual(['2028-02-29', '2028-03-02']);
    for (const entry of entries) {
      expect(entry.instant).toBeNull();
      expect(entry.clock).toBeUndefined();
      expect(entry).not.toHaveProperty('endDate');
      expect(entry).not.toHaveProperty('endExclusive');
    }
    for (const zone of ['Pacific/Honolulu', 'Pacific/Kiritimati']) {
      expect(
        visibleEntries(snapshot, {
          ...selection,
          kind: 'journey',
          zone,
          from: '2028-03-01',
          to: '2028-03-01',
        })
      ).toEqual([]);
      expect(
        visibleEntries(snapshot, {
          ...selection,
          kind: 'journey',
          zone,
          from: '2028-02-29',
          to: '2028-02-29',
        }).map((entry) => entry.key)
      ).toEqual(['leg:40:departure']);
    }
  });
  it('rejects both DST folds and gaps, absent fields, unsupported zones and invalid dates', () => {
    expect(calendarInstant('2029-03-11', '02:30', 'America/New_York')).toBeNull();
    expect(calendarInstant('2029-11-04', '01:30', 'America/New_York')).toBeNull();
    expect(calendarInstant('2029-02-29', '12:00', 'UTC')).toBeNull();
    expect(calendarInstant('2029-02-01', undefined, 'UTC')).toBeNull();
    expect(calendarInstant(undefined, '12:00', 'UTC')).toBeNull();
    expect(calendarInstant('2029-02-01', '12:00')).toBeNull();
    expect(calendarInstant('2029-02-01', '12:00', 'Unknown/Place')).toBeNull();
    expect(calendarInstant('2029-02-01', '00:00', 'Pacific/Auckland')).toBe('2029-01-31T11:00:00Z');
    expect(calendarInstant('2029-02-01', '12:00', '+01:00')).toBeNull();
    expect(calendarInstant('2029-02-01', '12:00:30', 'UTC')).toBeNull();
    expect(validDate('2028-02-29')).toBe(true);
    expect(validDate('2029-02-29')).toBe(false);
  });

  it('keeps floating dates distinct from display dates across the date line', () => {
    const snapshot = calendarSnapshot();
    snapshot.events = [
      sourceEvent({
        timing: { start: '2029-02-01', startTime: '00:30', timeZone: 'Pacific/Auckland' },
      }),
      sourceEvent({ id: 61, timing: { start: '2029-02-01' } }),
    ];
    const entries = calendarEntries(snapshot).filter((entry) => entry.source.kind === 'event');
    expect(entries[0]).toMatchObject({
      date: '2029-02-01',
      clock: '00:30',
      zone: 'Pacific/Auckland',
      instant: '2029-01-31T11:30:00Z',
    });
    expect(displayDate(entries[0]?.instant ?? '', 'Pacific/Honolulu')).toBe('2029-01-31');
    expect(entries[1]).toMatchObject({ date: '2029-02-01', instant: null });
    expect(
      visibleEntries(snapshot, {
        ...selection,
        zone: 'Pacific/Honolulu',
        from: '2029-01-31',
        to: '2029-01-31',
        kind: 'event',
      }).map((row) => row.source.id)
    ).toEqual([60]);
    expect(snapshot.events[1]?.timing).toEqual({ start: '2029-02-01' });
  });
});

describe('source-backed calendar selection', () => {
  it('excludes only explicit alternative journeys, retaining every event intention and ungrouped Alternative leg', () => {
    const snapshot = calendarSnapshot();
    const first = snapshot.journeys[0];
    if (!first) throw new Error('fixture missing');
    snapshot.journeys.push(
      { ...first, journey: sourceJourney({ id: 21 }) },
      {
        ...first,
        journey: sourceJourney({ id: 22 }),
        legs: [sourceLeg({ id: 44, journeyId: 22, intention: 'Alternative' })],
        timing: {
          ...first.timing,
          journeyId: 22,
          legs: first.timing.legs.map((leg) => ({ ...leg, legId: 44 })),
        },
      }
    );
    snapshot.groups = [
      {
        id: 80,
        tripId: 7,
        currentJourneyId: 20,
        alternativeJourneyIds: [21],
        revision: 1,
        createdAt: '2029-01-01T00:00:00Z',
        updatedAt: '2029-01-01T00:00:00Z',
      },
    ];
    expect(activeJourneys(snapshot).map(({ journey }) => journey.id)).toEqual([20, 22]);
    expect(calendarEntries(snapshot).some((row) => row.source.id === 22)).toBe(true);
    expect(calendarEntries(snapshot).find((row) => row.source.kind === 'event')?.facts).toContain(
      'Alternative'
    );
    expect(calendarEntries(snapshot).find((row) => row.source.kind === 'event')?.purchased).toBe(
      false
    );
  });

  it('uses actual half-open timing.window, including its first instant and excluding its last', () => {
    const snapshot = calendarSnapshot();
    const source = snapshot.journeys[0];
    if (!source?.timing.window) throw new Error('fixture missing');
    snapshot.events = [
      sourceEvent({
        id: 61,
        timing: { start: '2029-02-01', startTime: '00:00', timeZone: 'Pacific/Auckland' },
      }),
      sourceEvent({
        id: 62,
        timing: { start: '2029-02-04', startTime: '00:00', timeZone: 'Pacific/Auckland' },
      }),
      sourceEvent({ id: 63, timing: {} }),
    ];
    expect(
      visibleEntries(snapshot, { ...selection, journey: '20', kind: 'event' }).map(
        (row) => row.source.id
      )
    ).toEqual([61, 63]);
    source.timing.window = null;
    expect(selectionProblem({ ...selection, journey: '20' }, snapshot)).toBe('window');
    expect(visibleEntries(snapshot, { ...selection, journey: '20' })).toEqual([]);
  });

  it('reports invalid controls and retains inspectable reversed or unresolvable sources', () => {
    const snapshot = calendarSnapshot();
    snapshot.events = [
      sourceEvent({
        timing: { start: '2029-11-04', startTime: '01:30', timeZone: 'America/New_York' },
      }),
      sourceEvent({ id: 61, timing: { start: '2029-02-03', end: '2029-02-01' } }),
      sourceEvent({ id: 62, timing: { startTime: '08:30' } }),
    ];
    expect(selectionProblem({ ...selection, zone: '' }, snapshot)).toBe('zone');
    expect(selectionProblem({ ...selection, from: '2029-02-03', to: '2029-02-01' }, snapshot)).toBe(
      'range'
    );
    expect(selectionProblem({ ...selection, from: '2029-02-29' }, snapshot)).toBe('range');
    expect(
      visibleEntries(snapshot, {
        ...selection,
        kind: 'event',
        from: '2029-06-01',
        to: '2029-06-01',
      }).map((row) => row.source.id)
    ).toEqual([61, 61, 60, 62]);
    expect(
      calendarEntries(snapshot)
        .filter((row) => row.source.id === 61)
        .every((row) => row.conflict)
    ).toBe(true);
    expect(calendarEntries(snapshot).find((row) => row.source.id === 62)).toMatchObject({
      clock: '08:30',
      instant: null,
    });
  });

  it('retains ongoing stays inside a date window without assigning midnight, and excludes checkout from occupancy', () => {
    const snapshot = calendarSnapshot();
    const rows = visibleEntries(snapshot, {
      ...selection,
      kind: 'stay',
      from: '2029-02-02',
      to: '2029-02-03',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      date: '2029-02-01',
      endDate: '2029-02-04',
      placementDate: '2029-02-02',
      continuing: true,
      instant: null,
    });
    const checkout = visibleEntries(snapshot, {
      ...selection,
      kind: 'stay',
      from: '2029-02-04',
      to: '2029-02-04',
    });
    expect(checkout.map((row) => row.boundary)).toEqual(['checkOut']);
  });

  it('does not compare a resolved start with an unresolved end to invent an ongoing instant interval', () => {
    const snapshot = calendarSnapshot();
    snapshot.events = [
      sourceEvent({
        timing: {
          start: '2029-02-01',
          startTime: '20:30',
          end: '2029-02-03',
          timeZone: 'Pacific/Auckland',
        },
      }),
    ];
    const entries = visibleEntries(snapshot, {
      ...selection,
      kind: 'event',
      from: '2029-02-02',
      to: '2029-02-03',
    });
    expect(entries.map((entry) => entry.boundary)).toEqual(['end']);
    expect(entries[0]?.instant).toBeNull();
  });

  it('keeps wide ranges proportional to source records and orders resolved clocks before floating dates', () => {
    const snapshot = calendarSnapshot();
    snapshot.events = [
      sourceEvent({
        id: 7,
        timing: { start: '2029-02-01', startTime: '22:00', timeZone: 'Pacific/Auckland' },
      }),
      sourceEvent({ id: 8, timing: { start: '2029-02-01' } }),
      sourceEvent({
        id: 9,
        timing: { start: '2029-02-01', startTime: '20:00', timeZone: 'Pacific/Auckland' },
      }),
    ];
    const rows = visibleEntries(snapshot, {
      ...selection,
      kind: 'event',
      from: '0001-01-01',
      to: '9999-12-31',
    });
    expect(rows.map((row) => row.source.id)).toEqual([9, 7, 8]);
  });

  it('does not invent floating Event occupancy between independent source dates', () => {
    const snapshot = calendarSnapshot();
    snapshot.events = [sourceEvent({ timing: { start: '2029-02-01', end: '2029-02-04' } })];
    expect(
      visibleEntries(snapshot, {
        ...selection,
        kind: 'event',
        from: '2029-02-02',
        to: '2029-02-03',
      })
    ).toEqual([]);
    expect(
      calendarEntries(snapshot)
        .filter((entry) => entry.source.kind === 'event')
        .map((entry) => entry.boundary)
    ).toEqual(['start', 'end']);
  });

  it('retains a zone captured without dates or clocks and independent endpoints on opposite sides of the date line', () => {
    const snapshot = calendarSnapshot();
    snapshot.events = [sourceEvent({ timing: { timeZone: 'Pacific/Auckland' } })];
    expect(calendarEntries(snapshot).find((row) => row.source.kind === 'event')).toMatchObject({
      boundary: 'unknown',
      zone: 'Pacific/Auckland',
      instant: null,
    });
    const source = snapshot.journeys[0];
    if (!source) throw new Error('fixture missing');
    source.legs = [
      sourceLeg({
        from: { local: '2029-02-02T09:00', timeZone: 'Pacific/Auckland' },
        to: { local: '2029-02-01T13:00', timeZone: 'Pacific/Honolulu' },
      }),
    ];
    source.timing.legs = [
      {
        legId: 40,
        departure: '2029-02-01T20:00:00Z',
        arrival: '2029-02-01T23:00:00Z',
        elapsedMinutes: 180,
      },
    ];
    expect(
      calendarEntries(snapshot)
        .filter((row) => row.source.kind === 'journey')
        .map(({ date, clock, zone }) => ({ date, clock, zone }))
    ).toEqual([
      { date: '2029-02-02', clock: '09:00', zone: 'Pacific/Auckland' },
      { date: '2029-02-01', clock: '13:00', zone: 'Pacific/Honolulu' },
    ]);
  });

  it('uses signed authoritative journey endpoints without reinterpreting contradictory source labels', () => {
    const snapshot = calendarSnapshot();
    const source = snapshot.journeys[0];
    if (!source) throw new Error('fixture missing');
    source.timing.legs = [
      {
        legId: 40,
        departure: '2029-02-02T00:00:00Z',
        arrival: '2029-02-01T00:00:00Z',
        elapsedMinutes: -1440,
      },
    ];
    source.timing.findings = [
      { id: 'conflict', kind: 'conflict', code: 'arrival_before_departure', legIds: [40] },
    ];
    expect(
      calendarEntries(snapshot)
        .filter((row) => row.source.kind === 'journey')
        .map((row) => row.instant)
    ).toEqual(['2029-02-02T00:00:00Z', '2029-02-01T00:00:00Z']);
    expect(
      visibleEntries(snapshot, {
        ...selection,
        from: '2029-06-01',
        to: '2029-06-01',
        kind: 'journey',
      })
    ).toHaveLength(2);
  });
});
