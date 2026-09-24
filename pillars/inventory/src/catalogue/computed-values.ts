import { evaluateExpression } from './expression-evaluator.js';
import { ExpressionValidationError } from './expression-types.js';

import type { UnavailableFailure } from './expression-evaluation-shared.js';
import type {
  EffectiveComputedValue,
  ExpressionEvaluation,
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
  onEvaluationError,
  snapshot,
}: {
  readonly allowOverride: boolean;
  readonly catalogueRevision: number;
  readonly expression: ValidatedExpression;
  readonly fieldId: string;
  readonly override:
    | { readonly state: 'absent' }
    | { readonly state: 'value'; readonly value: PrimitiveWireValue };
  readonly onEvaluationError?: (
    code: Extract<ReturnType<typeof evaluateExpression>, { readonly state: 'error' }>['code']
  ) => void;
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
  if (evaluated.state === 'error') onEvaluationError?.(evaluated.code);
  return {
    state: 'unavailable',
    ...unavailableFailure(evaluated, fieldId, snapshot.rootItemId),
    provenance: { source: 'computed', catalogueRevision, dependencies: evaluated.dependencies },
  };
}

/** An evaluation error is unavailable on the field itself, with no missing input. */
function unavailableFailure(
  evaluated: Exclude<ExpressionEvaluation, { readonly state: 'value' }>,
  fieldId: string,
  rootItemId: string
): UnavailableFailure {
  if (evaluated.state === 'error')
    return {
      reason: 'evaluation_error',
      fieldId,
      traversedItemIds: [rootItemId],
      missingInputs: [],
    };
  const { reason, traversedItemIds, missingInputs } = evaluated;
  return { reason, fieldId: evaluated.fieldId, traversedItemIds, missingInputs };
}
