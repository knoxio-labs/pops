import { describe, expect, it } from 'vitest';

import { filterCounts, filterEvents, filterOf } from './history-model.js';

import type { EventKind, EventModel } from '../../foundation/model/model.js';

function event(id: string, kind: EventKind, at: string): EventModel {
  return {
    id,
    itemId: 'item-1',
    itemName: 'Desk lamp',
    kind,
    at,
    actor: 'web',
    actorName: 'Web',
    summary: id,
    before: null,
    after: null,
    reason: null,
    undoable: false,
  };
}

describe('item history filters', () => {
  it('assigns each event kind to the page family', () => {
    expect(filterOf('moved')).toBe('placement');
    expect(filterOf('opened')).toBe('placement');
    expect(filterOf('field-changed')).toBe('details');
    expect(filterOf('photo-added')).toBe('details');
    expect(filterOf('destroyed')).toBe('lifecycle');
    expect(filterOf('restored')).toBe('lifecycle');
  });

  it('filters and orders events without mutating the source list', () => {
    const events = [
      event('old-move', 'moved', '2026-08-01T00:00:00.000Z'),
      event('new-edit', 'field-changed', '2026-09-03T00:00:00.000Z'),
      event('new-move', 'moved', '2026-09-02T00:00:00.000Z'),
    ];

    expect(filterEvents(events, 'placement').map((entry) => entry.id)).toEqual([
      'new-move',
      'old-move',
    ]);
    expect(filterEvents(events, 'all').map((entry) => entry.id)).toEqual([
      'new-edit',
      'new-move',
      'old-move',
    ]);
    expect(events.map((entry) => entry.id)).toEqual(['old-move', 'new-edit', 'new-move']);
  });

  it('counts the complete event set for each filter chip', () => {
    expect(
      filterCounts([
        event('created', 'created', '2026-09-01T00:00:00.000Z'),
        event('moved', 'moved', '2026-09-02T00:00:00.000Z'),
        event('lost', 'lost', '2026-09-03T00:00:00.000Z'),
      ])
    ).toEqual({ all: 3, placement: 1, details: 1, lifecycle: 1 });
  });
});
