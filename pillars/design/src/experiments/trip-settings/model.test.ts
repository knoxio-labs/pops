import { describe, expect, it } from 'vitest';

import { initialSettings } from './fixture';
import { eligibleParents, saveSettings, settingsFindings, settingsTitle } from './model';

describe('settings timing text', () => {
  it('keeps the title independent of When and route years', () => {
    const state = initialSettings('existing');
    state.trip.when = 'Summer 2027–28';
    expect(settingsTitle(state.trip)).toBe('Brazil');
    state.trip.name = '  Family visit  ';
    expect(settingsTitle(state.trip)).toBe('Family visit');
    state.trip.name = ' ';
    expect(settingsTitle(state.trip)).toBe('Brazil');
    state.trip.destination = '';
    expect(settingsTitle(state.trip)).toBe('Trip');
    expect(state.trip).not.toHaveProperty('start');
    expect(state.trip).not.toHaveProperty('end');
    expect(state.trip).not.toHaveProperty('planningWindow');
  });

  it.each(['', 'Summer', 'Around July', '2028-13', '  After exams?  ', 'July\nmaybe August'])(
    'saves arbitrary When text verbatim: %s',
    (when) => {
      const state = initialSettings('existing');
      state.trip.when = when;
      const original = structuredClone(state);
      expect(settingsFindings(state)).toEqual([]);
      const saved = saveSettings(state);
      expect(saved.saved?.when).toBe(when);
      expect(state).toEqual(original);
      expect(saved.route).toEqual(original.route);
      expect(settingsTitle(saved.trip)).toBe('Brazil');
    }
  );
});

describe('settings references', () => {
  it('reports missing selected references without changing catalogues', () => {
    const state = initialSettings('missing-reference');
    const original = structuredClone(state);
    expect(settingsFindings(state).map(({ id }) => id)).toEqual(['missing-tag', 'missing-parent']);
    expect(saveSettings(state)).toBe(state);
    expect(state).toEqual(original);
  });

  it('excludes self and descendants as parents and terminates cyclic source traversal', () => {
    const state = initialSettings('existing');
    expect(eligibleParents(state).map(({ id }) => id)).toEqual(['trip-south-america']);
    for (const parentId of ['trip-brazil', 'trip-olinda', 'trip-rio-weekend']) {
      const invalid = { ...state, trip: { ...state.trip, parentId } };
      expect(settingsFindings(invalid).map(({ id }) => id)).toEqual(['parent-cycle']);
      expect(saveSettings(invalid)).toBe(invalid);
    }
    state.trips = [
      { id: 'trip-brazil', name: 'Brazil', parentId: 'child' },
      { id: 'child', name: 'Child', parentId: 'trip-brazil' },
      { id: 'other', name: 'Other', parentId: 'other' },
    ];
    expect(eligibleParents(state).map(({ id }) => id)).toEqual(['other']);
  });
});

describe('settings snapshots', () => {
  it('starts a new trip without route dates or any mandatory optional values', () => {
    const draft = initialSettings();
    expect(draft.trip.id).toBe('draft-trip');
    expect(draft.saved).toBeNull();
    expect(draft.route).toEqual([]);
    const state = initialSettings('empty');
    state.tags = [];
    state.trips = [];
    expect(settingsFindings(state)).toEqual([]);
    expect(saveSettings(state).saved).toEqual(state.trip);
  });

  it('saves nested planning independently of invalid or reversed route source dates', () => {
    const state = initialSettings('nested');
    state.route = [
      { id: 'invalid', title: 'Visit', kind: 'visit', start: '2028-02-30', end: '' },
      { id: 'reversed', title: 'Journey', kind: 'journey', start: '2028-07-02', end: '2028-07-01' },
    ];
    const original = structuredClone(state);
    const saved = saveSettings(state);
    expect(saved.saved).toEqual(state.trip);
    expect(saved.route).toBe(state.route);
    expect(saved.trips).toBe(state.trips);
    expect(saved.tags).toBe(state.tags);
    expect(state).toEqual(original);
  });

  it('clones saved settings and never mutates route or catalogue sources', () => {
    const state = initialSettings('season');
    const original = structuredClone(state);
    const saved = saveSettings(state);
    expect(saved.saved).not.toBe(state.trip);
    expect(state).toEqual(original);
    state.trip.when = 'Edited';
    expect(saved.saved?.when).toBe('Summer 2027–28');
    expect(saved.route).toEqual(original.route);
    expect(saved.tags).toEqual(original.tags);
    expect(saved.trips).toEqual(original.trips);
  });

  it('creates independent fixture drafts, saved settings and route arrays', () => {
    const state = initialSettings('existing');
    const original = structuredClone(state);
    state.trip.when = 'Edited draft';
    expect(state.saved?.when).toBe('');
    if (state.saved) state.saved.when = 'Edited saved';
    const record = state.route[0];
    if (record) record.start = '';
    expect(initialSettings('existing')).toEqual(original);
  });
});
