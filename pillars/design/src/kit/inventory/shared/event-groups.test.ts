import { describe, expect, it } from 'vitest';

import { EVENT_CONCEPT, groupByMonth } from './event-groups';

import type { EventKind, EventModel } from './model';

function event(id: string, kind: EventKind, at: string): EventModel {
  return {
    id,
    itemId: `item-${id}`,
    itemName: `Item ${id}`,
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

describe('EVENT_CONCEPT', () => {
  it('draws put back with the put back symbol and restore with undo', () => {
    expect(EVENT_CONCEPT['put-back']).toBe('putBack');
    expect(EVENT_CONCEPT.restored).toBe('undo');
    expect(EVENT_CONCEPT.moved).toBe('move');
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
