import {
  errorEvaluation,
  unavailableEvaluation,
  uniqueEvaluatedDependencies,
} from './expression-evaluation-shared.js';

import type {
  EvaluatedDependency,
  ExpressionEvaluation,
  ExpressionSnapshot,
  ExpressionUnavailableReason,
  ExpressionV1,
  SnapshotFieldValue,
} from './expression-types.js';
import type { PrimitiveWireValue, ReferenceWireValue } from './value-types.js';

/** Where a read has got to: the current item, the items reached, and every revision read. */
interface ReadPosition {
  readonly itemId: string;
  readonly traversedItemIds: readonly string[];
  readonly dependencies: EvaluatedDependency[];
}

type FieldRead =
  | { readonly state: 'value'; readonly value: PrimitiveWireValue }
  | { readonly state: 'stopped'; readonly evaluation: ExpressionEvaluation };

const ITEM_REASONS = {
  unresolved: 'reference_unresolved',
  missing: 'reference_missing',
  deleted: 'reference_deleted',
} as const;

function reference(value: PrimitiveWireValue): value is ReferenceWireValue {
  return typeof value === 'object' && 'targetKind' in value;
}

/** A read that stopped on the position's item, whose `fieldId` it could not read. */
function unavailableRead(
  reason: ExpressionUnavailableReason,
  fieldId: string,
  position: ReadPosition
): FieldRead {
  return {
    state: 'stopped',
    evaluation: unavailableEvaluation(
      {
        reason,
        fieldId,
        traversedItemIds: position.traversedItemIds,
        missingInputs: [{ reason, fieldId, itemId: position.itemId }],
      },
      position.dependencies
    ),
  };
}

/**
 * An unavailable computed field passes its own missing inputs on; one that
 * recorded none names its failing field on the last item it reached.
 */
function unavailableField(
  field: Extract<SnapshotFieldValue, { state: 'unavailable' }>,
  position: ReadPosition
): FieldRead {
  const missingInputs =
    field.missingInputs !== undefined && field.missingInputs.length > 0
      ? field.missingInputs
      : [
          {
            reason: field.reason,
            fieldId: field.fieldId,
            itemId: field.traversedItemIds.at(-1) ?? position.itemId,
          },
        ];
  return {
    state: 'stopped',
    evaluation: unavailableEvaluation(
      {
        reason: field.reason,
        fieldId: field.fieldId,
        traversedItemIds: field.traversedItemIds,
        missingInputs,
      },
      position.dependencies
    ),
  };
}

function readField(
  snapshot: ExpressionSnapshot,
  fieldId: string,
  position: ReadPosition
): FieldRead {
  const itemResult = snapshot.readItem(position.itemId);
  if (itemResult.state !== 'resolved')
    return unavailableRead(ITEM_REASONS[itemResult.state], fieldId, position);
  const field = snapshot.readField(position.itemId, fieldId);
  if (field === undefined) return unavailableRead('missing_dependency', fieldId, position);
  position.dependencies.push(
    { itemId: position.itemId, fieldId, revision: field.revision },
    ...(field.dependencies ?? [])
  );
  if (field.state === 'unavailable') return unavailableField(field, position);
  return { state: 'value', value: field.value };
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
    const step = readField(snapshot, referenceFieldId, { itemId, traversedItemIds, dependencies });
    if (step.state === 'stopped') return step.evaluation;
    if (!reference(step.value) || step.value.targetKind !== 'item')
      return errorEvaluation('invalid_value', dependencies);
    itemId = step.value.targetId;
    traversedItemIds.push(itemId);
  }
  const step = readField(snapshot, expression.fieldId, { itemId, traversedItemIds, dependencies });
  if (step.state === 'stopped') return step.evaluation;
  return {
    state: 'value',
    value: step.value,
    dependencies: uniqueEvaluatedDependencies(dependencies),
  };
}
