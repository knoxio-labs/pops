import { describe, expect, it } from 'vitest';

import { createExploreState } from './fixture';
import {
  captureExploreRecord,
  emptyExploreDraft,
  exploreDraft,
  exploreFacts,
  exploreFindings,
  groupExploreRecords,
  removeExploreRecord,
  updateExploreRecord,
  visibleExploreRecords,
  type ExploreFilters,
} from './model';

const all: ExploreFilters = { query: '', kind: '', cityId: '', status: '', purpose: '' };

describe('one source collection in two views', () => {
  it('groups the identical records by exact source locations without losing regions or absent selections', () => {
    const state = createExploreState();
    const visible = visibleExploreRecords(state, all);
    const groups = groupExploreRecords(visible, state);
    expect(
      groups
        .flatMap((group) => group.records)
        .map((record) => record.id)
        .toSorted()
    ).toEqual(visible.map((record) => record.id).toSorted());
    expect(groups.find((group) => group.id === 'minas')?.name).toBe('Belo Horizonte / Minas');
    expect(groups.find((group) => group.id === '')?.name).toBe('No location');
    const event = state.records.find((record) => record.source === 'event');
    if (!event) throw new Error('Missing event fixture');
    expect(exploreFacts(event)).toMatchObject({
      cityId: 'minas',
      city: 'Belo Horizonte / Minas',
      locationKind: 'region',
    });
  });

  it('keeps unavailable selections distinct from unassigned locations and does not search fallback labels', () => {
    const state = createExploreState('missing-reference');
    const groups = groupExploreRecords(state.records, state);
    expect(groups.find((group) => group.id === 'removed-city')?.name).toBe('Location unavailable');
    expect(groups.find((group) => group.id === '')?.name).toBe('No location');
    expect(visibleExploreRecords(state, { ...all, query: 'Location unavailable' })).toEqual([]);
    expect(
      state.records
        .flatMap((record) => exploreFindings(record))
        .some((finding) => finding.id === 'missing-city')
    ).toBe(true);
  });

  it('searches folded source facts and only selected references, excluding catalogue-only names', () => {
    const state = createExploreState();
    expect(
      visibleExploreRecords(state, { ...all, query: 'ACACIAS' }).map((record) => record.id)
    ).toEqual(['idea-drawing']);
    expect(
      visibleExploreRecords(state, { ...all, query: 'Lina Prado' }).map((record) => record.id)
    ).toEqual(['idea-drawing']);
    expect(visibleExploreRecords(state, { ...all, query: 'Tomás Vale' })).toEqual([]);
    expect(visibleExploreRecords(state, { ...all, query: 'Festival programme.pdf' })).toEqual([]);
    expect(
      visibleExploreRecords(state, { ...all, query: 'Horizonte Produções' }).map(
        (record) => record.id
      )
    ).toEqual(['event-festival']);
    expect(
      visibleExploreRecords(state, { ...all, query: 'Clara' }).map((record) => record.id)
    ).toEqual(['capture-recife-note']);
  });

  it('combines explicit type, location, status and purpose filters without creating relationships', () => {
    const state = createExploreState();
    expect(
      visibleExploreRecords(state, {
        ...all,
        kind: 'activity',
        cityId: 'belo-horizonte',
        status: 'Saved',
        purpose: 'meet-people',
      }).map((record) => record.id)
    ).toEqual(['idea-drawing']);
    expect(visibleExploreRecords(state, { ...all, kind: 'event', purpose: 'visit' })).toEqual([]);
    expect(
      visibleExploreRecords(state, { ...all, kind: 'link' }).map((record) => record.id)
    ).toEqual(['capture-recife-link']);
    expect(visibleExploreRecords(state, { ...all, status: 'Purchased' })).toEqual([]);
    expect(
      createExploreState('undated').records.every((record) => !exploreFacts(record).timing)
    ).toBe(true);
    expect(groupExploreRecords(createExploreState('empty').records)).toEqual([]);
  });
});

