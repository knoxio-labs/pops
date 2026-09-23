import { canonicalizeValue } from './value-dispatch.js';

import type { ExpressionValueType } from './expression-types.js';
import type { PrimitiveWireValue, ValueFieldDefinition } from './value-types.js';

function resultField(
  value: PrimitiveWireValue,
  resultType: ExpressionValueType
): ValueFieldDefinition {
  const optionIds = typeof value === 'object' && 'optionId' in value ? [value.optionId] : [];
  return {
    id: 'expression-result',
    key: 'expression_result',
    kind: resultType.kind,
    cardinality: 'one',
    storage: 'computed',
    fixedUnit: resultType.fixedUnit,
    enumOptionIds: new Set(optionIds),
    archivedEnumOptionIds: new Set(),
    referenceKinds: new Set(['item', 'location']),
    referenceTypeIds: new Set(),
  };
}

/** Canonicalizes a computed result or returns null when it violates its declared type. */
export function canonicalExpressionResult(
  value: PrimitiveWireValue,
  resultType: ExpressionValueType
): PrimitiveWireValue | null {
  try {
    return canonicalizeValue(resultField(value, resultType), value).value;
  } catch {
    return null;
  }
}
