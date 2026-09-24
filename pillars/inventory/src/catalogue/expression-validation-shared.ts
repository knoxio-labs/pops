import { describeDimension, sameDimension, unitDimension } from '../contract/measurement-units.js';
import { ExpressionValidationError } from './expression-types.js';

import type {
  PersistedCatalogue,
  PersistedItemType,
  PersistedItemTypeField,
} from './catalogue-types.js';
import type { ExpressionDependency, ExpressionValueType } from './expression-types.js';

/** Mutable dependency collection and immutable catalogue scope for one validation pass. */
export interface ExpressionValidationContext {
  readonly catalogue: PersistedCatalogue;
  readonly ownerType: PersistedItemType;
  readonly dependencies: ExpressionDependency[];
  /** Expression version 2: measurements match by dimension, not unit (ADR-002 D5). */
  readonly dimensional: boolean;
}

/** Raises one consistently located expression validation failure. */
export function expressionFail(path: string, code: string, message: string): never {
  throw new ExpressionValidationError(code, path, message);
}

/** Projects a persisted field into the type relevant to expression operators. */
export function expressionValueType(field: PersistedItemTypeField): ExpressionValueType {
  return { kind: field.kind, fixedUnit: field.fixedUnit };
}

/** Constructs an expression value type with an optional fixed measurement unit. */
export function expressionType(
  kind: ExpressionValueType['kind'],
  fixedUnit: string | null = null
): ExpressionValueType {
  return { kind, fixedUnit };
}

function describeType(type: ExpressionValueType): string {
  if (type.kind !== 'measurement' || type.fixedUnit === null) return type.kind;
  return `measurement in ${type.fixedUnit} (${describeDimension(unitDimension(type.fixedUnit))})`;
}

/**
 * Whether a measurement type may stand where another is expected: the same
 * fixed unit, or under version 2 any unit of the same dimension, which
 * evaluation converts exactly.
 */
export function compatibleMeasurement(
  actual: ExpressionValueType,
  expected: ExpressionValueType,
  dimensional: boolean
): boolean {
  if (actual.fixedUnit === expected.fixedUnit) return true;
  if (!dimensional || actual.fixedUnit === null || expected.fixedUnit === null) return false;
  return sameDimension(unitDimension(actual.fixedUnit), unitDimension(expected.fixedUnit));
}

/**
 * Requires two expression types to match: the same kind and, for a
 * measurement, the same fixed unit (version 1) or dimension (version 2).
 */
export function requireExpressionType(
  actual: ExpressionValueType,
  expected: ExpressionValueType,
  path: string,
  dimensional: boolean
): ExpressionValueType {
  if (actual.kind === expected.kind && compatibleMeasurement(actual, expected, dimensional))
    return actual;
  return expressionFail(
    path,
    'expression_type_mismatch',
    dimensional
      ? `expected ${describeType(expected)}, received ${describeType(actual)}`
      : `expected ${expected.kind}, received ${actual.kind}`
  );
}

/** Requires an integer, decimal or fixed-unit measurement expression type. */
export function requireNumericType(value: ExpressionValueType, path: string): ExpressionValueType {
  if (value.kind !== 'integer' && value.kind !== 'decimal' && value.kind !== 'measurement')
    expressionFail(path, 'expression_numeric_required', 'requires a numeric value');
  return value;
}
