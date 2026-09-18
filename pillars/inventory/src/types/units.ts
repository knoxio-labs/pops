/**
 * The unit vocabulary a measurement or range field can be typed in.
 *
 * A value keeps the unit it was typed in (POPS-4015); this table is what
 * lets a search or a comparison convert two values that share a dimension
 * but not a unit. Adding a unit is additive and never bumps the catalogue's
 * compatibility guard; narrowing the set a field accepts is a type change,
 * checked in `catalogue.ts`.
 */

/** The closed set of physical quantities a measurement or range can carry. */
export const DIMENSIONS = [
  'length',
  'mass',
  'volume',
  'power',
  'voltage',
  'data-rate',
  'brightness',
  'colour-temperature',
] as const;

export type Dimension = (typeof DIMENSIONS)[number];

/** One unit: its wire symbol, the dimension it measures, and its size relative to that dimension's base unit. */
export interface UnitDefinition {
  readonly symbol: string;
  readonly dimension: Dimension;
  /** Multiply a value in this unit by this to get the dimension's base unit (metres, kilograms, litres, watts, volts, Gbps, lumens, kelvin). */
  readonly multiplier: number;
}

export const UNITS: readonly UnitDefinition[] = [
  { symbol: 'mm', dimension: 'length', multiplier: 0.001 },
  { symbol: 'cm', dimension: 'length', multiplier: 0.01 },
  { symbol: 'm', dimension: 'length', multiplier: 1 },
  { symbol: 'kg', dimension: 'mass', multiplier: 1 },
  { symbol: 'L', dimension: 'volume', multiplier: 1 },
  { symbol: 'W', dimension: 'power', multiplier: 1 },
  { symbol: 'V', dimension: 'voltage', multiplier: 1 },
  { symbol: 'Gbps', dimension: 'data-rate', multiplier: 1 },
  { symbol: 'lm', dimension: 'brightness', multiplier: 1 },
  { symbol: 'K', dimension: 'colour-temperature', multiplier: 1 },
];

/** The unit definition for a wire symbol, or `undefined` if the catalogue does not know it. */
export function unitBySymbol(symbol: string): UnitDefinition | undefined {
  return UNITS.find((unit) => unit.symbol === symbol);
}

/** Whether `symbol` is a unit the catalogue recognises. */
export function isKnownUnit(symbol: string): boolean {
  return unitBySymbol(symbol) !== undefined;
}

/**
 * The non-empty list of unit symbols valid for `dimension`, in table order.
 *
 * Throws if a dimension has no units at all, which would mean a type
 * declared a dimension `units.ts` never populated — a programming error,
 * not a data condition a caller should have to check for.
 */
export function unitsForDimension(dimension: Dimension): readonly [string, ...string[]] {
  const symbols = UNITS.filter((unit) => unit.dimension === dimension).map((unit) => unit.symbol);
  const [first, ...rest] = symbols;
  if (first === undefined) {
    throw new Error(`no units are declared for dimension "${dimension}"`);
  }
  return [first, ...rest];
}

/** Thrown by {@link convert} when the two units do not share a dimension. */
export class UnitDimensionMismatchError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string
  ) {
    super(`cannot convert "${from}" to "${to}": they are not the same dimension`);
    this.name = 'UnitDimensionMismatchError';
  }
}

/**
 * Converts `value`, typed in unit `from`, into unit `to`.
 *
 * Both units must be known and must share a dimension; a search or a
 * comparison across two values with different units goes through this
 * rather than assuming the multiplier is 1.
 */
export function convert(value: number, from: string, to: string): number {
  const fromUnit = unitBySymbol(from);
  const toUnit = unitBySymbol(to);
  if (!fromUnit) {
    throw new Error(`unknown unit "${from}"`);
  }
  if (!toUnit) {
    throw new Error(`unknown unit "${to}"`);
  }
  if (fromUnit.dimension !== toUnit.dimension) {
    throw new UnitDimensionMismatchError(from, to);
  }
  return (value * fromUnit.multiplier) / toUnit.multiplier;
}
