import { describe, expect, it } from 'vitest';

import { serverKindGroupCounts } from './activity-counts.js';
import {
  KIND_GROUP,
  NO_FILTER,
  changedFields,
  filterEvents,
  groupCounts,
  isFiltered,
  parseActivityFilter,
  safeEventValue,
  writeActivityFilter,
} from './activity-model.js';
import { formatWhen } from './when.js';

import type { EventKind, EventModel } from '../../../foundation/model/model.js';
import type { WebEvent } from '../../../inventory-web/useWebEvents.js';

function event(
  id: string,
  kind: EventKind,
  at: string,
  extras: Partial<EventModel> = {}
): EventModel {
  return {
    id,
    itemId: `item-${id}`,
    itemName: `Item ${id}`,
    kind,
    at,
    actor: 'web',
    actorName: 'Joao on the web',
    summary: `${kind} ${id}`,
    before: null,
    after: null,
    reason: null,
    undoable: false,
    ...extras,
  };
}

const feed: EventModel[] = [
  event('a', 'moved', '2026-09-24T10:00:00Z'),
  event('b', 'closed', '2026-09-20T10:00:00Z', { actor: 'device' }),
  event('c', 'retired', '2026-08-30T10:00:00Z', { itemName: 'Film camera' }),
  event('d', 'created', '2026-08-02T10:00:00Z', { actor: 'service' }),
  event('e', 'picked-up', '2026-09-25T09:00:00Z', { summary: 'Picked up from Red toolbox' }),
];

const source: WebEvent = {
  actor: { kind: 'web', label: 'Joao on the web' },
  after: { name: 'New name', placement: { kind: 'location', locationId: 'room-1' } },
  before: { name: 'Old name', placement: { kind: 'hand' } },
  clientTime: null,
  compensatesSeq: null,
  entityId: 'item-a',
  entityKind: 'item',
  entityName: 'Item a',
  fields: ['name', 'placement', 'name'],
  kind: 'edited',
  reason: null,
  seq: 1,
  serverTime: '2026-09-25T09:00:00Z',
  undoable: false,
};

describe('filterEvents', () => {
  it('filters by kind family, actor, query, and inclusive date range', () => {
    const filtered = filterEvents(feed, {
      ...NO_FILTER,
      group: 'placement',
      actor: 'web',
      query: 'item a',
      from: '2026-09-24',
      to: '2026-09-24',
    });
    expect(filtered.map((entry) => entry.id)).toEqual(['a']);
  });

  it('matches query text in the actor and reason as well as the item and summary', () => {
    expect(
      filterEvents(
        [event('reason', 'retired', '2026-09-01T00:00:00Z', { reason: 'Moved to storage' })],
        { ...NO_FILTER, query: 'STORAGE' }
      )
    ).toHaveLength(1);
    expect(isFiltered({ ...NO_FILTER, query: '   ' })).toBe(false);
  });
});

describe('Activity filter URL state', () => {
  it('parses invalid values safely and clamps a reversed date range', () => {
    expect(
      parseActivityFilter(new URLSearchParams('kind=nope&actor=nope&from=2026-09-20&to=2026-09-01'))
    ).toEqual({
      ...NO_FILTER,
      from: '2026-09-20',
      to: '2026-09-20',
    });
  });

  it('writes only Activity-owned filters and preserves the route', () => {
    const result = writeActivityFilter(new URLSearchParams('segment=activity&event=4'), {
      ...NO_FILTER,
      group: 'edits',
      query: ' cable ',
      from: '2026-09-01',
    });
    expect(result.toString()).toBe('segment=activity&event=4&kind=edits&q=+cable+&from=2026-09-01');
  });
});

describe('Activity display model', () => {
  it('counts every normalized kind under one group', () => {
    expect(groupCounts(feed)).toEqual({
      all: 5,
      placement: 2,
      containers: 1,
      edits: 0,
      lifecycle: 1,
      created: 1,
    });
    for (const group of Object.values(KIND_GROUP)) expect(group).not.toBe('all');
  });

  it('counts server kinds independently of the selected kind filter', () => {
    expect(
      serverKindGroupCounts({ moved: 3, stored: 2, edited: 4, lifecycle_changed: 1, created: 2 })
    ).toEqual({
      all: 12,
      placement: 5,
      containers: 0,
      edits: 4,
      lifecycle: 1,
      created: 2,
    });
  });

  it('renders structured values as JSON and deduplicates changed fields', () => {
    expect(safeEventValue({ kind: 'location', locationId: 'room-1' })).toBe(
      '{"kind":"location","locationId":"room-1"}'
    );
    expect(changedFields(source)).toEqual([
      { name: 'name', label: 'Name', before: 'Old name', after: 'New name' },
      {
        name: 'placement',
        label: 'Placement',
        before: '{"kind":"hand"}',
        after: '{"kind":"location","locationId":"room-1"}',
      },
    ]);
  });

  it('formats row times against a stable UTC reference', () => {
    const now = '2026-09-25T10:45:00Z';
    expect(formatWhen('2026-09-25T10:44:30Z', now)).toBe('Just now');
    expect(formatWhen('2026-09-25T10:33:00Z', now)).toBe('12 min ago');
    expect(formatWhen('2026-09-24T18:10:00Z', now)).toBe('Yesterday 18:10');
    expect(formatWhen('2026-09-18T08:00:00Z', now)).toBe('18 Sept');
  });
});
