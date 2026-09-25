import { describe, expect, it } from 'vitest';

import {
  KIND_GROUP,
  NO_FILTER,
  filterEvents,
  groupByMonth,
  groupCounts,
  isFiltered,
} from './activity-model';
import { formatWhen, monthLabel } from './when';

import type { EventKind, EventModel } from '../shared/model';

function event(id: string, kind: EventKind, at: string, extras: Partial<EventModel> = {}) {
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
  } satisfies EventModel;
}

const feed: EventModel[] = [
  event('a', 'moved', '2026-09-24T10:00:00Z'),
  event('b', 'closed', '2026-09-20T10:00:00Z', { actor: 'device' }),
  event('c', 'retired', '2026-08-30T10:00:00Z', { itemName: 'Film camera' }),
  event('d', 'created', '2026-08-02T10:00:00Z', { actor: 'service' }),
  event('e', 'picked-up', '2026-09-25T09:00:00Z', { summary: 'Picked up from Red toolbox' }),
];

describe('filterEvents', () => {
  it('keeps everything with no filter', () => {
    expect(filterEvents(feed, NO_FILTER)).toHaveLength(feed.length);
    expect(isFiltered(NO_FILTER)).toBe(false);
  });

  it('narrows by kind family', () => {
    const moves = filterEvents(feed, { ...NO_FILTER, group: 'placement' });
    expect(moves.map((entry) => entry.id)).toEqual(['a', 'e']);
  });

  it('narrows by actor', () => {
    const phone = filterEvents(feed, { ...NO_FILTER, actor: 'device' });
    expect(phone.map((entry) => entry.id)).toEqual(['b']);
  });

  it('matches the query against item name and summary, ignoring case and spaces', () => {
    expect(filterEvents(feed, { ...NO_FILTER, query: '  FILM ' }).map((e) => e.id)).toEqual(['c']);
    expect(filterEvents(feed, { ...NO_FILTER, query: 'toolbox' }).map((e) => e.id)).toEqual(['e']);
    expect(isFiltered({ ...NO_FILTER, query: ' x ' })).toBe(true);
    expect(isFiltered({ ...NO_FILTER, query: '   ' })).toBe(false);
  });

  it('combines every part of the filter', () => {
    const none = filterEvents(feed, { group: 'placement', actor: 'device', query: '' });
    expect(none).toEqual([]);
  });
});

describe('groupByMonth', () => {
  it('puts the newest month first and sorts inside each month', () => {
    const groups = groupByMonth(feed);
    expect(groups.map((group) => group.label)).toEqual(['September 2026', 'August 2026']);
    expect(groups[0]?.events.map((entry) => entry.id)).toEqual(['e', 'a', 'b']);
    expect(groups[1]?.events.map((entry) => entry.id)).toEqual(['c', 'd']);
  });

  it('returns no groups for no events', () => {
    expect(groupByMonth([])).toEqual([]);
  });
});

describe('groupCounts', () => {
  it('counts each family and the total', () => {
    const counts = groupCounts(feed);
    expect(counts).toEqual({
      all: 5,
      placement: 2,
      containers: 1,
      edits: 0,
      lifecycle: 1,
      created: 1,
    });
  });

  it('files every event kind under a chip', () => {
    for (const group of Object.values(KIND_GROUP)) expect(group).not.toBe('all');
  });
});

describe('formatWhen', () => {
  const now = '2026-09-25T10:45:00Z';

  it('says just now, then minutes, then the clock', () => {
    expect(formatWhen('2026-09-25T10:44:30Z', now)).toBe('Just now');
    expect(formatWhen('2026-09-25T10:33:00Z', now)).toBe('12 min ago');
    expect(formatWhen('2026-09-25T09:45:00Z', now)).toBe('09:45');
  });

  it('names yesterday, then the weekday, then the date', () => {
    expect(formatWhen('2026-09-24T18:10:00Z', now)).toBe('Yesterday 18:10');
    expect(formatWhen('2026-09-20T19:45:00Z', now)).toBe('Sun 19:45');
    expect(formatWhen('2026-09-18T08:00:00Z', now)).toBe('18 Sep');
  });

  it('never says minutes for a time after now', () => {
    expect(formatWhen('2026-09-25T10:50:00Z', now)).toBe('10:50');
  });

  it('labels months in full', () => {
    expect(monthLabel('2026-08-02T10:00:00Z')).toBe('August 2026');
  });
});
