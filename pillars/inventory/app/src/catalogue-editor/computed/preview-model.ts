import { evaluationErrorSentence } from '../expression/preview-copy';

import type { TypesManagePreviewComputedFieldResponses } from '../../inventory-api/types.gen';
import type { ExpressionContext, ExpressionField } from '../expression/model';
import type { PreviewMissingInput } from '../expression/preview-copy';

/** The preview route's answer. */
export type ComputedPreviewResponse = TypesManagePreviewComputedFieldResponses[200];

/** An item the author can preview against, or one a calculation passed through. */
export interface PreviewItem {
  readonly id: string;
  readonly label: string;
  readonly typeLabel: string;
}

/** One value read while evaluating, with the revision it was read at. */
export interface PreviewDependency {
  readonly itemLabel: string;
  readonly fieldLabel: string;
  readonly revision: number;
}

interface PreviewEvaluated {
  readonly item: PreviewItem;
  readonly dependencies: readonly PreviewDependency[];
  readonly traversed: readonly PreviewItem[];
}

/** The single-item, non-mutating preview of the draft expression, in every state it can be in. */
export type PreviewState =
  | { readonly state: 'no-draft' }
  | { readonly state: 'no-expression' }
  | { readonly state: 'invalid' }
  | { readonly state: 'no-items'; readonly typeLabel: string }
  | { readonly state: 'idle' }
  | { readonly state: 'loading'; readonly item: PreviewItem }
  | { readonly state: 'request-error'; readonly item: PreviewItem }
  | (PreviewEvaluated & {
      readonly state: 'value';
      readonly value: string;
      readonly workings: string;
      readonly override?: string;
    })
  | (PreviewEvaluated & {
      readonly state: 'unavailable';
      readonly missingInputs: readonly PreviewMissingInput[];
    })
  | (PreviewEvaluated & { readonly state: 'evaluation-error'; readonly sentence: string });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function formatObjectValue(value: Record<string, unknown>, field?: ExpressionField): string {
  const { amount, unit, optionId, targetId } = value;
  if (typeof amount === 'string' && typeof unit === 'string') return `${amount} ${unit}`;
  if (typeof optionId === 'string')
    return field?.options?.find((option) => option.id === optionId)?.label ?? optionId;
  if (typeof targetId === 'string') return targetId;
  return JSON.stringify(value);
}

/** Formats a wire value for the preview: yes or no, an amount with its unit, a choice's label. */
export function formatWireValue(value: unknown, field?: ExpressionField): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return isRecord(value) ? formatObjectValue(value, field) : JSON.stringify(value);
}

function fieldLabel(context: ExpressionContext, fieldId: string, own: ExpressionField): string {
  if (fieldId === own.id) return own.label;
  for (const type of context.types) {
    const field = type.fields.find((candidate) => candidate.id === fieldId);
    if (field !== undefined) return field.label;
  }
  return 'Unknown field';
}

/**
 * Turns the preview route's raw answer into what the preview renders: item
 * and field names in place of ids, sentences in place of reason and error
 * codes, and the override the item shows today beside the calculated value.
 */
export function previewStateFrom(
  response: ComputedPreviewResponse,
  context: ExpressionContext,
  field: ExpressionField,
  workings: string
): PreviewState {
  const typeLabel = (typeId: string | null) =>
    context.types.find((type) => type.id === typeId)?.label ?? 'Item';
  const itemOf = (id: string): PreviewItem => {
    const item = response.items.find((candidate) => candidate.id === id);
    return { id, label: item?.name ?? id, typeLabel: typeLabel(item?.typeId ?? null) };
  };
  const { result } = response;
  const evaluated: PreviewEvaluated = {
    item: itemOf(response.itemId),
    traversed: result.traversedItemIds.map(itemOf),
    dependencies: result.dependencies.map((dependency) => ({
      itemLabel: itemOf(dependency.itemId).label,
      fieldLabel: fieldLabel(context, dependency.fieldId, field),
      revision: dependency.revision,
    })),
  };
  if (result.state === 'value')
    return {
      ...evaluated,
      state: 'value',
      value: formatWireValue(result.value, field),
      workings,
      ...(response.override === null
        ? {}
        : { override: formatWireValue(response.override, field) }),
    };
  if (result.state === 'unavailable')
    return {
      ...evaluated,
      state: 'unavailable',
      missingInputs: result.missingInputs.map((missing) => ({
        reason: missing.reason,
        fieldLabel: fieldLabel(context, missing.fieldId, field),
        itemLabel: itemOf(missing.itemId).label,
      })),
    };
  return {
    ...evaluated,
    state: 'evaluation-error',
    sentence: evaluationErrorSentence(result.code),
  };
}
