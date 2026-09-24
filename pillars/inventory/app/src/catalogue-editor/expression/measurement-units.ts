/**
 * The client-side measurement unit grammar and dimension math (Inventory
 * ADR-002 D5): which unit symbols have a known physical dimension, how they
 * combine under multiply and divide, and whether two units share a dimension.
 *
 * Mirrors `pillars/inventory/src/catalogue/measurement-units.ts` on the
 * server, which `@pops/inventory` keeps off-limits to this package (a
 * different pnpm workspace member) — so the grammar, the known-unit table
 * and the dimension math are duplicated here, trimmed to what the builder
 * and the design kit render with. `measurement-units.test.ts` pins this copy
 * against a shared JSON vector generated from the server table
 * (`pillars/inventory/contracts/measurement-units-v1.json`, vendored to
 * `pillars/inventory/app/contracts/measurement-units-v1.json`), so the two
 * cannot drift silently. Left out: the exact rational conversion factor the
 * real protocol-1 codec applies, which is server-only.
 */

/** A dimension as base-dimension exponents; absent keys are zero. */
export type UnitDimension = ReadonlyMap<string, number>;

interface KnownUnit {
  readonly dimension: Readonly<Record<string, number>>;
  /** One of this unit is 10^powerOfTen of its dimension's coherent unit. */
  readonly powerOfTen: number;
}

const KNOWN_UNITS: ReadonlyMap<string, KnownUnit> = new Map<string, KnownUnit>([
  ['mm', { dimension: { length: 1 }, powerOfTen: -3 }],
  ['cm', { dimension: { length: 1 }, powerOfTen: -2 }],
  ['m', { dimension: { length: 1 }, powerOfTen: 0 }],
  ['kg', { dimension: { mass: 1 }, powerOfTen: 0 }],
  ['L', { dimension: { length: 3 }, powerOfTen: -3 }],
  ['W', { dimension: { power: 1 }, powerOfTen: 0 }],
  ['V', { dimension: { voltage: 1 }, powerOfTen: 0 }],
  ['Gbps', { dimension: { 'data-rate': 1 }, powerOfTen: 0 }],
  ['lm', { dimension: { brightness: 1 }, powerOfTen: 0 }],
  ['K', { dimension: { 'colour-temperature': 1 }, powerOfTen: 0 }],
]);

/** One symbol of a unit term raised to a non-zero integer power. */
export interface UnitFactor {
  readonly symbol: string;
  readonly power: number;
}

/** A unit as an ordered product of distinct symbols; empty is dimensionless. */
export type UnitTerm = readonly UnitFactor[];

const SUPERSCRIPT_DIGITS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'] as const;
const SUPERSCRIPT = new Map<string, number>(
  SUPERSCRIPT_DIGITS.map((digit, index) => [digit, index])
);
const RESERVED = new Set(['·', '/', '⁻', ...SUPERSCRIPT_DIGITS]);

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

/**
 * Parses a unit written in the canonical unit-term grammar: symbols joined by
 * `·`, each with an optional superscript power from 2 to 99, then optionally
 * `/` and the denominator's symbols (`1/s` when there is no numerator). Each
 * symbol appears once. Any other text is not a unit term and yields null: it
 * is still a valid fixed unit, just one nothing here can derive or convert.
 */
export function parseUnitTerm(unit: string): UnitTerm | null {
  const [numerator, denominator, extra] = unit.split('/');
  if (numerator === undefined || extra !== undefined) return null;
  const positive = denominator !== undefined && numerator === '1' ? [] : parseProduct(numerator, 1);
  const negative = denominator === undefined ? [] : parseProduct(denominator, -1);
  if (positive === null || negative === null) return null;
  const factors = [...positive, ...negative];
  const symbols = new Set(factors.map((factor) => factor.symbol));
  return factors.length === 0 || symbols.size !== factors.length ? null : factors;
}

/** Writes a non-empty unit term back in the canonical grammar `parseUnitTerm` reads. */
export function formatUnitTerm(term: UnitTerm): string {
  const product = (factors: UnitTerm): string =>
    factors.map((factor) => `${factor.symbol}${superscript(Math.abs(factor.power))}`).join('·');
  const numerator = term.filter((factor) => factor.power > 0);
  const denominator = term.filter((factor) => factor.power < 0);
  const top = numerator.length === 0 ? '1' : product(numerator);
  return denominator.length === 0 ? top : `${top}/${product(denominator)}`;
}

