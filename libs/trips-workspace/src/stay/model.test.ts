import { describe, expect, it } from 'vitest';

import { calendarNights, changeTiming, neighbouringStays, staySource } from './model';
import { sourceStay } from './test-utils';

describe('Stay source mapping', () => {
  it('changes and clears only the selected timing member, including clocks without dates', () => {
    const timing = sourceStay().timing;
    expect(changeTiming(timing, 'arrival', '')).toEqual({
      departure: timing.departure,
      checkIn: timing.checkIn,
      checkOut: timing.checkOut,
      timeZone: timing.timeZone,
    });
    expect(timing.arrival).toBe('2029-04-10');
    expect(changeTiming({}, 'checkOut', '23:59')).toEqual({ checkOut: '23:59' });
    expect(changeTiming({ checkIn: '02:30' }, 'timeZone', 'America/Chicago')).toEqual({
      checkIn: '02:30',
      timeZone: 'America/Chicago',
    });
  });
  it('counts checkout-exclusive calendar nights across DST without deriving clocks', () => {
    expect(
      calendarNights({
        arrival: '2028-03-11',
        departure: '2028-03-13',
        timeZone: 'America/Chicago',
      })
    ).toBe(2);
    for (const timing of [
      {},
      { arrival: '2029-01-01' },
      { arrival: '2029-01-01', departure: '2029-01-01' },
      { arrival: '2029-01-02', departure: '2029-01-01' },
    ])
      expect(calendarNights(timing)).toBeUndefined();
  });
  it('uses only explicit visit identity for neighbours, never place/date proximity or unknown associations', () => {
    const source = sourceStay();
    const neighbour = sourceStay({ id: 14, timing: {} });
    const foreign = sourceStay({ id: 15, visitId: 32 });
    const unlinked = sourceStay({ id: 16, visitId: null });
    expect(neighbouringStays(source, [source, neighbour, foreign, unlinked])).toEqual([neighbour]);
    expect(neighbouringStays(unlinked, [source, neighbour, foreign, unlinked])).toEqual([]);
  });
  it('undo snapshots retain every opaque reference and source fact but exclude server identities/audit', () => {
    const source = sourceStay();
    const snapshot = staySource(source);
    expect(snapshot).not.toHaveProperty('id');
    expect(snapshot).not.toHaveProperty('tripId');
    expect(snapshot).not.toHaveProperty('createdAt');
    expect(snapshot).not.toHaveProperty('updatedAt');
    expect(snapshot).toEqual({
      address: source.address,
      documentLinks: source.documentLinks,
      hostLinks: source.hostLinks,
      kind: source.kind,
      name: source.name,
      notes: source.notes,
      reference: source.reference,
      sourceLinks: source.sourceLinks,
      status: source.status,
      timing: source.timing,
      visitId: source.visitId,
    });
  });
});
