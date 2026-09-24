import { describeDimension, unitDimension } from '@pops/inventory';

/**
 * The dimension readout for a fixed-unit string, e.g. `cm²` reads as
 * `length²` (Inventory ADR-002 D5). Blank input has no readout. A unit
 * outside the canonical unit-term grammar, or built from symbols with no
 * known physical dimension, reads back as its own name rather than a
 * guessed dimension — the same behaviour the server's value codec applies.
 */
export function measurementDimensionReadout(fixedUnit: string): string | null {
  const trimmed = fixedUnit.trim();
  if (trimmed === '') return null;
  return describeDimension(unitDimension(trimmed));
}