function symbolDimension(symbol: string): Readonly<Record<string, number>> {
  return KNOWN_UNITS.get(symbol)?.dimension ?? { [`unit:${symbol}`]: 1 };
}

function addDimension(target: Map<string, number>, symbol: string, power: number): void {
  for (const [base, exponent] of Object.entries(symbolDimension(symbol))) {
    const next = (target.get(base) ?? 0) + exponent * power;
    if (next === 0) target.delete(base);
    else target.set(base, next);
  }
}

/** The dimension of a unit term. */
export function termDimension(term: UnitTerm): UnitDimension {
  const dimension = new Map<string, number>();
  for (const factor of term) addDimension(dimension, factor.symbol, factor.power);
  return dimension;
}

/**
 * The dimension of any fixed-unit string. Text that is not a unit term is a
 * dimension of its own, equal only to the identical string.
 */
export function unitDimension(unit: string): UnitDimension {
  const term = parseUnitTerm(unit);
  return term === null ? new Map([[`opaque:${unit}`, 1]]) : termDimension(term);
}

/** Whether two dimensions are identical. */
export function sameDimension(left: UnitDimension, right: UnitDimension): boolean {
  if (left.size !== right.size) return false;
  for (const [base, exponent] of left) if (right.get(base) !== exponent) return false;
  return true;
}

/** Writes a dimension for messages, e.g. `length³` or `mass·length⁻³`. */
export function describeDimension(dimension: UnitDimension): string {
  if (dimension.size === 0) return 'dimensionless';
  return [...dimension]
    .map(([base, exponent]) => {
      const name = base.replace(/^(?:unit|opaque):/u, '');
      if (exponent === 1) return name;
      return exponent > 0
        ? `${name}${superscript(exponent)}`
        : `${name}⁻${superscript(-exponent) || '¹'}`;
    })
    .join('·');
}

function termPowerOfTen(term: UnitTerm): number {
  return term.reduce(
    (total, factor) => total + factor.power * (KNOWN_UNITS.get(factor.symbol)?.powerOfTen ?? 0),
    0
  );
}

/**
 * The power of ten that converts an amount in `from` into `to`
 * (`amountTo = amountFrom × 10^shift`), or null when the two are not the
 * same dimension. Identical strings convert with 0 whatever they spell.
 */
export function unitConversionShift(from: string, to: string): number | null {
  if (from === to) return 0;
  const source = parseUnitTerm(from);
  const target = parseUnitTerm(to);
  if (source === null || target === null) return null;
  if (!sameDimension(termDimension(source), termDimension(target))) return null;
  return termPowerOfTen(source) - termPowerOfTen(target);
}

function sameSymbolDimension(left: string, right: string): boolean {
  const known = KNOWN_UNITS.has(left) && KNOWN_UNITS.has(right);
  return (
    known &&
    sameDimension(
      new Map(Object.entries(symbolDimension(left))),
      new Map(Object.entries(symbolDimension(right)))
    )
  );
}

/** The unit a product or quotient of two measurements carries. */
export interface CombinedUnit {
  /** The result's unit term; empty when every symbol cancelled. */
  readonly term: UnitTerm;
}

/**
 * Multiplies (`sign` 1) or divides (`sign` -1) two unit terms. Each right
 * symbol joins the same left symbol, else the first symbol already in the
 * result with the same known dimension, else is appended. Symbols whose
 * powers cancel are dropped. Null when either unit is not a unit term.
 */
export function combineUnits(left: string, right: string, sign: 1 | -1): CombinedUnit | null {
  const leftTerm = parseUnitTerm(left);
  const rightTerm = parseUnitTerm(right);
  if (leftTerm === null || rightTerm === null) return null;
  const factors: { symbol: string; power: number }[] = leftTerm.map((factor) => ({ ...factor }));
  for (const factor of rightTerm) {
    const same = factors.find((candidate) => candidate.symbol === factor.symbol);
    const compatible =
      same ?? factors.find((candidate) => sameSymbolDimension(candidate.symbol, factor.symbol));
    if (compatible === undefined) {
      factors.push({ symbol: factor.symbol, power: sign * factor.power });
      continue;
    }
    compatible.power += sign * factor.power;
  }
  return { term: factors.filter((factor) => factor.power !== 0) };
}
