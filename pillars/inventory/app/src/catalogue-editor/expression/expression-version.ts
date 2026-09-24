import { needsDimensionalUnits } from './slot-types';

import type { ExpressionContext, ExpressionNode, ValueType } from './model';

/** The expression version a new computed field is saved with. */
export const LATEST_EXPRESSION_VERSION = 2;

/**
 * The expression version a computed field's save sends. A new field, or one
 * already on version 2, gets the latest. A version-1 field keeps version 1
 * unless the edited tree needs dimensional units, since version 2 compares
 * decimals and measurements by value where version 1 compares their written
 * form, and an iOS build from before version 2 stops evaluating the field.
 */
export function savedExpressionVersion(
  storedVersion: number | null | undefined,
  context: ExpressionContext,
  expression: ExpressionNode,
  fieldType: ValueType
): number {
  if (storedVersion !== 1) return LATEST_EXPRESSION_VERSION;
  return needsDimensionalUnits(context, expression, fieldType) ? LATEST_EXPRESSION_VERSION : 1;
}
