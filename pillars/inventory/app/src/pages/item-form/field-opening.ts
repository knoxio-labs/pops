import type { WebGetResponses } from '../../inventory-api/types.gen.js';
import type { FormFieldDef, FormTypeDef } from './field-model';
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

/** Maps a protocol-1 field-key payload into the form's stable field-id drafts. */
export function fieldDraftsFromProtocolFields(
  fields: Readonly<Record<string, unknown>>,
  type: FormTypeDef | null
): ItemDraft['fields'] {
  const text: Record<string, readonly string[]> = {};
  const refs: Record<string, readonly { id: string; kind: 'item' | 'location'; label: string }[]> =
    {};
  const booleans: Record<string, boolean> = {};
  for (const field of type?.fields ?? []) {
    const values = rawValues(fields[field.key]);
    if (field.kind === 'boolean') {
      const value = values[0];
      if (typeof value === 'boolean') booleans[field.id] = value;
    } else if (field.kind === 'reference') {
      refs[field.id] = values.flatMap((value) =>
        typeof value === 'string'
          ? [{ id: value, kind: field.referenceKinds[0] ?? 'item', label: value }]
          : []
      );
    } else {
      text[field.id] = values.map((value) => textValueForField(field, value));
    }
  }
  return { text, refs, booleans };
}

type StableFieldEntry = Pick<WebItem['fieldValues'][number], 'fieldId' | 'values'>;

/** Maps stable catalogue field values into the item-form draft model. */
export function fieldDraftsFromStableValues(
  values: readonly StableFieldEntry[],
  type: FormTypeDef | null
): ItemDraft['fields'] {
  const text: Record<string, readonly string[]> = {};
  const refs: Record<string, readonly { id: string; kind: 'item' | 'location'; label: string }[]> =
    {};
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
        return [{ id: targetId, kind: targetKind, label: targetId }];
      });
    } else {
      text[field.id] = rawValues.map((value) => textValueForField(field, value));
    }
  }
  return { text, refs, booleans };
}
