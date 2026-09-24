import {
  unavailableEvaluation,
  uniqueEvaluatedDependencies,
} from './expression-evaluation-shared.js';

import type {
  EvaluatedDependency,
  ExpressionEvaluation,
  ExpressionMissingInput,
  ExpressionSnapshot,
  ExpressionV1,
} from './expression-types.js';

type Unavailable = Extract<ExpressionEvaluation, { state: 'unavailable' }>;

/**
 * The input a skipped argument lacked, as a dependency: the field that failed
 * on the last item the read reached, at that item's revision, or revision 0
 * when the item is not there. A value that exists only because an input is
 * absent must go stale when the input appears, and nothing else records it.
 */
function absence(skipped: Unavailable, snapshot: ExpressionSnapshot): EvaluatedDependency {
  const itemId = skipped.traversedItemIds.at(-1) ?? snapshot.rootItemId;
  const item = snapshot.readItem(itemId);
  return {
    itemId,
    fieldId: skipped.fieldId,
    revision: item.state === 'resolved' ? item.item.revision : 0,
  };
}

/**
 * `coalesce`: the first argument that has a value. An unavailable argument is
 * skipped, the one node that tolerates missing inputs; an evaluation error is
 * not, and stops the node as it stops every other. When every argument is
 * unavailable the result carries the last one's reason and failing field, and
 * `missingInputs` names every argument's missing inputs in argument order,
 * each item and field once. Dependencies and traversed items gather every
 * argument evaluated, each skipped argument adding the input it lacked.
 */
export function evaluateCoalesce(
  values: readonly ExpressionV1[],
  snapshot: ExpressionSnapshot,
  evaluate: (node: ExpressionV1) => ExpressionEvaluation
): ExpressionEvaluation {
  const dependencies: EvaluatedDependency[] = [];
  const traversed = new Set<string>();
  const missing = new Map<string, ExpressionMissingInput>();
  let last: Unavailable | undefined;
  for (const value of values) {
    const evaluated = evaluate(value);
    dependencies.push(...evaluated.dependencies);
    if (evaluated.state !== 'unavailable')
      return { ...evaluated, dependencies: uniqueEvaluatedDependencies(dependencies) };
    dependencies.push(absence(evaluated, snapshot));
    for (const itemId of evaluated.traversedItemIds) traversed.add(itemId);
    for (const input of evaluated.missingInputs) {
      const key = `${input.itemId}:${input.fieldId}`;
      if (!missing.has(key)) missing.set(key, input);
    }
    last = evaluated;
  }
  if (last === undefined) throw new Error('coalesce has no values');
  return unavailableEvaluation(
    {
      reason: last.reason,
      fieldId: last.fieldId,
      traversedItemIds: [...traversed],
      missingInputs: [...missing.values()],
    },
    dependencies
  );
}
