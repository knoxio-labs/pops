import { expect, it } from 'vitest';

import { durationValue, monthValue } from './approximate';

it('preserves one-sided zero and fractional bounds and rejects missing units or contradictory bounds', () => {
  expect(durationValue({ min: '0', max: '', unit: 'days' })).toEqual({
    value: { min: 0, unit: 'days' },
  });
  expect(durationValue({ min: '', max: '1.5', unit: 'weeks' })).toEqual({
    value: { max: 1.5, unit: 'weeks' },
  });
  expect(durationValue({ min: '', max: '', unit: '' })).toEqual({ value: undefined });
  for (const draft of [
    { min: '1', max: '', unit: '' },
    { min: '-1', max: '', unit: 'days' },
    { min: 'Infinity', max: '', unit: 'days' },
    { min: '2', max: '1', unit: 'days' },
  ])
    expect(durationValue(draft).error).toBeDefined();
});
it('keeps approximate dates independent and requires only explicitly selected month components', () => {
  expect(monthValue({ year: '', month: '', part: '' })).toEqual({ value: undefined });
  expect(monthValue({ year: '-1', month: '1', part: 'late' })).toEqual({
    value: { year: -1, month: 1, part: 'late' },
  });
  for (const draft of [
    { year: '2030', month: '', part: '' },
    { year: '', month: '1', part: '' },
    { year: '2030', month: '13', part: '' },
    { year: '2030.5', month: '1', part: '' },
  ])
    expect(monthValue(draft).error).toBeDefined();
});
