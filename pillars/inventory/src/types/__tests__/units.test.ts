import { describe, expect, it } from 'vitest';

import {
  convert,
  isKnownUnit,
  unitBySymbol,
  UnitDimensionMismatchError,
  unitsForDimension,
} from '../units.js';

describe('unitBySymbol / isKnownUnit', () => {
  it('finds a known unit with its dimension and multiplier', () => {
    expect(unitBySymbol('mm')).toEqual({ symbol: 'mm', dimension: 'length', multiplier: 0.001 });
  });

  it('returns undefined and false for an unknown symbol', () => {
    expect(unitBySymbol('furlong')).toBeUndefined();
    expect(isKnownUnit('furlong')).toBe(false);
  });
});

describe('unitsForDimension', () => {
  it('returns every unit declared for a dimension', () => {
    expect(unitsForDimension('length')).toEqual(['mm', 'cm', 'm']);
  });

  it('returns exactly one unit for a dimension with a single member', () => {
    expect(unitsForDimension('power')).toEqual(['W']);
  });
});

describe('convert', () => {
  it('converts between two units of the same dimension', () => {
    expect(convert(1500, 'mm', 'm')).toBeCloseTo(1.5);
    expect(convert(2, 'm', 'cm')).toBeCloseTo(200);
  });

  it('is a no-op converting a unit to itself', () => {
    expect(convert(42, 'W', 'W')).toBe(42);
  });

  it('throws crossing dimensions', () => {
    expect(() => convert(1, 'm', 'kg')).toThrow(UnitDimensionMismatchError);
  });

  it('throws for an unknown unit on either side', () => {
    expect(() => convert(1, 'furlong', 'm')).toThrow(/unknown unit/);
    expect(() => convert(1, 'm', 'furlong')).toThrow(/unknown unit/);
  });
});
