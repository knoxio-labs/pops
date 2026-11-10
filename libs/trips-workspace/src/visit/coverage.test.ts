import { describe, expect, it } from 'vitest';

import { accommodationCoverage, stayProvidesCoverage } from './coverage';
import { sourceStay, sourceVisit } from './test-utils';

import type { Stay } from './types';

describe('Explicit accommodation coverage policy', () => {
  it.each<Stay['status']>([null, 'Considering', 'Agreed', 'Reserved', 'Purchased'])(
    'classifies exact status %s without turning a reservation into purchase',
    (status) => {
      const stay = sourceStay({
        status,
        timing: { arrival: '2030-04-10', departure: '2030-04-16' },
      });
      const result = accommodationCoverage(sourceVisit(), [stay], []);
      const covered = status === 'Agreed' || status === 'Reserved' || status === 'Purchased';
      expect(stayProvidesCoverage(stay)).toBe(covered);
      expect(result.coverageKnown).toBe(status !== null);
      expect(result.periods[0]?.coverage).toEqual(
        status === null
          ? { state: 'unknown' }
          : {
              state: covered ? 'covered' : 'missing',
              arrival: '2030-04-10',
              departure: '2030-04-16',
              stays: covered ? [stay] : [],
            }
      );
      expect(result.periods[0]?.stays).toEqual([stay]);
      expect(stay.status).toBe(status);
    }
  );
  it('keeps checkout switches exclusive and overlaps limited to actual covering sources', () => {
    const stays = [
      sourceStay({ status: 'Agreed' }),
      sourceStay({
        id: 14,
        status: 'Reserved',
        timing: { arrival: '2030-04-13', departure: '2030-04-16' },
      }),
      sourceStay({
        id: 15,
        status: 'Considering',
        timing: { arrival: '2030-04-10', departure: '2030-04-16' },
      }),
      sourceStay({
        id: 16,
        status: 'Purchased',
        timing: { arrival: '2030-04-12', departure: '2030-04-14' },
      }),
    ];
    expect(
      accommodationCoverage(sourceVisit(), stays, []).periods.map((period) => period.coverage)
    ).toEqual([
      { state: 'covered', arrival: '2030-04-10', departure: '2030-04-12', stays: [stays[0]] },
      {
        state: 'covered',
        arrival: '2030-04-12',
        departure: '2030-04-13',
        stays: [stays[0], stays[3]],
      },
      {
        state: 'covered',
        arrival: '2030-04-13',
        departure: '2030-04-14',
        stays: [stays[1], stays[3]],
      },
      { state: 'covered', arrival: '2030-04-14', departure: '2030-04-16', stays: [stays[1]] },
    ]);
  });
  it.each([
    {},
    { arrival: '2030-04-10' },
    { departure: '2030-04-16' },
    { arrival: '2030-04-10', departure: '2030-04-10' },
    { arrival: '2030-04-16', departure: '2030-04-10' },
    { arrival: '2030-02-30', departure: '2030-04-16' },
  ])('keeps invalid or partial Visit bounds unknown: %o', (timing) => {
    const result = accommodationCoverage(sourceVisit({ timing }), [sourceStay()], []);
    expect(result.coverageKnown).toBe(false);
    expect(result.periods.every((period) => period.coverage.state === 'unknown')).toBe(true);
    expect(result.periods.some((period) => period.coverage.state === 'missing')).toBe(false);
  });
  it.each([
    {},
    { arrival: '2030-04-10' },
    { arrival: '2030-04-10', departure: '2030-04-10' },
    { arrival: '2030-04-16', departure: '2030-04-10' },
  ])(
    'retains incomplete or contradictory associated Stays and prevents missing-night assertions: %o',
    (timing) => {
      const partial = sourceStay({ id: 14, status: 'Agreed', timing });
      const idea = sourceStay({
        status: 'Considering',
        timing: { arrival: '2030-04-10', departure: '2030-04-16' },
      });
      const result = accommodationCoverage(sourceVisit(), [partial, idea], []);
      expect(result.coverageKnown).toBe(false);
      expect(result.unplacedStays).toEqual([partial]);
      expect(result.periods[0]?.stays).toEqual([idea]);
      expect(result.periods[0]?.coverage).toEqual({ state: 'unknown' });
    }
  );
  it('never claims missing coverage during incomplete loads or from another occurrence of the same town', () => {
    expect(accommodationCoverage(sourceVisit(), [], [], false)).toMatchObject({
      coverageKnown: false,
      periods: [{ coverage: { state: 'unknown' } }],
    });
    const foreign = sourceStay({ visitId: 32 });
    const result = accommodationCoverage(sourceVisit(), [foreign], []);
    expect(result.periods[0]?.coverage).toEqual({
      state: 'missing',
      arrival: '2030-04-10',
      departure: '2030-04-16',
      stays: [],
    });
    expect(result.periods[0]?.stays).toEqual([]);
  });
  it.each([
    {},
    { arrival: '2030-04-10' },
    { arrival: '2030-04-13', departure: '2030-04-13' },
    { arrival: '2030-04-16', departure: '2030-04-10' },
  ])('keeps undated and contradictory Considering ideas from masking proven gaps: %o', (timing) => {
    const idea = sourceStay({ status: 'Considering', timing });
    const result = accommodationCoverage(sourceVisit(), [idea], []);
    expect(result.coverageKnown).toBe(true);
    expect(result.periods[0]?.coverage).toEqual({
      state: 'missing',
      arrival: '2030-04-10',
      departure: '2030-04-16',
      stays: [],
    });
    expect(result.unplacedStays).toEqual([idea]);
  });
  it('does not downgrade known purchased coverage because a Reserved source has unknown dates', () => {
    const purchased = sourceStay({ status: 'Purchased' });
    const reserved = sourceStay({ id: 14, status: 'Reserved', timing: {} });
    const result = accommodationCoverage(sourceVisit(), [purchased, reserved], []);
    expect(result.periods.map((period) => period.coverage)).toEqual([
      { state: 'covered', arrival: '2030-04-10', departure: '2030-04-13', stays: [purchased] },
      { state: 'unknown' },
    ]);
    expect(result.unplacedStays).toEqual([reserved]);
    expect(result.coverageKnown).toBe(false);
  });
  it('retains fully proven coverage despite incomplete loading or an unset partial candidate', () => {
    const purchased = sourceStay({
      status: 'Purchased',
      timing: { arrival: '2030-04-10', departure: '2030-04-16' },
    });
    const unset = sourceStay({ id: 14, status: null, timing: { arrival: '2030-04-12' } });
    const result = accommodationCoverage(sourceVisit(), [purchased, unset], [], false);
    expect(result.coverageKnown).toBe(true);
    expect(result.periods[0]?.coverage).toEqual({
      state: 'covered',
      arrival: '2030-04-10',
      departure: '2030-04-16',
      stays: [purchased],
    });
    expect(result.unplacedStays).toEqual([unset]);
  });
  it('keeps an unset bounded source uncertain only within its explicit interval', () => {
    const unset = sourceStay({ status: null });
    expect(
      accommodationCoverage(sourceVisit(), [unset], []).periods.map((period) => period.coverage)
    ).toEqual([
      { state: 'unknown' },
      { state: 'missing', arrival: '2030-04-13', departure: '2030-04-16', stays: [] },
    ]);
  });
  it('clips coverage to bounded Visits while retaining source facts outside their boundaries', () => {
    const idea = sourceStay({
      status: 'Considering',
      timing: { arrival: '2030-04-01', departure: '2030-04-20' },
    });
    const result = accommodationCoverage(sourceVisit(), [idea], []);
    expect(result.periods[0]).toMatchObject({
      arrival: '2030-04-01',
      departure: '2030-04-20',
      stays: [idea],
      coverage: { state: 'missing', arrival: '2030-04-10', departure: '2030-04-16', stays: [] },
    });
    expect(idea.timing).toEqual({ arrival: '2030-04-01', departure: '2030-04-20' });
  });
});
