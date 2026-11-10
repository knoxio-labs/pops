import { describe, expect, it } from 'vitest';

import { accommodationPeriods, dateLabel } from './periods';
import { sourceEvent, sourceStay, sourceVisit } from './test-utils';

describe('Explicit visit accommodation periods', () => {
  it('uses checkout-exclusive periods, retains every intention and never borrows matching city identities', () => {
    const visit = sourceVisit();
    const first = sourceStay();
    const next = sourceStay({
      id: 14,
      timing: { arrival: '2030-04-13', departure: '2030-04-16' },
      status: 'Purchased',
    });
    const foreign = sourceStay({ id: 15, visitId: 32 });
    const intentions = ['In plan', 'Considering', 'Alternative'] as const;
    const events = intentions.map((intention, index) =>
      sourceEvent({
        id: index,
        intention,
      })
    );
    const result = accommodationPeriods(visit, [first, next, foreign], events);
    expect(
      result.periods.map((period) => [
        period.arrival,
        period.departure,
        period.stays.map((stay) => stay.id),
        period.events.map((event) => event.id),
      ])
    ).toEqual([
      ['2030-04-10', '2030-04-13', [13], []],
      ['2030-04-13', '2030-04-16', [14], [0, 1, 2]],
    ]);
    expect(result.unplacedStays).toEqual([]);
    expect(visit).toEqual(sourceVisit());
    expect(first).toEqual(sourceStay());
  });
  it('asserts gaps only with complete valid visit bounds and completely dated accommodation context', () => {
    const partial = sourceStay({ id: 14, timing: { arrival: '2030-04-14' } });
    expect(accommodationPeriods(sourceVisit(), [sourceStay()], []).periods.at(-1)?.stays).toEqual(
      []
    );
    expect(accommodationPeriods(sourceVisit(), [sourceStay(), partial], []).periods).toHaveLength(
      1
    );
    expect(accommodationPeriods(sourceVisit(), [partial], []).unplacedStays).toEqual([partial]);
    for (const timing of [
      {},
      { arrival: '2030-04-10' },
      { arrival: '2030-04-16', departure: '2030-04-10' },
      { arrival: '2030-02-30', departure: '2030-04-16' },
    ]) {
      expect(accommodationPeriods(sourceVisit({ timing }), [], []).periods).toEqual([]);
    }
    expect(accommodationPeriods(sourceVisit(), [], [], false).periods).toEqual([]);
  });
  it('preserves overlapping accommodation, independent dates outside the visit and uncertain activities', () => {
    const stays = [
      sourceStay(),
      sourceStay({ id: 14, timing: { arrival: '2030-04-12', departure: '2030-04-18' } }),
    ];
    const events = [
      sourceEvent({ id: 1, timing: {} }),
      sourceEvent({ id: 2, timing: { end: '2030-04-12' } }),
      sourceEvent({ id: 3, timing: { start: '2030-04-18' } }),
      sourceEvent({ id: 4, visitId: 32 }),
    ];
    const result = accommodationPeriods(sourceVisit(), stays, events);
    expect(
      result.periods.map((period) => [
        period.arrival,
        period.departure,
        period.stays.map((stay) => stay.id),
      ])
    ).toEqual([
      ['2030-04-10', '2030-04-12', [13]],
      ['2030-04-12', '2030-04-13', [13, 14]],
      ['2030-04-13', '2030-04-18', [14]],
    ]);
    expect(result.unplacedEvents.map((event) => event.id)).toEqual([1, 2, 3]);
  });
});

it('formats literal calendar days with the supplied viewer locale without timezone shifts', () => {
  expect(dateLabel('2030-04-10', 'en-AU')).toBe('10 Apr 2030');
  expect(dateLabel('2030-04-10', 'pt-BR')).toBe('10 de abr. de 2030');
  expect(dateLabel('2030-02-30', 'pt-BR')).toBe('2030-02-30');
  expect(dateLabel(undefined, 'pt-BR')).toBe('');
});
