import { describe, expect, it } from 'vitest';

import { eventConcept, filterCounts, filterEvents, filterOf, groupByMonth } from './history-model';

import type { EventKind, EventModel } from '../../foundation';

function event(id: string, kind: EventKind, at: string): EventModel {
  return {
    id,
    itemId: 'itm-tv',
    itemName: 'Television',
    kind,
    at,
    actor: 'web',
    actorName: 'Joao on the web',
    summary: id,
    before: null,
    after: null,
    reason: null,
    undoable: false,
  };
}

const events = [
  event('moved-sep', 'moved', '2026-09-20T10:00:00Z'),
  event('created-jul', 'created', '2026-07-02T08:00:00Z'),
  event('retired-sep', 'retired', '2026-09-22T10:00:00Z'),
  event('field-aug', 'field-changed', '2026-08-31T23:59:59Z'),
  event('field-sep', 'field-changed', '2026-09-01T00:00:00Z'),
];

describe('filterOf and eventConcept', () => {
  it('sorts every kind into one filter', () => {
    expect(filterOf('picked-up')).toBe('placement');
    expect(filterOf('opened')).toBe('placement');
    expect(filterOf('code-set')).toBe('details');
    expect(filterOf('restored')).toBe('lifecycle');
  });

  it('draws put back with the put back symbol and restore with undo', () => {
    expect(eventConcept('put-back')).toBe('putBack');
    expect(eventConcept('restored')).toBe('undo');
  });
});

describe('filterEvents', () => {
  it('keeps everything, newest first, for All', () => {
    expect(filterEvents(events, 'all').map((e) => e.id)).toEqual([
      'retired-sep',
      'moved-sep',
      'field-sep',
      'field-aug',
      'created-jul',
    ]);
  });

  it('keeps only the chosen kind', () => {
    expect(filterEvents(events, 'placement').map((e) => e.id)).toEqual(['moved-sep']);
    expect(filterEvents(events, 'lifecycle').map((e) => e.id)).toEqual(['retired-sep']);
    expect(filterEvents(events, 'details').map((e) => e.id)).toEqual([
      'field-sep',
      'field-aug',
      'created-jul',
    ]);
  });

  it('returns nothing, not everything, when no event matches', () => {
    expect(filterEvents([events[1] as EventModel], 'lifecycle')).toEqual([]);
  });
});

describe('filterCounts', () => {
  it('counts each chip, with All as the total', () => {
    expect(filterCounts(events)).toEqual({ all: 5, placement: 1, details: 3, lifecycle: 1 });
  });
});

describe('groupByMonth', () => {
  it('groups by UTC calendar month, newest month first, events newest first', () => {
    const groups = groupByMonth(events);
    expect(groups.map((g) => g.label)).toEqual(['September 2026', 'August 2026', 'July 2026']);
    expect(groups[0]?.events.map((e) => e.id)).toEqual(['retired-sep', 'moved-sep', 'field-sep']);
  });

  it('puts the last second of a month and the first of the next in different groups', () => {
    const groups = groupByMonth([events[3] as EventModel, events[4] as EventModel]);
    expect(groups.map((g) => g.key)).toEqual(['2026-09', '2026-08']);
  });

  it('returns no groups for no events', () => {
    expect(groupByMonth([])).toEqual([]);
  });
});
