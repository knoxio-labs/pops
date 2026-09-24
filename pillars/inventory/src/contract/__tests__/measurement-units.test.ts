import { describe, expect, it } from 'vitest';

import {
  combineUnits,
  describeDimension,
  formatUnitTerm,
  knownUnitFactor,
  parseUnitTerm,
  sameDimension,
  unitConversionShift,
  unitDimension,
} from '../measurement-units.js';

describe('unit terms', () => {
  it('parses and writes back the canonical grammar', () => {
    for (const unit of ['cm', 'cm²', 'cm³', 'kg/m³', 'kg·m/s²', '1/s', 'rpm¹²', 'fl-oz'])
      expect(formatUnitTerm(parseUnitTerm(unit) ?? [])).toBe(unit);
    expect(parseUnitTerm('kg/m³')).toEqual([
      { symbol: 'kg', power: 1 },
      { symbol: 'm', power: -3 },
    ]);
  });

  it('treats any other text as no unit term', () => {
    for (const unit of [
      '',
      'cm¹',
      'cm¹⁰⁰',
      'cm⁰²',
      'fl oz',
      'm/s/s',
      'cm·cm',
      'cm/cm',
      '·cm',
      'm/',
      '1',
      '²',
      'm⁻¹',
    ])
      expect(parseUnitTerm(unit), unit).toBeNull();
  });

  it('gives L the dimension of a cubed length and keeps unknown symbols apart', () => {
    expect(sameDimension(unitDimension('L'), unitDimension('cm³'))).toBe(true);
    expect(sameDimension(unitDimension('L'), unitDimension('cm'))).toBe(false);
    expect(sameDimension(unitDimension('rpm'), unitDimension('rpm'))).toBe(true);
    expect(sameDimension(unitDimension('rpm'), unitDimension('Hz'))).toBe(false);
    expect(sameDimension(unitDimension('fl oz'), unitDimension('fl oz'))).toBe(true);
    expect(sameDimension(unitDimension('fl oz'), unitDimension('fl'))).toBe(false);
    expect(parseUnitTerm('cm2')).toEqual([{ symbol: 'cm2', power: 1 }]);
    expect(sameDimension(unitDimension('cm2'), unitDimension('cm²'))).toBe(false);
    expect(describeDimension(unitDimension('kg/L'))).toBe('mass·length⁻³');
    expect(describeDimension(unitDimension('m/s'))).toBe('length·s⁻¹');
    expect(describeDimension(new Map())).toBe('dimensionless');
  });

  it('converts between same-dimension units by a power of ten', () => {
    expect(unitConversionShift('cm', 'mm')).toBe(1);
    expect(unitConversionShift('mm', 'm')).toBe(-3);
    expect(unitConversionShift('cm³', 'L')).toBe(-3);
    expect(unitConversionShift('kg/L', 'kg/m³')).toBe(3);
    expect(unitConversionShift('cm·rpm', 'rpm·cm')).toBe(0);
    expect(unitConversionShift('fl oz', 'fl oz')).toBe(0);
    expect(unitConversionShift('cm', 'kg')).toBeNull();
    expect(unitConversionShift('cm²', 'L')).toBeNull();
    expect(unitConversionShift('fl oz', 'L')).toBeNull();
  });

  it('merges a right symbol into the same or a same-dimension left symbol', () => {
    expect(combineUnits('cm', 'cm', 1)).toEqual({
      term: [{ symbol: 'cm', power: 2 }],
      rightShift: 0,
    });
    expect(combineUnits('cm²', 'mm', 1)).toEqual({
      term: [{ symbol: 'cm', power: 3 }],
      rightShift: -1,
    });
    expect(combineUnits('cm³', 'cm', -1)).toEqual({
      term: [{ symbol: 'cm', power: 2 }],
      rightShift: 0,
    });
    expect(combineUnits('cm', 'mm', -1)).toEqual({ term: [], rightShift: -1 });
    expect(combineUnits('L', 'cm³', -1)).toEqual({
      term: [
        { symbol: 'L', power: 1 },
        { symbol: 'cm', power: -3 },
      ],
      rightShift: 0,
    });
    expect(combineUnits('rpm', 'cm', 1)?.term).toEqual([
      { symbol: 'rpm', power: 1 },
      { symbol: 'cm', power: 1 },
    ]);
    expect(combineUnits('fl oz', 'cm', 1)).toBeNull();
  });

  it('feeds protocol-1 conversion only known units of one dimension', () => {
    expect(knownUnitFactor('cm', 'mm')).toEqual({ numerator: 10n, denominator: 1n });
    expect(knownUnitFactor('mm', 'm')).toEqual({ numerator: 1n, denominator: 1000n });
    expect(knownUnitFactor('L', 'L')).toEqual({ numerator: 1n, denominator: 1n });
    expect(knownUnitFactor('L', 'cm')).toBeNull();
    expect(knownUnitFactor('rpm', 'rpm')).toBeNull();
  });
});
