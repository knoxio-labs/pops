import type { PlacementWorld } from '../../foundation/model/placement-model';
import type { WebGetResponses } from '../../inventory-api/types.gen.js';
import type { FormFieldDef, FormTypeDef } from './field-model';
import type { ReferenceChoice } from './field-model';
import type { ItemDraft } from './form-draft';

type WebItem = WebGetResponses[200]['item'];

function fieldValueFor(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value) ?? '';
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null;
  const result = value[key];
  return typeof result === 'string' ? result : null;
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? null : trimmed;
}

function dateTimeForDraft(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString().slice(0, 16);
}

function enumTextValue(field: FormFieldDef, value: unknown): string {
  const optionValue = stringValue(value, 'optionId') ?? (typeof value === 'string' ? value : null);
  const option = field.enumOptions.find(
    (candidate) =>
      candidate.id === optionValue ||
      candidate.key === optionValue ||
      candidate.label === optionValue
  );
  return option?.id ?? optionValue ?? fieldValueFor(value);
}

function referenceChoiceFor(
  kind: 'item' | 'location',
  id: string,
  world: PlacementWorld | undefined
): ReferenceChoice {
  if (kind === 'item') {
    const item = world?.items.get(id);
    const label = nonEmpty(item?.name) ?? nonEmpty(item?.typeName) ?? 'Unknown item';
    const choice: ReferenceChoice = { id, kind, label };
    return item === undefined
      ? choice
      : {
          ...choice,
          typeId: item.typeId,
          typeName: item.typeName,
        };
  }
  return { id, kind, label: world?.locations.get(id)?.name ?? 'Unknown place' };
}

/** Converts one stable field value into the form's text representation. */
export function textValueForField(field: FormTypeDef['fields'][number], value: unknown): string {
  switch (field.kind) {
    case 'enum':
      return enumTextValue(field, value);
    case 'measurement':
      return stringValue(value, 'amount') ?? fieldValueFor(value);
    case 'reference':
      return stringValue(value, 'targetId') ?? fieldValueFor(value);
    case 'date_time':
      return typeof value === 'string' ? dateTimeForDraft(value) : fieldValueFor(value);
    default:
      return fieldValueFor(value);
  }
}

function rawValues(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

/** Maps protocol-1 field keys into stable drafts, resolving references through the optional world. */
export function fieldDraftsFromProtocolFields(
  fields: Readonly<Record<string, unknown>>,
  type: FormTypeDef | null,
  world?: PlacementWorld
): ItemDraft['fields'] {
  const text: Record<string, readonly string[]> = {};
  const refs: Record<string, readonly ReferenceChoice[]> = {};
  const booleans: Record<string, boolean> = {};
  for (const field of type?.fields ?? []) {
    const values = rawValues(fields[field.key]);
    if (field.kind === 'boolean') {
      const value = values[0];
      if (typeof value === 'boolean') booleans[field.id] = value;
    } else if (field.kind === 'reference') {
      refs[field.id] = values.flatMap((value) =>
        typeof value === 'string'
          ? [referenceChoiceFor(field.referenceKinds[0] ?? 'item', value, world)]
          : []
      );
    } else {
      text[field.id] = values.map((value) => textValueForField(field, value));
    }
  }
  return { text, refs, booleans };
}

type StableFieldEntry = Pick<WebItem['fieldValues'][number], 'fieldId' | 'values'>;

/** Maps stable values into drafts, resolving references through the optional world. */
export function fieldDraftsFromStableValues(
  values: readonly StableFieldEntry[],
  type: FormTypeDef | null,
  world?: PlacementWorld
): ItemDraft['fields'] {
  const text: Record<string, readonly string[]> = {};
  const refs: Record<string, readonly ReferenceChoice[]> = {};
  const booleans: Record<string, boolean> = {};
  const byField = new Map(values.map((entry) => [entry.fieldId, entry.values] as const));
  for (const field of type?.fields ?? []) {
    const rawValues = byField.get(field.id) ?? [];
    if (field.kind === 'boolean') {
      const value = rawValues[0];
      if (typeof value === 'boolean') booleans[field.id] = value;
    } else if (field.kind === 'reference') {
      refs[field.id] = rawValues.flatMap((value) => {
        const targetId = stringValue(value, 'targetId');
        const targetKind = stringValue(value, 'targetKind');
        if (targetId === null || (targetKind !== 'item' && targetKind !== 'location')) return [];
        return [referenceChoiceFor(targetKind, targetId, world)];
      });
    } else {
      text[field.id] = rawValues.map((value) => textValueForField(field, value));
    }
  }
  return { text, refs, booleans };
}
