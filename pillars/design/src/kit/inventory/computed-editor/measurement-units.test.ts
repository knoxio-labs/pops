import { describe, expect, it } from 'vitest';

import {
  combineUnits,
  formatUnitTerm,
  parseUnitTerm,
  sameDimension,
  unitConversionShift,
  unitDimension,
} from './measurement-units';

describe('parseUnitTerm', () => {
  it('parses a bare symbol and a superscript power', () => {
    expect(parseUnitTerm('cm')).toEqual([{ symbol: 'cm', power: 1 }]);
    expect(parseUnitTerm('cm²')).toEqual([{ symbol: 'cm', power: 2 }]);
  });

  it('parses a quotient, with 1 over a bare denominator', () => {
    expect(parseUnitTerm('kg/m³')).toEqual([
      { symbol: 'kg', power: 1 },
      { symbol: 'm', power: -3 },
    ]);
    expect(parseUnitTerm('1/s')).toEqual([{ symbol: 's', power: -1 }]);
  });

  it('rejects a repeated symbol and text with no unit-term grammar', () => {
    expect(parseUnitTerm('cm·cm')).toBeNull();
    expect(parseUnitTerm('each')).toEqual([{ symbol: 'each', power: 1 }]);
    expect(parseUnitTerm('per box')).toBeNull();
  });
});

describe('formatUnitTerm', () => {
  it('round-trips through parseUnitTerm', () => {
    for (const unit of ['cm', 'cm²', 'cm³', 'kg/m³'])
      expect(formatUnitTerm(parseUnitTerm(unit) ?? [])).toBe(unit);
  });
});

describe('sameDimension and unitConversionShift', () => {
  it('treats every metric length as the same dimension', () => {
    expect(sameDimension(unitDimension('cm'), unitDimension('mm'))).toBe(true);
    expect(sameDimension(unitDimension('cm'), unitDimension('kg'))).toBe(false);
  });

  it('shifts by the power of ten between two units of the same dimension', () => {
    expect(unitConversionShift('cm', 'mm')).toBe(1);
    expect(unitConversionShift('m', 'cm')).toBe(2);
    expect(unitConversionShift('cm³', 'L')).toBe(-3);
  });

  it('refuses to convert between different dimensions', () => {
    expect(unitConversionShift('cm', 'kg')).toBeNull();
  });
});

describe('combineUnits', () => {
  it('derives cm² then cm³ from repeated multiplication', () => {
    const squared = combineUnits('cm', 'cm', 1);
    expect(squared).not.toBeNull();
    expect(formatUnitTerm(squared?.term ?? [])).toBe('cm²');
    const cubed = combineUnits(formatUnitTerm(squared?.term ?? []), 'cm', 1);
    expect(formatUnitTerm(cubed?.term ?? [])).toBe('cm³');
  });

  it('cancels the same dimension on division into a plain number', () => {
    expect(combineUnits('cm³', 'cm', -1)?.term).toEqual([{ symbol: 'cm', power: 2 }]);
    expect(combineUnits('cm', 'mm', -1)?.term).toEqual([]);
  });

  it('refuses to combine text that is not a unit term', () => {
    expect(combineUnits('each', 'cm', 1)).not.toBeNull();
    expect(combineUnits('per box', 'cm', 1)).toBeNull();
  });
});
