import type {
  EvaluatedDependency,
  ExpressionEvaluation,
  ExpressionUnavailableReason,
} from './expression-types.js';

/** Deduplicates runtime dependencies by item and field in stable order. */
export function uniqueEvaluatedDependencies(
  dependencies: readonly EvaluatedDependency[]
): readonly EvaluatedDependency[] {
  const unique = new Map<string, EvaluatedDependency>();
  for (const dependency of dependencies)
    unique.set(`${dependency.itemId}:${dependency.fieldId}`, dependency);
  return [...unique.values()].toSorted((left, right) => {
    const leftKey = `${left.itemId}:${left.fieldId}`;
    const rightKey = `${right.itemId}:${right.fieldId}`;
    return leftKey.localeCompare(rightKey);
  });
}

/** Constructs an unavailable evaluation with stable dependency provenance. */
export function unavailableEvaluation(
  reason: ExpressionUnavailableReason,
  fieldId: string,
  traversedItemIds: readonly string[],
  dependencies: readonly EvaluatedDependency[]
): ExpressionEvaluation {
  return {
    state: 'unavailable',
    reason,
    fieldId,
    traversedItemIds,
    dependencies: uniqueEvaluatedDependencies(dependencies),
  };
}

/** Constructs an internal evaluation error with stable dependency provenance. */
export function errorEvaluation(
  code: Extract<ExpressionEvaluation, { state: 'error' }>['code'],
  dependencies: readonly EvaluatedDependency[]
): ExpressionEvaluation {
  return { state: 'error', code, dependencies: uniqueEvaluatedDependencies(dependencies) };
}
