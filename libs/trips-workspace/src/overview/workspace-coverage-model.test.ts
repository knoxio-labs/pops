import { expect, it } from 'vitest';

import { sourceVisits } from '../stay/test-utils';
import { accommodationCoverage } from '../visit/coverage';
import { coverageScale } from './workspace-coverage-model';

import type { CoverageRecord } from './workspace-coverage-model';

it('leaves the scale undefined when all Visit dates are undecided', () => {
  const visit = sourceVisits[0];
  if (!visit) throw new Error('Missing Visit fixture');
  const undated = { ...visit, timing: {} };
  const record: CoverageRecord = {
    visit: undated,
    coverage: accommodationCoverage(undated, [], [], true),
  };
  expect(coverageScale([record], 'en-AU')).toBeUndefined();
});

it('weights clipped first and last months by their recorded night counts', () => {
  const record = coverageRecord('2029-05-15', '2029-06-02');
  expect(coverageScale([record], 'en-AU')).toMatchObject({
    start: '2029-05-15',
    end: '2029-06-02',
    days: 18,
    months: [
      { label: 'May 2029', days: 17 },
      { label: 'June 2029', days: 1 },
    ],
  });
});

it('orders year-boundary month labels by calendar position', () => {
  const record = coverageRecord('2029-12-30', '2030-01-02');
  expect(coverageScale([record], 'en-AU')?.months).toEqual([
    { label: 'Dec 2029', days: 2 },
    { label: 'Jan 2030', days: 1 },
  ]);
});

it('keeps the final supported calendar year within four-digit date bounds', () => {
  const record = coverageRecord('9999-12-30', '9999-12-31');
  expect(coverageScale([record], 'en-AU')?.months).toEqual([{ label: 'Dec 9999', days: 1 }]);
});

it('ignores malformed source intervals rather than drawing their dates', () => {
  const visit = sourceVisits[0];
  if (!visit) throw new Error('Missing Visit fixture');
  const record: CoverageRecord = {
    visit,
    coverage: {
      periods: [
        {
          arrival: '2029-02-30',
          departure: '2029-03-01',
          stays: [],
          events: [],
          coverage: { state: 'unknown' },
        },
      ],
      unplacedStays: [],
      unplacedEvents: [],
      coverageKnown: false,
    },
  };
  expect(coverageScale([record], 'en-AU')).toBeUndefined();
});

function coverageRecord(arrival: string, departure: string): CoverageRecord {
  const source = sourceVisits[0];
  if (!source) throw new Error('Missing Visit fixture');
  const visit = { ...source, timing: { arrival, departure } };
  return { visit, coverage: accommodationCoverage(visit, [], [], true) };
}
