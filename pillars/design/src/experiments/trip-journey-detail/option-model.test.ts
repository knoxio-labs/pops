import { describe, expect, it } from 'vitest';

import { connectionMinutes } from './model';
import {
  addJourneyOption,
  initialJourneyOptions,
  selectJourneyOption,
  updateJourneyOption,
} from './option-model';

import type { JourneyOptionsState } from './option-model';

function option(state: JourneyOptionsState, index = 0) {
  const source = state.options[index];
  if (!source) throw new Error('Missing test alternative');
  return source;
}

function frozen<T>(source: T): T {
  if (source && typeof source === 'object') {
    Object.freeze(source);
    Object.values(source).forEach((value: unknown) => frozen(value));
  }
  return source;
}

describe('retained journey alternatives', () => {
  it('previews a distinct fictional later source without mutating the current journey', () => {
    const state = frozen(initialJourneyOptions('default'));
    const before = structuredClone(state.current);
    const preview = option(state).journey;
    const previousArrival = preview.legs[0];
    const nextDeparture = preview.legs[1];
    if (!previousArrival || !nextDeparture) throw new Error('Missing alternative connection');
    expect(connectionMinutes(previousArrival, nextDeparture)).toBe(285);
    expect(preview.legs.every((leg) => leg.status === 'Considering' && leg.reference === '')).toBe(
      true
    );
    expect(preview.legs.map((leg) => leg.id)).not.toEqual(state.current.legs.map((leg) => leg.id));
    expect(preview.legs[0]?.from.local).toBe('2028-01-18T10:00');
    expect(preview.locations).toEqual(state.current.locations);
    expect(preview.documents).toEqual(state.current.documents);
    expect(state.current).toEqual(before);
  });

  it('swaps both ways without losing purchase, reference, clock, document or other option facts', () => {
    const state = frozen(addJourneyOption(initialJourneyOptions('default')));
    const selected = option(state);
    const unrelated = option(state, 1);
    const swapped = selectJourneyOption(state, selected.id);
    expect(swapped.current).toEqual(selected.journey);
    expect(option(swapped).journey).toEqual(state.current);
    expect(option(swapped).journey.legs.every((leg) => leg.status === 'Purchased')).toBe(true);
    expect(option(swapped).id).not.toBe(selected.id);
    expect(option(swapped, 1)).toBe(unrelated);
    const restored = selectJourneyOption(swapped, option(swapped).id);
    expect(restored.current).toEqual(state.current);
    expect(option(restored).journey).toEqual(selected.journey);
    expect(option(restored, 1)).toBe(unrelated);
    expect(restored.options).toHaveLength(2);
  });

  it('creates a blank option from current catalogues and configured buffers without source selections', () => {
    const initial = initialJourneyOptions('missing-reference');
    const current = {
      ...initial.current,
      minimumConnectionMinutes: 137,
      airportBufferMinutes: 245,
    };
    const state = frozen({ ...initial, current });
    const added = addJourneyOption(state);
    const blank = option(added, 1).journey;
    expect(blank).toEqual({
      locations: current.locations,
      documents: current.documents,
      minimumConnectionMinutes: 137,
      airportBufferMinutes: 245,
      legs: [],
      documentIds: [],
      reference: '',
      notes: '',
      context: [],
    });
    expect(added.current).toBe(current);
    expect(option(added)).toBe(option(state));
    expect(state.options).toHaveLength(1);
  });

  it('edits only the named option and keeps the working journey and other alternatives unchanged', () => {
    const state = frozen(addJourneyOption(initialJourneyOptions('default')));
    const edited = {
      ...option(state).journey,
      notes: 'Explicit alternative note',
      airportBufferMinutes: 220,
    };
    const updated = updateJourneyOption(state, option(state).id, edited);
    expect(updated.current).toBe(state.current);
    expect(option(updated).journey).toBe(edited);
    expect(option(updated, 1)).toBe(option(state, 1));
    expect(option(state).journey.notes).not.toBe(edited.notes);
  });

  it('keeps unknown IDs as identity no-ops and starts the empty scenario without alternatives', () => {
    const state = frozen(initialJourneyOptions('empty'));
    expect(state.current.legs).toEqual([]);
    expect(state.options).toEqual([]);
    expect(selectJourneyOption(state, 'missing')).toBe(state);
    expect(updateJourneyOption(state, 'missing', state.current)).toBe(state);
    const added = addJourneyOption(state);
    expect(added.options).toHaveLength(1);
    expect(option(added).journey.legs).toEqual([]);
  });
});
