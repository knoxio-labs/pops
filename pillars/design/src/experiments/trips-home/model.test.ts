import { describe, expect, it } from 'vitest';

import { initialSettings } from '../trip-settings/fixture';
import { createTripsHomeState } from './fixture';
import { addHomeTrip, homeBucket, homeParentLabel, homeSettingsState, homeTrips } from './model';

function timedTrip(start: string, end: string) {
  return {
    settings: initialSettings('empty').trip,
    updatedAt: '2027-12-01T00:00:00Z',
    route: [{ id: 'first', title: 'São Paulo', kind: 'visit' as const, start, end }],
  };
}

describe('source boundary buckets', () => {
  it.each([
    ['2027-12-16', '2027-12-16', 'current'],
    ['2027-12-10', '2027-12-16', 'current'],
    ['2027-12-16', '2027-12-20', 'current'],
    ['2027-12-17', '', 'upcoming'],
    ['', '2027-12-15', 'past'],
    ['2027-12-10', '', 'other'],
    ['', '2027-12-20', 'other'],
    ['', '', 'other'],
    ['2027-12-20', '2027-12-10', 'other'],
    ['2027-02-30', 'invalid', 'other'],
  ])('classifies %s to %s as %s', (start, end, expected) => {
    expect(homeBucket(timedTrip(start, end), '2027-12-16')).toBe(expected);
  });

  it('never replaces open boundaries with inner dates or parses intention text', () => {
    const trip = timedTrip('', '2027-12-15');
    trip.settings.when = 'Summer 2027–28';
    trip.route.push({ id: 'last', title: 'Return', kind: 'visit', start: '2027-12-20', end: '' });
    expect(homeBucket(trip, '2027-12-16')).toBe('other');
    expect(homeBucket(trip, '2027-02-30')).toBe('other');
    expect(homeBucket(trip, '')).toBe('other');
    expect(trip.settings.when).toBe('Summer 2027–28');
  });
});

describe('trip source search and ordering', () => {
  it('searches title, destination, route, arbitrary when and parent facts with accent folding', () => {
    const state = createTripsHomeState();
    expect(homeTrips(state, 'sao paulo', 'all').map((trip) => trip.settings.id)).toEqual([
      'trip-brazil',
    ]);
    expect(homeTrips(state, 'around july', 'all').map((trip) => trip.settings.id)).toEqual([
      'trip-idea',
    ]);
    expect(homeTrips(state, 'BRAZIL', 'all').map((trip) => trip.settings.id)).toEqual([
      'trip-brazil',
      'trip-olinda',
    ]);
    expect(homeTrips(state, 'Curitiba', 'past')).toEqual([]);
    expect(homeTrips(state, '', 'current').map((trip) => trip.settings.id)).toEqual([
      'trip-curitiba',
    ]);
    const nested = state.trips.find((trip) => trip.settings.id === 'trip-olinda');
    if (!nested) throw new Error('Missing nested fixture');
    expect(homeParentLabel(state, nested)).toBe('Brazil');
    nested.settings.parentId = 'missing';
    expect(homeParentLabel(state, nested)).toBe('Parent unavailable');
    expect(homeTrips(state, 'Parent unavailable', 'all')).toEqual([]);
    nested.settings.parentId = '';
    expect(homeParentLabel(state, nested)).toBe('');
  });

  it('sorts actual validated modification timestamps descending with invalid values last', () => {
    const state = createTripsHomeState();
    const first = state.trips[0];
    const second = state.trips[1];
    const third = state.trips[2];
    if (!first || !second || !third) throw new Error('Missing order fixtures');
    first.updatedAt = '2027-12-16T08:00:00+10:00';
    second.updatedAt = '2027-12-15T23:00:00Z';
    third.updatedAt = '2027-02-30T23:00:00Z';
    const before = structuredClone(state);
    expect(homeTrips(state, '', 'all').map((trip) => trip.settings.id)).toEqual([
      'trip-curitiba',
      'trip-brazil',
      'trip-idea',
      'trip-olinda',
      'trip-hobart',
    ]);
    expect(state).toEqual(before);
  });
});

describe('new local trip snapshots', () => {
  it('allows all optional facts empty and never parses arbitrary when text into route dates', () => {
    const state = createTripsHomeState();
    const draft = initialSettings('empty').trip;
    const added = addHomeTrip(state, draft, '2027-12-16T12:00:00Z');
    expect(added.trips.at(-1)).toEqual({
      settings: draft,
      route: [],
      updatedAt: '2027-12-16T12:00:00Z',
    });
    expect(added.trips.at(-1)?.settings).not.toBe(draft);
    draft.when = 'After exams · 夏';
    expect(added.trips.at(-1)?.settings.when).toBe('');
    const another = addHomeTrip(state, draft, '2027-12-16T12:00:00Z');
    expect(another.trips.at(-1)?.settings.when).toBe('After exams · 夏');
    expect(another.trips.at(-1)?.route).toEqual([]);
    expect(added.tags).toBe(state.tags);
    expect(added.trips[0]).toBe(state.trips[0]);
  });

  it.each(['', 'invalid', '2027-02-30T00:00:00Z', '2027-12-16', '2027-12-16T24:00:00Z'])(
    'refuses invalid modification timestamp %j',
    (value) => {
      const state = createTripsHomeState();
      expect(addHomeTrip(state, initialSettings('empty').trip, value)).toBe(state);
    }
  );

  it('refuses empty/colliding IDs and unavailable or cyclic selected references', () => {
    const state = createTripsHomeState();
    const draft = initialSettings('empty').trip;
    for (const fields of [
      { id: '' },
      { id: ' ' },
      { id: 'trip-brazil' },
      { tagId: 'missing' },
      { parentId: 'missing' },
      { parentId: draft.id },
    ]) {
      expect(addHomeTrip(state, { ...draft, ...fields }, '2027-12-16T12:00:00Z')).toBe(state);
    }
    const child = state.trips[0];
    if (!child) throw new Error('Missing cycle fixture');
    child.settings.parentId = draft.id;
    expect(
      addHomeTrip(state, { ...draft, parentId: child.settings.id }, '2027-12-16T12:00:00Z')
    ).toBe(state);
  });

  it('builds independent settings context from authoritative title, ancestry and tags', () => {
    const state = createTripsHomeState();
    const source = state.trips[0];
    if (!source) throw new Error('Missing settings fixture');
    const before = structuredClone(state);
    const context = homeSettingsState(state, source.settings, source.route);
    expect(context.trips.find((trip) => trip.id === 'trip-brazil')?.name).toBe('Brazil');
    expect(context.tags).toEqual(state.tags);
    context.trip.name = 'Local draft';
    context.trips.forEach((trip) => {
      trip.parentId = '';
    });
    context.tags.forEach((tag) => {
      tag.name = 'Local draft';
    });
    context.route.forEach((record) => {
      record.start = '';
    });
    expect(state).toEqual(before);
  });

  it('provides independent named open, conflicting and missing-parent states', () => {
    expect(createTripsHomeState('empty').trips).toEqual([]);
    for (const scenario of ['open-dates', 'conflicting-dates'] as const) {
      const state = createTripsHomeState(scenario);
      expect(homeTrips(state, '', 'current')).toEqual([]);
    }
    const state = createTripsHomeState('missing-parent');
    const nested = state.trips.find((trip) => trip.settings.id === 'trip-olinda');
    if (!nested) throw new Error('Missing nested fixture');
    expect(homeParentLabel(state, nested)).toBe('Parent unavailable');
    state.tags.splice(0, 1);
    expect(createTripsHomeState().tags).toHaveLength(2);
  });
});
