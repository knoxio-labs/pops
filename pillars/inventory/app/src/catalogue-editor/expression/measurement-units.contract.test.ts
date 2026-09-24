import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  combineUnits,
  describeDimension,
  formatUnitTerm,
  parseUnitTerm,
  unitConversionShift,
  unitDimension,
} from './measurement-units';

/**
 * Pins this package's measurement-units copy against
 * `pillars/inventory/contracts/measurement-units-v1.json`, vendored from the
 * server's real unit table (`mise run fixture:measurement-units`). A change
 * to the server's known units, their dimensions or their powers of ten shows
 * up here as a mismatch until the client copy and the vendored vector are
 * both regenerated, so the two cannot drift silently.
 */
const vectorPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'contracts',
  'measurement-units-v1.json'
);

interface MeasurementUnitsVector {
  readonly version: number;
  readonly units: readonly { readonly unit: string; readonly dimension: string }[];
  readonly parse: readonly {
    readonly unit: string;
    readonly parsed: readonly { readonly symbol: string; readonly power: number }[] | null;
    readonly formatted: string | null;
  }[];
  readonly shifts: readonly {
    readonly from: string;
    readonly to: string;
    readonly shift: number | null;
  }[];
  readonly combine: readonly {
    readonly left: string;
    readonly right: string;
    readonly sign: 1 | -1;
    readonly term: readonly { readonly symbol: string; readonly power: number }[] | null;
  }[];
}

const vector: MeasurementUnitsVector = JSON.parse(readFileSync(vectorPath, 'utf8')) as never;

describe('measurement-units contract vector', () => {
  it('is the version this test understands', () => {
    expect(vector.version).toBe(1);
  });

  it('derives the same dimension for every known unit', () => {
    for (const { unit, dimension } of vector.units)
      expect(describeDimension(unitDimension(unit))).toBe(dimension);
  });

  it('parses and formats every sample the same way', () => {
    for (const { unit, parsed, formatted } of vector.parse) {
      expect(parseUnitTerm(unit)).toEqual(parsed);
      expect(formatted === null ? null : formatUnitTerm(parseUnitTerm(unit) ?? [])).toEqual(
        formatted
      );
    }
  });

  it('converts every sample pair by the same power of ten', () => {
    for (const { from, to, shift } of vector.shifts)
      expect(unitConversionShift(from, to)).toBe(shift);
  });

  it('combines every sample pair into the same unit term', () => {
    for (const { left, right, sign, term } of vector.combine)
      expect(combineUnits(left, right, sign)?.term ?? null).toEqual(term);
  });
});
