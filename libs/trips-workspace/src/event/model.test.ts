import { describe, expect, it } from 'vitest';

import { changeEventTiming, eventRoute, eventSource } from './model';
import { eventVisits, sourceEvent } from './test-utils';

describe('Event source model', () => {
  it('keeps optional date, clock and zone independent and clears only the chosen member', () => {
    const timing = { start: '2029-01-01', startTime: '11:45', timeZone: 'Pacific/Auckland' };
    expect(changeEventTiming(timing, 'start', '')).toEqual({
      startTime: '11:45',
      timeZone: 'Pacific/Auckland',
    });
    expect(changeEventTiming({}, 'endTime', '16:30')).toEqual({ endTime: '16:30' });
    expect(timing.start).toBe('2029-01-01');
  });
  it('uses persisted visit ordering rather than IDs, dates or inferred location', () => {
    expect(eventRoute(sourceEvent(), eventVisits).map((visit) => visit.id)).toEqual([90, 31, 2]);
    expect(eventRoute(sourceEvent({ visitId: 90 }), eventVisits).map((visit) => visit.id)).toEqual([
      90, 31,
    ]);
    expect(eventRoute(sourceEvent({ visitId: 2 }), eventVisits).map((visit) => visit.id)).toEqual([
      31, 2,
    ]);
    expect(eventRoute(sourceEvent({ visitId: null }), eventVisits)).toEqual([]);
    expect(eventRoute(sourceEvent({ visitId: 999 }), eventVisits)).toEqual([]);
  });
  it('restores only editable source facts without identities or audit fields', () => {
    const { id, tripId, createdAt, updatedAt, ...source } = sourceEvent();
    expect([id, tripId, createdAt, updatedAt]).toHaveLength(4);
    expect(eventSource(sourceEvent())).toEqual(source);
  });
});
