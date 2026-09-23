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

/** Requires two expression types, including fixed units, to be identical. */
export function requireExpressionType(
  actual: ExpressionValueType,
  expected: ExpressionValueType,
  path: string
): ExpressionValueType {
  if (actual.kind !== expected.kind || actual.fixedUnit !== expected.fixedUnit)
    expressionFail(
      path,
      'expression_type_mismatch',
      `expected ${expected.kind}, received ${actual.kind}`
    );
  return actual;
}

/** Requires an integer, decimal or fixed-unit measurement expression type. */
export function requireNumericType(value: ExpressionValueType, path: string): ExpressionValueType {
  if (value.kind !== 'integer' && value.kind !== 'decimal' && value.kind !== 'measurement')
    expressionFail(path, 'expression_numeric_required', 'requires a numeric value');
  return value;
}
