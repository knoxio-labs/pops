import { expressionFail, expressionType } from './expression-validation-shared.js';
import { canonicalizeValue } from './value-dispatch.js';

import type { ExpressionV1, ExpressionValueType } from './expression-types.js';
import type { PrimitiveKind, PrimitiveWireValue, ValueFieldDefinition } from './value-types.js';

const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function stringKind(value: string): PrimitiveKind {
  if (DECIMAL.test(value)) return 'decimal';
  if (DATE_TIME.test(value)) return 'date_time';
  if (DATE.test(value)) return 'date';
  try {
    if (new URL(value).protocol === 'https:') return 'url';
  } catch {}
  return Array.from(value).length <= 200 ? 'short_text' : 'long_text';
}

function literalField(
  value: PrimitiveWireValue,
  expected: ExpressionValueType
): ValueFieldDefinition {
  const optionIds = typeof value === 'object' && 'optionId' in value ? [value.optionId] : [];
  return {
    id: 'expression-literal',
    key: 'expression_literal',
    kind: expected.kind,
    cardinality: 'one',
    storage: 'computed',
    fixedUnit: expected.fixedUnit,
    enumOptionIds: new Set(optionIds),
    archivedEnumOptionIds: new Set(),
    referenceKinds: new Set(['item', 'location']),
    referenceTypeIds: new Set(),
  };
}

function literalAccepts(value: PrimitiveWireValue, expected: ExpressionValueType): boolean {
  try {
    const canonical = canonicalizeValue(literalField(value, expected), value).value;
    return JSON.stringify(canonical) === JSON.stringify(value);
  } catch {
    return false;
  }
}

/** Infers or verifies the primitive type of one expression literal. */
export function inferLiteralType(
  node: Extract<ExpressionV1, { op: 'literal' }>,
  expected: ExpressionValueType | undefined,
  path: string
): ExpressionValueType {
  if (expected !== undefined) {
    if (!literalAccepts(node.value, expected))
      expressionFail(path, 'expression_literal_type_mismatch', `literal is not ${expected.kind}`);
    return expected;
  }
  const value = node.value;
  let inferred: ExpressionValueType;
  if (typeof value === 'boolean') inferred = expressionType('boolean');
  else if (typeof value === 'number') inferred = expressionType('integer');
  else if (typeof value === 'string') inferred = expressionType(stringKind(value));
  else if ('amount' in value) inferred = expressionType('measurement', value.unit);
  else if ('optionId' in value) inferred = expressionType('enum');
  else inferred = expressionType('reference');
  if (!literalAccepts(value, inferred))
    expressionFail(path, 'expression_literal_invalid', `literal is not canonical ${inferred.kind}`);
  return inferred;
}
