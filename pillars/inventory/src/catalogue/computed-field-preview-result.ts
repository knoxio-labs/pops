import { inArray } from 'drizzle-orm';

import { items } from '../db/schema.js';

import type { CommandDb } from '../domain/commands/index.js';
import type {
  ComputedFieldPreviewItem,
  ComputedFieldPreviewMissing,
  ComputedFieldPreviewResult,
} from './computed-field-preview-types.js';
import type { EvaluatedDependency, ExpressionEvaluation } from './expression-types.js';

/** The root item, everything a hop traversed, and every item a dependency read, deduplicated. */
export function orderedItemIds(
  rootItemId: string,
  traversed: readonly string[],
  dependencies: readonly EvaluatedDependency[]
): string[] {
  return [...new Set([rootItemId, ...traversed, ...dependencies.map((entry) => entry.itemId)])];
}

function previewMissing(
  rootItemId: string,
  evaluation: Extract<ExpressionEvaluation, { readonly state: 'unavailable' }>
): ComputedFieldPreviewMissing[] {
  if (evaluation.missingInputs.length > 0)
    return evaluation.missingInputs.map(({ fieldId, itemId, reason }) => ({
      fieldId,
      itemId,
      reason,
    }));
  return [
    {
      fieldId: evaluation.fieldId,
      itemId: evaluation.traversedItemIds.at(-1) ?? rootItemId,
      reason: evaluation.reason,
    },
  ];
}

/** Turns a raw expression evaluation into the preview's degraded wire result. */
export function previewResult(
  rootItemId: string,
  evaluation: ExpressionEvaluation
): ComputedFieldPreviewResult {
  if (evaluation.state === 'unavailable')
    return {
      state: 'unavailable',
      missingInputs: previewMissing(rootItemId, evaluation),
      dependencies: evaluation.dependencies,
      traversedItemIds: evaluation.traversedItemIds,
    };
  const traversedItemIds = orderedItemIds(rootItemId, [], evaluation.dependencies);
  if (evaluation.state === 'value')
    return {
      state: 'value',
      value: evaluation.value,
      dependencies: evaluation.dependencies,
      traversedItemIds,
    };
  return {
    state: 'error',
    code: evaluation.code,
    dependencies: evaluation.dependencies,
    traversedItemIds,
  };
}

/** Names every item in `ids`, in the order given, dropping any that no longer exist. */
export function namedItems(db: CommandDb, ids: readonly string[]): ComputedFieldPreviewItem[] {
  if (ids.length === 0) return [];
  const rows = db
    .select({ id: items.id, name: items.name, typeId: items.typeId })
    .from(items)
    .where(inArray(items.id, [...ids]))
    .all();
  return ids.flatMap((id) => rows.filter((row) => row.id === id));
}
