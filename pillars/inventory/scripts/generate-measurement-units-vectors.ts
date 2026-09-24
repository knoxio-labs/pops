/**
 * Regenerate `contracts/measurement-units-v1.json`, pinning the client-side
 * unit grammar (`pillars/inventory/app/src/catalogue-editor/expression/measurement-units.ts`,
 * ported for the design kit and the web catalogue editor) against this
 * pillar's real `measurement-units.ts`. The client copy cannot import this
 * package directly (different pnpm workspace member), so this vector is the
 * seam: run with `mise run fixture:measurement-units`, which also re-vendors
 * the app copy; the drift test in the app package fails on any difference.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  combineUnits,
  describeDimension,
  formatUnitTerm,
  parseUnitTerm,
  unitConversionShift,
  unitDimension,
} from '../src/catalogue/measurement-units.js';

import type { UnitFactor } from '../src/catalogue/measurement-units.js';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(packageDir, 'contracts', 'measurement-units-v1.json');

const KNOWN_UNITS = ['mm', 'cm', 'm', 'kg', 'L', 'W', 'V', 'Gbps', 'lm', 'K'] as const;

const PARSE_TERMS = ['cm', 'cm²', 'cm³', 'kg/m³', '1/s', 'each', 'per box', 'cm·cm'] as const;

const SHIFT_PAIRS: readonly (readonly [string, string])[] = [
  ['mm', 'cm'],
  ['m', 'cm'],
  ['cm', 'mm'],
  ['cm³', 'L'],
  ['L', 'cm³'],
  ['cm', 'kg'],
  ['cm', 'W'],
  ['each', 'cm'],
];

const COMBINE_CASES: readonly (readonly [string, string, 1 | -1])[] = [
  ['cm', 'cm', 1],
  ['cm²', 'cm', 1],
  ['cm³', 'cm', -1],
  ['cm', 'mm', -1],
  ['each', 'cm', 1],
  ['per box', 'cm', 1],
];

interface ParseVector {
  readonly unit: string;
  readonly parsed: readonly UnitFactor[] | null;
  readonly formatted: string | null;
}

function parseVector(unit: string): ParseVector {
  const parsed = parseUnitTerm(unit);
  return { unit, parsed, formatted: parsed === null ? null : formatUnitTerm(parsed) };
}

function dimensionVector(unit: string): { readonly unit: string; readonly dimension: string } {
  return { unit, dimension: describeDimension(unitDimension(unit)) };
}

interface ShiftVector {
  readonly from: string;
  readonly to: string;
  readonly shift: number | null;
}

function shiftVector([from, to]: readonly [string, string]): ShiftVector {
  return { from, to, shift: unitConversionShift(from, to) };
}

interface CombineVector {
  readonly left: string;
  readonly right: string;
  readonly sign: 1 | -1;
  readonly term: readonly UnitFactor[] | null;
}

function combineVector([left, right, sign]: readonly [string, string, 1 | -1]): CombineVector {
  const combined = combineUnits(left, right, sign);
  return { left, right, sign, term: combined === null ? null : combined.term };
}

function main(): void {
  const vector = {
    version: 1,
    units: KNOWN_UNITS.map(dimensionVector),
    parse: PARSE_TERMS.map(parseVector),
    shifts: SHIFT_PAIRS.map(shiftVector),
    combine: COMBINE_CASES.map(combineVector),
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(vector, null, 2)}\n`);
  execFileSync('pnpm', ['exec', 'oxfmt', '--write', outPath], {
    cwd: packageDir,
    stdio: 'inherit',
  });
  console.warn(`[generate-measurement-units-vectors] wrote ${outPath}`);
}

main();
