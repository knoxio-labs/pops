import type {
  EvaluatedDependency,
  ExpressionEvaluation,
  ExpressionMissingInput,
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

/** Why an evaluation is unavailable, before its dependency provenance. */
export interface UnavailableFailure {
  readonly reason: ExpressionUnavailableReason;
  readonly fieldId: string;
  readonly traversedItemIds: readonly string[];
  readonly missingInputs: readonly ExpressionMissingInput[];
}

/** Constructs an unavailable evaluation with stable dependency provenance. */
export function unavailableEvaluation(
  failure: UnavailableFailure,
  dependencies: readonly EvaluatedDependency[]
): ExpressionEvaluation {
  return {
    state: 'unavailable',
    ...failure,
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
