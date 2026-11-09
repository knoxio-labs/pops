import { describe, expect, it } from 'vitest';

import { arrangementCoverageLabel, shortArrangementDates } from './format';

describe('compact source dates', () => {
  it('retains different years while displaying a shared year only once', () => {
    expect(shortArrangementDates(['2028-01-03', '2028-01-05'])).toBe('3 Jan — 5 Jan 2028');
    expect(shortArrangementDates(['2027-12-29', '2028-01-03'])).toBe('29 Dec 2027 — 3 Jan 2028');
    expect(shortArrangementDates([])).toBe('');
    expect(shortArrangementDates(['2028-01-03'])).toBe('3 Jan 2028');
  });

  it('keeps invalid source dates explicit and formats typed gap bounds without parsing prose', () => {
    expect(shortArrangementDates(['2027-02-30'])).toBe('Invalid source date: 2027-02-30');
    expect(
      arrangementCoverageLabel({
        id: 'gap',
        kind: 'stay',
        recordIds: ['visit'],
        title: 'Accommodation not recorded',
        detail: 'Visit',
        start: '2028-01-03',
        end: '2028-01-05',
      })
    ).toBe('Visit · 3 Jan — 5 Jan 2028');
    expect(
      arrangementCoverageLabel({
        id: 'gap',
        kind: 'transport',
        recordIds: ['a', 'b'],
        title: 'Transport not recorded',
        detail: 'A → B',
      })
    ).toBe('A → B');
  });
});