describe('optional verbatim capture', () => {
  it('captures text without classification, purpose, location, timing, route membership or purchase', () => {
    const state = createExploreState();
    const before = structuredClone(state);
    const draft = {
      ...emptyExploreDraft(),
      name: ' Ask Clara about a walk.\nKeep both lines. ',
      notes: 'Ask later.',
    };
    const result = captureExploreRecord(state, draft, 'capture-new');
    expect(result.error).toBeNull();
    const record = result.state.records.at(-1);
    if (record?.source !== 'capture') throw new Error('Missing capture result');
    expect(record.capture.text).toBe(draft.name);
    expect(record.capture.kind).toBeUndefined();
    expect(record.kind).toBeUndefined();
    expect(record).toMatchObject({
      cityId: '',
      status: '',
      purpose: '',
      notes: 'Ask later.',
      timing: { mode: 'none' },
    });
    expect(record.capture).toMatchObject({ visitId: '', title: '', start: '', end: '' });
    expect(record).not.toHaveProperty('event');
    expect(state).toEqual(before);
    expect(result.state.records[0]).toBe(state.records[0]);
    draft.timing.from = '2028-01-01';
    expect(record.timing.from).toBe('');
  });

  it.each(['destination', 'place', 'activity', 'idea', 'note', 'event', 'link', 'document'])(
    'accepts explicit kind %s without demanding purpose or dates',
    (kind) => {
      const result = captureExploreRecord(
        createExploreState(),
        { ...emptyExploreDraft(kind), name: 'Explicit source', cityId: 'minas' },
        `new-${kind}`
      );
      expect(result.error).toBeNull();
      const record = result.state.records.at(-1);
      if (!record) throw new Error('Missing captured record');
      expect(exploreFacts(record).kind).toBe(kind);
      expect(exploreFacts(record)).toMatchObject({
        cityId: 'minas',
        locationKind: 'region',
        purpose: '',
        status: '',
      });
    }
  );

  it('rejects invalid selected inputs atomically and preserves optional empty values', () => {
    const state = createExploreState();
    const draft = { ...emptyExploreDraft(), name: 'Source text' };
    for (const [input, id] of [
      [{ ...draft, name: ' ' }, 'new'],
      [draft, ''],
      [draft, 'idea-drawing'],
      [{ ...draft, kind: 'invented' }, 'new'],
      [{ ...draft, cityId: 'missing' }, 'new'],
    ] as const) {
      const result = captureExploreRecord(state, input, id);
      expect(result.state).toBe(state);
      expect(result.error).not.toBeNull();
    }
    const invalid = {
      ...draft,
      timing: { mode: 'dates' as const, month: '', from: '2027-02-30', to: '' },
    };
    expect(captureExploreRecord(state, invalid, 'new').state).toBe(state);
  });
});

describe('local source edits and undo snapshots', () => {
  it('edits event facts while preserving exact location kinds, metadata and route/purchase fields', () => {
    const state = createExploreState();
    const event = state.records.find((record) => record.source === 'event');
    if (event?.source !== 'event') throw new Error('Missing event fixture');
    const source = structuredClone(event);
    const result = updateExploreRecord(state, event.id, {
      ...exploreDraft(event),
      name: 'Edited festival',
      notes: 'Ask about access.',
    });
    const updated = result.state.records.find((record) => record.id === event.id);
    if (updated?.source !== 'event') throw new Error('Missing edited event');
    expect(updated.event).toEqual({
      ...source.event,
      title: 'Edited festival',
      notes: 'Ask about access.',
    });
    expect(updated.metadata).toBe(event.metadata);
    expect(updated.places.find((place) => place.id === 'minas')?.kind).toBe('region');
    expect(updated.places.find((place) => place.id === 'airport-syd')?.kind).toBe('airport');
    expect(event).toEqual(source);
    updated.event = { ...updated.event, schedule: { start: '2027-02-30', end: '2027-02-20' } };
    expect(exploreFindings(updated).some((finding) => finding.id === 'invalid-from')).toBe(true);
    expect(exploreFacts(updated).timing).not.toContain('Invalid');
  });

  it('keeps idea reference catalogues city-only and preserves unresolved selections during notes edits', () => {
    const state = createExploreState('missing-reference');
    const idea = state.records.find((record) => record.source === 'idea');
    if (idea?.source !== 'idea') throw new Error('Missing idea fixture');
    const input = { ...exploreDraft(idea), notes: 'New note' };
    const changed = updateExploreRecord(state, idea.id, input);
    const saved = changed.state.records.find((record) => record.id === idea.id);
    if (saved?.source !== 'idea') throw new Error('Missing saved idea');
    expect(saved.idea.cityId).toBe('removed-city');
    expect(saved.idea.cities).toEqual(idea.idea.cities);
    expect(exploreFindings(saved)).toEqual(exploreFindings(idea));
    expect(updateExploreRecord(state, idea.id, { ...input, cityId: 'minas' }).state).toBe(state);
    expect(updateExploreRecord(state, idea.id, { ...input, cityId: 'another-missing' }).state).toBe(
      state
    );
    expect(updateExploreRecord(state, 'missing', input).state).toBe(state);
  });

  it('edits capture notes/title without replacing source material and supports undo by retaining prior snapshots', () => {
    const state = createExploreState();
    const capture = state.records.find((record) => record.source === 'capture');
    if (capture?.source !== 'capture') throw new Error('Missing capture fixture');
    const changed = updateExploreRecord(state, capture.id, {
      ...exploreDraft(capture),
      name: 'A waterfront walk',
      notes: 'Ask tomorrow.',
    });
    const saved = changed.state.records.find((record) => record.id === capture.id);
    if (saved?.source !== 'capture') throw new Error('Missing saved capture');
    expect(saved.capture.text).toBe(capture.capture.text);
    expect(saved.notes).toBe('Ask tomorrow.');
    const removed = removeExploreRecord(changed.state, capture.id);
    expect(removed.records.some((record) => record.id === capture.id)).toBe(false);
    expect(changed.state.records).toContain(saved);
    expect(state.records).toContain(capture);
    expect(removeExploreRecord(state, 'missing')).toBe(state);
    expect(createExploreState().records[0]).not.toBe(state.records[0]);
  });
});
