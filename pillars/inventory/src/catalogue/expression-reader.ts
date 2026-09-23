import { errorEvaluation, unavailableEvaluation } from './expression-evaluation-shared.js';

import type {
  EvaluatedDependency,
  ExpressionEvaluation,
  ExpressionSnapshot,
  ExpressionV1,
} from './expression-types.js';
import type { PrimitiveWireValue, ReferenceWireValue } from './value-types.js';

function reference(value: PrimitiveWireValue): value is ReferenceWireValue {
  return typeof value === 'object' && 'targetKind' in value;
}

function missingItem(
  state: 'unresolved' | 'missing' | 'deleted',
  fieldId: string,
  traversedItemIds: readonly string[],
  dependencies: readonly EvaluatedDependency[]
): ExpressionEvaluation {
  const reasons = {
    unresolved: 'reference_unresolved',
    missing: 'reference_missing',
    deleted: 'reference_deleted',
  } as const;
  return unavailableEvaluation(reasons[state], fieldId, traversedItemIds, dependencies);
}

/** Reads one expression field through at most the parser-bounded reference path. */
export function evaluateRead(
  expression: Extract<ExpressionV1, { op: 'read' }>,
  snapshot: ExpressionSnapshot
): ExpressionEvaluation {
  let itemId = snapshot.rootItemId;
  const traversedItemIds = [itemId];
  const dependencies: EvaluatedDependency[] = [];
  for (const referenceFieldId of expression.path) {
    const itemResult = snapshot.readItem(itemId);
    if (itemResult.state !== 'resolved')
      return missingItem(itemResult.state, referenceFieldId, traversedItemIds, dependencies);
    const field = itemResult.item.fields.get(referenceFieldId);
    if (field === undefined)
      return unavailableEvaluation(
        'missing_dependency',
        referenceFieldId,
        traversedItemIds,
        dependencies
      );
    dependencies.push({ itemId, fieldId: referenceFieldId, revision: field.revision });
    if (field.state === 'unavailable')
      return unavailableEvaluation(
        field.reason,
        field.fieldId,
        field.traversedItemIds,
        dependencies
      );
    if (!reference(field.value) || field.value.targetKind !== 'item')
      return errorEvaluation('invalid_value', dependencies);
    itemId = field.value.targetId;
    traversedItemIds.push(itemId);
  }
  const itemResult = snapshot.readItem(itemId);
  if (itemResult.state !== 'resolved')
    return missingItem(itemResult.state, expression.fieldId, traversedItemIds, dependencies);
  const field = itemResult.item.fields.get(expression.fieldId);
  if (field === undefined)
    return unavailableEvaluation(
      'missing_dependency',
      expression.fieldId,
      traversedItemIds,
      dependencies
    );
  dependencies.push({ itemId, fieldId: expression.fieldId, revision: field.revision });
  if (field.state === 'unavailable')
    return unavailableEvaluation(field.reason, field.fieldId, field.traversedItemIds, dependencies);
  return { state: 'value', value: field.value, dependencies };
}
