import { describe, expect, it } from 'vitest';

import {
  decimalPlacesFromPresentation,
  decimalPlacesInputIsValid,
  formatDecimal,
  presentationWithDecimalPlaces,
} from './decimal-places';

describe('decimal-place presentation hints', () => {
  it('accepts only bounded integer display precisions', () => {
    expect(decimalPlacesInputIsValid('')).toBe(true);
    expect(decimalPlacesInputIsValid('0')).toBe(true);
    expect(decimalPlacesInputIsValid('9')).toBe(true);
    expect(decimalPlacesInputIsValid('10')).toBe(false);
    expect(decimalPlacesInputIsValid('1.5')).toBe(false);
  });

  it('preserves unrelated presentation hints while replacing the precision', () => {
    const presentation = presentationWithDecimalPlaces({ highlighted: true, decimalPlaces: 4 }, 1);

    expect(presentation).toEqual({ highlighted: true, decimalPlaces: 1 });
    expect(decimalPlacesFromPresentation(presentation)).toBe(1);
    expect(presentationWithDecimalPlaces(presentation, null)).toEqual({ highlighted: true });
  });

  it.each([
    ['24.0000', 1, '24.0'],
    ['24.05', 1, '24.1'],
    ['24.04', 1, '24.0'],
    ['-0.05', 1, '-0.1'],
    ['12', 3, '12.000'],
  ] as const)('formats %s to %d decimal places as %s', (value, places, expected) => {
    expect(formatDecimal(value, places)).toBe(expected);
  });
});
