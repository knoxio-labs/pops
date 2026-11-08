import { describe, expect, it } from 'vitest';

import { initialSettings } from './fixture';
import { eligibleParents, saveSettings, settingsFindings, settingsTitle } from './model';

describe('settings titles', () => {
  it('uses the custom name until cleared, then the destination and valid start year', () => {
    const state = initialSettings();
    expect(settingsTitle(state.trip)).toBe('Brazil · 2027');
    state.trip.name = '  Family visit  ';
    expect(settingsTitle(state.trip)).toBe('Family visit');
    state.trip.name = '  ';
    expect(settingsTitle(state.trip)).toBe('Brazil · 2027');
  });

  it.each(['', '2027-02-29', '2028-02-30', '2028-1-01', 'unknown'])(
    'does not infer a year for absent or invalid start %s',
    (start) => {
      const state = initialSettings('nested');
      state.trip.start = start;
      state.trip.end = '2029-02-10';
      expect(settingsTitle(state.trip)).toBe('Brazil');
    }
  );

  it('uses a generic title without a destination and accepts real leap dates', () => {
    const state = initialSettings('empty');
    state.trip.start = '2028-02-29';
    expect(settingsTitle(state.trip)).toBe('Trip');
    state.trip.destination = '  Anywhere  ';
    expect(settingsTitle(state.trip)).toBe('Anywhere · 2028');
    expect(settingsFindings(state)).toEqual([]);
  });
});

describe('settings validation', () => {
  it('allows independent optional dates including the same start and end date', () => {
    const state = initialSettings('empty');
    state.trip.end = '2028-02-29';
    expect(settingsFindings(state)).toEqual([]);
    state.trip.start = '2028-02-29';
    expect(settingsFindings(state)).toEqual([]);
    state.trip.end = '';
    expect(settingsFindings(state)).toEqual([]);
  });

  it('reports invalid dates without comparing invalid source strings', () => {
    const state = initialSettings('empty');
    state.trip.start = '2028-02-30';
    state.trip.end = '2027-02-29';
    expect(settingsFindings(state).map(({ id }) => id)).toEqual(['invalid-start', 'invalid-end']);
    expect(settingsFindings(initialSettings('reversed-dates')).map(({ id }) => id)).toEqual([
      'reversed-dates',
    ]);
  });

  it('reports missing selected references without changing source catalogues', () => {
    const state = initialSettings('missing-reference');
    const original = structuredClone(state);
    expect(settingsFindings(state).map(({ id }) => id)).toEqual(['missing-tag', 'missing-parent']);
    expect(saveSettings(state)).toBe(state);
    expect(state).toEqual(original);
  });

  it('rejects self and descendant parents while retaining every source entry', () => {
    const state = initialSettings('existing');
    const original = structuredClone(state);
    expect(eligibleParents(state).map(({ id }) => id)).toEqual(['trip-south-america']);
    for (const parentId of ['trip-brazil', 'trip-olinda', 'trip-rio-weekend']) {
      const invalid = { ...state, trip: { ...state.trip, parentId } };
      expect(settingsFindings(invalid).map(({ id }) => id)).toEqual(['parent-cycle']);
      expect(saveSettings(invalid)).toBe(invalid);
    }
    expect(state).toEqual(original);
  });

  it('terminates traversal through a pre-existing catalogue cycle', () => {
    const state = initialSettings('existing');
    state.trips = [
      { id: 'trip-brazil', name: 'Brazil', parentId: 'child' },
      { id: 'child', name: 'Child', parentId: 'trip-brazil' },
      { id: 'other', name: 'Other', parentId: 'other' },
    ];
    expect(eligibleParents(state).map(({ id }) => id)).toEqual(['other']);
  });
});

describe('saving settings', () => {
  it('starts creation with an unsaved Brazil draft and supplies existing settings separately', () => {
    const draft = initialSettings();
    expect(draft.trip.id).toBe('draft-trip');
    expect(draft.trips.some(({ id }) => id === draft.trip.id)).toBe(false);
    expect(draft.saved).toBeNull();
    const existing = initialSettings('existing');
    expect(existing.saved).toEqual(existing.trip);
    expect(existing.saved).not.toBe(existing.trip);
  });

  it('saves a new trip with all optional fields empty and creates no reference data', () => {
    const state = initialSettings('empty');
    state.tags = [];
    state.trips = [];
    const original = structuredClone(state);
    const saved = saveSettings(state);
    expect(saved.saved).toEqual(state.trip);
    expect(saved.saved).not.toBe(state.trip);
    expect(saved.tags).toBe(state.tags);
    expect(saved.trips).toBe(state.trips);
    expect(state).toEqual(original);
    saved.trip.notes = 'Changed draft';
    expect(saved.saved?.notes).toBe('');
  });

  it('saves a nested trip with unknown dates without inferring parent bounds', () => {
    const state = initialSettings('empty');
    state.trip.parentId = 'trip-brazil';
    const saved = saveSettings(state);
    expect(saved.saved).toEqual(state.trip);
    expect(saved.saved?.start).toBe('');
    state.trip.start = '2040-01-01';
    expect(settingsFindings(state)).toEqual([]);
  });

  it('produces independent fixture drafts, saved snapshots and catalogues', () => {
    const state = initialSettings('existing');
    const original = structuredClone(state);
    state.trip.notes = 'Draft notes';
    if (state.saved) state.saved.destination = 'Edited saved snapshot';
    const tag = state.tags[0];
    if (tag) tag.name = 'Edited tag';
    const parent = state.trips[0];
    if (parent) parent.name = 'Edited parent';
    expect(initialSettings('existing')).toEqual(original);
  });
});
