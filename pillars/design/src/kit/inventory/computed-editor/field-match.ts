import { sameDimension, unitDimension } from './measurement-units';

import type { DesignField, ValueType } from './model';

/**
 * Whether a field fits a slot: an exact kind and unit match, except a
 * measurement slot also takes a field of the same dimension (add, subtract
 * and compare convert it) and a unit-less measurement slot, left open for a
 * product or quotient to derive its own unit, takes any decimal or measurement.
 */
export function matchesType(field: DesignField, expected: ValueType | undefined): boolean {
  if (expected === undefined) return field.cardinality === 'one';
  if (field.cardinality !== 'one') return false;
  if (expected.kind !== 'measurement')
    return field.kind === expected.kind && field.unit === expected.unit;
  if (expected.unit === undefined)
    return field.kind === 'measurement' || field.kind === 'decimal' || field.kind === 'integer';
  return (
    field.kind === 'measurement' &&
    field.unit !== undefined &&
    sameDimension(unitDimension(field.unit), unitDimension(expected.unit))
  );
}
