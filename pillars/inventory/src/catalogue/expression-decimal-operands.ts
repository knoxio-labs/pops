import { stringKind } from './expression-literal-validator.js';

import type { ExpressionV1 } from './expression-types.js';
import type { PrimitiveKind } from './value-types.js';

/**
 * Whether validation typed an `equal` node's operands as decimals, from its
 * left operand, whose type the right must match (ADR-002 D5). Decimals and
 * text share a wire form, so version 2 needs this to compare `3.0` and `3` by
 * value while text keeps comparing by identity.
 *
 * It follows `inferExpressionType` for a left operand inferred with no
 * expected type: a literal takes the kind its spelling gives it, a read its
 * field's declared kind, arithmetic is numeric (a string result is a decimal),
 * and `if` and `coalesce` the type of their first branch. A field missing
 * from `fieldKinds` is not a decimal.
 */
export function comparesDecimals(
  left: ExpressionV1,
  fieldKinds: ReadonlyMap<string, PrimitiveKind>
): boolean {
  switch (left.op) {
    case 'literal':
      return typeof left.value === 'string' && stringKind(left.value) === 'decimal';
    case 'read':
      return fieldKinds.get(left.fieldId) === 'decimal';
    case 'negate':
    case 'add':
    case 'subtract':
    case 'multiply':
    case 'divide':
      return true;
    case 'if':
      return comparesDecimals(left.thenBranch, fieldKinds);
    case 'coalesce':
      return left.values[0] !== undefined && comparesDecimals(left.values[0], fieldKinds);
    default:
      return false;
  }
}
