import { describe, expect, it } from 'vitest';

import { sourceJourney } from '../journey/test-utils';
import { sourceStay, sourceVisits } from '../stay/test-utils';
import {
  dateLabel,
  dateRange,
  detachedRecords,
  journeyRecords,
  visitRecords,
  visitTiming,
} from './model';
import { sourceEvent } from './test-utils';

describe('overview source projection', () => {
  it('preserves repeated town occurrences, route order and explicit associations only', () => {
    const visits = [{ ...sourceVisits[0]!, id: 32 }, sourceVisits[0]!];
    const stays = [sourceStay()];
    const events = [sourceEvent()];
    const result = visitRecords(visits, stays, events);
    expect(result.map((record) => record.visit.id)).toEqual([32, 31]);
    expect(result[0]?.stays).toEqual([]);
    expect(result[0]?.events).toEqual([]);
    expect(result[1]?.stays).toEqual(stays);
    expect(result[1]?.events[0]?.intention).toBe('Alternative');
    expect(result[1]?.events[0]?.purchase).toBeNull();
  });
  it('retains unassociated and missing references when the route is unavailable', () => {
    const records = [
      sourceStay(),
      sourceStay({ id: 14, visitId: null }),
      sourceStay({ id: 15, visitId: 999 }),
    ];
    expect(detachedRecords(records, sourceVisits).map((record) => record.id)).toEqual([14, 15]);
    expect(detachedRecords(records, [])).toEqual(records);
  });
  it('groups only explicit membership and preserves unavailable current or alternative identities', () => {
    const journeys = [sourceJourney(), sourceJourney({ id: 21 }), sourceJourney({ id: 22 })];
    const groups = [
      {
        id: 8,
        tripId: 7,
        revision: 0,
        currentJourneyId: 20,
        alternativeJourneyIds: [21, 999],
        createdAt: '',
        updatedAt: '',
      },
    ];
    const result = journeyRecords(journeys, groups);
    expect(result.independent.map((journey) => journey.id)).toEqual([22]);
    expect(result.groups[0]?.current?.id).toBe(20);
    expect(result.groups[0]?.alternatives).toEqual([
      { id: 21, journey: journeys[1] },
      { id: 999, journey: undefined },
    ]);
    expect(
      journeyRecords(journeys, [{ ...groups[0]!, currentJourneyId: 888 }]).groups[0]?.current
    ).toBeUndefined();
    expect(journeyRecords(journeys, []).independent).toEqual(journeys);
  });
  it('keeps partial, invalid and contradictory date evidence without assigning missing bounds', () => {
    expect(dateRange(undefined, '2028-02-29', 'en-AU')).toBe('… → 29 Feb 2028');
    expect(dateRange('2029-05-03', undefined, 'en-AU')).toBe('3 May 2029 → …');
    expect(dateRange(undefined, undefined, 'en-AU')).toBeUndefined();
    expect(dateLabel('2029-02-29', 'en-AU')).toBe('2029-02-29');
    expect(dateLabel('2029-05-03T12:00', 'en-AU')).toBe('2029-05-03T12:00');
    expect(dateRange('2029-05-03', '2029-05-02', 'en-AU')).toBe('3 May 2029 → 2 May 2029');
    expect(
      visitTiming(
        {
          ...sourceVisits[0]!,
          timing: {
            month: { year: 2029, month: 2, part: 'late' },
            duration: { min: 2, max: 3, unit: 'weeks' },
          },
        },
        'en-AU',
        (value) => value
      )
    ).toBe('late February 2029 · 2–3 weeks');
    expect(visitTiming({ ...sourceVisits[0]!, timing: {} }, 'en-AU', (value) => value)).toBe('');
  });
});
