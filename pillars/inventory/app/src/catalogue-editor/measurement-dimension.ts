/**
 * Reads the physical dimension of a fixed-unit string for the owner-facing
 * dimension readout shown under the unit input (Inventory ADR-002 D5). This
 * is a minimal, read-only subset of `@pops/inventory`'s server-side unit
 * grammar (`pillars/inventory/src/catalogue/measurement-units.ts`): parsing
 * and describing a unit term, with no conversion or arithmetic. It is
 * duplicated here because that module sits outside the pillar's public
 * `exports` map (its contract barrel is curated to schemas/types/errors, not
 * domain logic) — POPS-4522 tracks extracting a shared units package so this
 * and the server copy stop drifting.
 */

const SUPERSCRIPT_DIGITS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'] as const;
const SUPERSCRIPT = new Map<string, number>(
  SUPERSCRIPT_DIGITS.map((digit, index) => [digit, index])
);
const RESERVED = new Set(['·', '/', '⁻', ...SUPERSCRIPT_DIGITS]);

interface UnitFactor {
  readonly symbol: string;
  readonly power: number;
}
type UnitTerm = readonly UnitFactor[];

const KNOWN_DIMENSIONS = new Map<string, Readonly<Record<string, number>>>([
  ['mm', { length: 1 }],
  ['cm', { length: 1 }],
  ['m', { length: 1 }],
  ['kg', { mass: 1 }],
  ['L', { length: 3 }],
  ['W', { power: 1 }],
  ['V', { voltage: 1 }],
  ['Gbps', { 'data-rate': 1 }],
  ['lm', { brightness: 1 }],
  ['K', { 'colour-temperature': 1 }],
]);

function superscript(power: number): string {
  if (power === 1) return '';
  return Array.from(String(power), (digit) => SUPERSCRIPT_DIGITS[Number(digit)]).join('');
}

function parseFactor(text: string, sign: 1 | -1): UnitFactor | null {
  const characters = Array.from(text);
  let split = characters.length;
  while (split > 0 && SUPERSCRIPT.has(characters[split - 1] ?? '')) split -= 1;
  const symbol = characters.slice(0, split).join('');
  const exponent = characters.slice(split).join('');
  if (symbol.length === 0 || symbol === '1') return null;
  if (
    characters.slice(0, split).some((character) => RESERVED.has(character) || /\s/u.test(character))
  )
    return null;
  if (exponent.length === 0) return { symbol, power: sign };
  const digits = characters.slice(split);
  if (digits.length > 2) return null;
  const power = Number(digits.map((digit) => SUPERSCRIPT.get(digit)).join(''));
  if (power < 2 || superscript(power) !== exponent) return null;
  return { symbol, power: sign * power };
}

function parseProduct(text: string, sign: 1 | -1): UnitFactor[] | null {
  const factors: UnitFactor[] = [];
  for (const part of text.split('·')) {
    const factor = parseFactor(part, sign);
    if (factor === null) return null;
    factors.push(factor);
  }
  return factors;
}

/** Parses a unit written in the canonical unit-term grammar, or null when it is not one. */
function parseUnitTerm(unit: string): UnitTerm | null {
  const [numerator, denominator, extra] = unit.split('/');
  if (numerator === undefined || extra !== undefined) return null;
  const positive = denominator !== undefined && numerator === '1' ? [] : parseProduct(numerator, 1);
  const negative = denominator === undefined ? [] : parseProduct(denominator, -1);
  if (positive === null || negative === null) return null;
  const factors = [...positive, ...negative];
  const symbols = new Set(factors.map((factor) => factor.symbol));
  return factors.length === 0 || symbols.size !== factors.length ? null : factors;
}

function symbolDimension(symbol: string): Readonly<Record<string, number>> {
  return KNOWN_DIMENSIONS.get(symbol) ?? { [`unit:${symbol}`]: 1 };
}

function termDimension(term: UnitTerm): Map<string, number> {
  const dimension = new Map<string, number>();
  for (const factor of term) {
    for (const [base, exponent] of Object.entries(symbolDimension(factor.symbol))) {
      const next = (dimension.get(base) ?? 0) + exponent * factor.power;
      if (next === 0) dimension.delete(base);
      else dimension.set(base, next);
    }
  }
  return dimension;
}

/** Writes a dimension for display, e.g. `length³` or `mass·length⁻³`. */
function describeDimension(dimension: ReadonlyMap<string, number>): string {
  if (dimension.size === 0) return 'dimensionless';
  return [...dimension]
    .map(([base, exponent]) => {
      const name = base.replace(/^unit:/u, '');
      if (exponent === 1) return name;
      return exponent > 0
        ? `${name}${superscript(exponent)}`
        : `${name}⁻${superscript(-exponent) || '¹'}`;
    })
    .join('·');
}

/**
 * The dimension readout for a fixed-unit string, e.g. `cm²` reads as
 * `length²`. Blank input has no readout; a unit outside the canonical
 * unit-term grammar (or made of symbols with no known physical dimension)
 * reads as its own custom unit rather than a guessed dimension.
 */
export function measurementDimensionReadout(fixedUnit: string): string | null {
  const trimmed = fixedUnit.trim();
  if (trimmed === '') return null;
  const term = parseUnitTerm(trimmed);
  if (term === null) return 'Custom unit';
  const dimension = termDimension(term);
  const bases = [...dimension.keys()];
  if (bases.length > 0 && bases.every((base) => base.startsWith('unit:'))) return 'Custom unit';
  return describeDimension(dimension);
}
