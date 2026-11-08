import { needsDimensionalUnits, usesAssemblyRead } from '@pops/inventory/expression';

import type { ExpressionContext, ExpressionNode, ValueType } from '@pops/inventory/expression';

/** The expression version a field without an assembly read or a version-1 history is saved with. */
export const LATEST_EXPRESSION_VERSION = 2 as const;

/** The first expression version that accepts a read from the assembly an item is part of. */
export const ASSEMBLY_EXPRESSION_VERSION = 3 as const;

/**
 * The expression version a computed field's save sends. A tree that reads
 * from an assembly needs version 3. Otherwise a new field, or one already on
 * version 2 or 3, gets version 2, so a field that no longer reads an assembly
 * goes back to it. A version-1 field keeps version 1 unless the edited tree
 * needs dimensional units, since version 2 compares decimals and measurements
 * by value where version 1 compares their written form, and an iOS build from
 * before version 2 stops evaluating the field.
 */
export function savedExpressionVersion(
  storedVersion: number | null | undefined,
  context: ExpressionContext,
  expression: ExpressionNode,
  fieldType: ValueType
): 1 | 2 | 3 {
  if (usesAssemblyRead(expression)) return ASSEMBLY_EXPRESSION_VERSION;
  if (storedVersion !== 1) return LATEST_EXPRESSION_VERSION;
  return needsDimensionalUnits(context, expression, fieldType) ? LATEST_EXPRESSION_VERSION : 1;
}
