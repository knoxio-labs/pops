import { describe, expect, it } from 'vitest';

import { initialVisitEditor } from './fixture';
import {
  addVisitPlace,
  beginNewVisit,
  beginVisit,
  commitVisit,
  resetVisitDraft,
  routeLabel,
  visitErrors,
  visitFindings,
  visitTimingLabel,
} from './model';

describe('city visit editing', () => {
  it('keeps exact dates unknown despite separately dated purchased stays and events', () => {
    const state = initialVisitEditor();
    expect(state.draft.arrival).toBe('');
    expect(state.draft.departure).toBe('');
    expect(visitFindings(state, state.draft)).toEqual([]);
    expect(visitTimingLabel(state.draft)).toBe('Dec 2027 · 2–3 weeks');
    const next = commitVisit(state, {
      ...state.draft,
      arrival: '2027-12-12',
      notes: 'Arrive independently',
    });
    expect(next.stays).toEqual(state.stays);
    expect(next.events).toEqual(state.events);
    expect(next.visits[1]?.departure).toBe('');
    expect(state.draft.arrival).toBe('');
  });

  it('creates repeated city visits with independent identities after the selected visit', () => {
    const initial = initialVisitEditor();
    const state = beginNewVisit(initial, initial.selectedId, 'visit-curitiba-again');
    expect(visitErrors(state, state.draft)).toEqual(['Choose an available city.']);
    expect(commitVisit(state, state.draft)).toBe(state);
    const next = commitVisit(state, {
      ...state.draft,
      placeId: 'place-curitiba',
      arrival: '2028-01-05',
    });
    expect(next.visits.map((visit) => visit.id)).toEqual([
      'visit-sao-paulo',
      'visit-curitiba',
      'visit-curitiba-again',
      'visit-porto-alegre',
    ]);
    expect(next.selectedId).toBe('visit-curitiba-again');
    expect(next.creating).toBe(false);
    expect(next.visits[1]).toEqual(initial.visits[1]);
    expect(next.stays).toEqual(initial.stays);
    expect(
      commitVisit(beginNewVisit(initial, 'removed', 'appended'), {
        ...state.draft,
        id: 'appended',
        placeId: 'place-curitiba',
      }).visits.at(-1)?.id
    ).toBe('appended');
  });

  it('adds arbitrary reusable places without renaming sources or saving a visit', () => {
    const state = initialVisitEditor();
    const next = addVisitPlace(state, '  Somewhere entirely new  ', 'place-new');
    expect(next.places.at(-1)).toEqual({ id: 'place-new', name: 'Somewhere entirely new' });
    expect(next.draft.placeId).toBe('place-new');
    expect(next.visits).toEqual(state.visits);
    expect(next.places[1]).toEqual(state.places[1]);
    expect(addVisitPlace(state, ' ', 'blank')).toBe(state);
    expect(addVisitPlace(state, 'Rename', 'place-curitiba')).toBe(state);
  });

  it.each([
    ['0', '0'],
    ['0.5', '2.25'],
    ['10000', '1000000'],
    ['', '0.5'],
    ['2.5', ''],
  ])(
    'accepts explicit duration bounds %s to %s without shortcut limits',
    (durationMin, durationMax) => {
      const state = initialVisitEditor();
      const draft = { ...state.draft, durationMin, durationMax };
      expect(visitErrors(state, draft)).toEqual([]);
      expect(commitVisit(state, draft).draft).toEqual(draft);
    }
  );

  it.each(['2027-02-29', '2028-02-30', '2027-13-01', '2027-1-01', 'not-a-date'])(
    'rejects malformed or impossible exact date %s',
    (arrival) => {
      const state = initialVisitEditor();
      expect(visitErrors(state, { ...state.draft, arrival })).toContain(
        'Arrival must be a valid calendar date.'
      );
      expect(commitVisit(state, { ...state.draft, arrival })).toBe(state);
      expect(visitTimingLabel({ ...state.draft, arrival })).not.toContain(arrival);
    }
  );

  it('accepts leap days and validates departure independently', () => {
    const state = initialVisitEditor();
    expect(visitErrors(state, { ...state.draft, arrival: '2028-02-29' })).toEqual([]);
    expect(visitErrors(state, { ...state.draft, departure: '2027-02-29' })).toContain(
      'Departure must be a valid calendar date.'
    );
  });

  it.each(['2027-00', '2027-13', '2027-1', '2027-12-01', 'garbage'])(
    'rejects malformed approximate month %s',
    (month) => {
      const state = initialVisitEditor();
      expect(visitErrors(state, { ...state.draft, month })).toContain(
        'Approximate month must be a valid year and month.'
      );
    }
  );

  it.each(['-1', 'Infinity', 'NaN', ' ', '1e999'])('rejects invalid duration %s', (durationMin) => {
    const state = initialVisitEditor();
    expect(visitErrors(state, { ...state.draft, durationMin })).toContain(
      'Minimum duration must be a finite non-negative number.'
    );
  });

  it('rejects reversed duration bounds but preserves reversed exact dates as a finding', () => {
    const state = initialVisitEditor();
    expect(visitErrors(state, { ...state.draft, durationMin: '3', durationMax: '2' })).toContain(
      'Maximum duration must not precede minimum duration.'
    );
    const draft = { ...state.draft, arrival: '2027-12-20', departure: '2027-12-10' };
    expect(visitErrors(state, draft)).toEqual([]);
    expect(visitFindings(state, draft).map((finding) => finding.id)).toContain('reversed-dates');
    expect(commitVisit(state, draft).draft).toEqual(draft);
  });

  it('reports each stay excluded by known bounds and never changes purchased source dates', () => {
    const state = initialVisitEditor('conflict');
    expect(visitFindings(state, state.draft).map((finding) => finding.id)).toEqual([
      'stay-stay-jardim',
      'stay-stay-ipe',
    ]);
    const next = commitVisit(state, state.draft);
    expect(next.stays).toEqual(state.stays);
    const boundaries = { ...state.draft, arrival: '2027-12-14', departure: '2027-12-20' };
    expect(visitFindings(state, boundaries)).toEqual([]);
    expect(visitFindings(state, { ...boundaries, arrival: '', departure: '' })).toEqual([]);
    expect(
      visitFindings(state, { ...boundaries, arrival: '', departure: '2027-12-18' }).map(
        (finding) => finding.id
      )
    ).toEqual(['stay-stay-ipe']);
  });

  it('keeps missing references editable without exposing raw identities', () => {
    const state = initialVisitEditor('missing-reference');
    expect(routeLabel(state, state.draft)).toBe('City unavailable');
    expect(visitFindings(state, state.draft).map((finding) => finding.id)).toContain(
      'missing-place'
    );
    expect(visitErrors(state, state.draft)).toContain('Choose an available city.');
  });

  it('resets drafts and selections without sharing source objects', () => {
    const initial = initialVisitEditor();
    const selected = beginVisit(initial, 'visit-sao-paulo');
    expect(selected.draft).toEqual(initial.visits[0]);
    expect(selected.draft).not.toBe(initial.visits[0]);
    expect(beginVisit(initial, 'missing')).toBe(initial);
    const creating = beginNewVisit(initial, initial.selectedId, 'visit-new');
    expect(resetVisitDraft(creating).draft).toEqual(initial.draft);
    expect(
      resetVisitDraft({ ...initial, draft: { ...initial.draft, notes: 'pending' } }).draft.notes
    ).toBe('');
    const next = commitVisit(initial, { ...initial.draft, notes: 'saved' });
    expect(next.draft).not.toBe(next.visits[1]);
    next.draft.notes = 'unsaved';
    expect(next.visits[1]?.notes).toBe('saved');
    expect(initialVisitEditor().draft.notes).toBe('');
  });

  it('provides empty capture and month-only scenarios without derived dates or filler labels', () => {
    const empty = initialVisitEditor('empty');
    expect(empty.creating).toBe(true);
    expect(empty.visits).toHaveLength(3);
    expect(visitTimingLabel(empty.draft)).toBe('');
    const approximate = initialVisitEditor('approximate');
    expect(visitTimingLabel(approximate.draft)).toBe('Dec 2027');
    expect(
      visitTimingLabel({
        ...approximate.draft,
        arrival: '2027-12-01',
        part: 'early',
        durationMin: '0',
        durationMax: '0.5',
      })
    ).toBe('1 Dec → · early Dec 2027 · 0–0.5 weeks');
  });
});
