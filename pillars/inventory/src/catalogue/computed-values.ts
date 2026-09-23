import { evaluateExpression } from './expression-evaluator.js';
import { ExpressionValidationError } from './expression-types.js';

import type {
  EffectiveComputedValue,
  ExpressionSnapshot,
  ValidatedExpression,
} from './expression-types.js';
import type { PrimitiveWireValue } from './value-types.js';

/** Applies optional override precedence and projects effective-value provenance. */
export function evaluateComputedValue({
  allowOverride,
  catalogueRevision,
  expression,
  fieldId,
  override,
  snapshot,
}: {
  readonly allowOverride: boolean;
  readonly catalogueRevision: number;
  readonly expression: ValidatedExpression;
  readonly fieldId: string;
  readonly override:
    | { readonly state: 'absent' }
    | { readonly state: 'value'; readonly value: PrimitiveWireValue };
  readonly snapshot: ExpressionSnapshot;
}): EffectiveComputedValue {
  if (override.state === 'value') {
    if (!allowOverride)
      throw new ExpressionValidationError(
        'override_forbidden',
        fieldId,
        'computed field does not permit an override'
      );
    return {
      state: 'value',
      values: [override.value],
      provenance: { source: 'override', catalogueRevision },
    };
  }
  const evaluated = evaluateExpression(expression, snapshot);
  if (evaluated.state === 'value') {
    return {
      state: 'value',
      values: [evaluated.value],
      provenance: {
        source: 'computed',
        catalogueRevision,
        dependencies: evaluated.dependencies,
      },
    };
  }
  const failed = evaluated.state === 'error';
  return {
    state: 'unavailable',
    reason: failed ? 'evaluation_error' : evaluated.reason,
    fieldId: failed ? fieldId : evaluated.fieldId,
    traversedItemIds: failed ? [snapshot.rootItemId] : evaluated.traversedItemIds,
    provenance: {
      source: 'computed',
      catalogueRevision,
      dependencies: evaluated.dependencies,
    },
  };
}
