import { describe, expect, it } from 'vitest';

import { dayClockIssues, orderVisitDayEntries } from './day-model';

import type { TripRecord } from '@/fixtures/trip-overview-model';

import type { VisitDayEntry } from './day-model';

const record: TripRecord = {
  id: 'activity',
  kind: 'idea',
  placeId: 'place',
  intention: 'In plan',
  arrangement: 'Not needed',
  notes: '',
};
function entry(id: string, time?: string): VisitDayEntry {
  return { id, record: { ...record, id }, time };
}

describe('day visual ordering', () => {
  it('retains added rows when saved order is incomplete or references removed entries', () => {
    const entries = [entry('first'), entry('second'), entry('added')];
    expect(
      orderVisitDayEntries(entries, ['removed', 'second', 'first']).map((item) => item.id)
    ).toEqual(['second', 'first', 'added']);
    expect(orderVisitDayEntries(entries).map((item) => item.id)).toEqual([
      'first',
      'second',
      'added',
    ]);
    expect(entries.map((item) => item.id)).toEqual(['first', 'second', 'added']);
  });

  it('marks both reversed clock rows across date-only rows without assigning the latter a clock', () => {
    const entries = [entry('later', '18:00'), entry('date-only'), entry('earlier', '14:00')];
    expect(dayClockIssues(entries)).toEqual({
      later: ['14:00 < 18:00'],
      earlier: ['14:00 < 18:00'],
    });
    expect(entries[1]?.time).toBeUndefined();
    expect(entries[1]?.record.schedule).toBeUndefined();
  });

  it('compares local clocks numerically and tolerates equal clocks or invalid source clock values', () => {
    expect(dayClockIssues([entry('a', '9:00'), entry('b', '10:00'), entry('c', '10:00')])).toEqual(
      {}
    );
    expect(dayClockIssues([entry('a', '24:01'), entry('b', '12:60'), entry('c')])).toEqual({});
    expect(dayClockIssues([])).toEqual({});
  });
});
