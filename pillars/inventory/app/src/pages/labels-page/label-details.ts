import type { LabelDetails, LabelFieldValue } from '@pops/inventory/labels';

import type { CatalogueField, CatalogueType } from '../../catalogue-editor/types.js';
import type { LabelSubject, WebItem } from './useLabelSubjects.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function objectValueText(value: Record<string, unknown>, field?: CatalogueField): string {
  if (field?.kind === 'enum' && typeof value.optionId === 'string') {
    return (
      field.enumOptions.find((option) => option.id === value.optionId)?.label ?? 'Unknown option'
    );
  }
  if (
    (typeof value.amount === 'string' || typeof value.amount === 'number') &&
    typeof value.unit === 'string'
  ) {
    return `${value.amount} ${value.unit}`;
  }
  if (typeof value.targetId === 'string') return value.targetId;
  return JSON.stringify(value) ?? '';
}

function valueText(value: unknown, field?: CatalogueField): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value
      .map((entry) => valueText(entry, field))
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (isRecord(value)) return objectValueText(value, field);
  return '';
}

function fieldValuesFor(item: WebItem, field: CatalogueField): readonly unknown[] {
  const overrides = item.fieldValues.find(
    (entry) => entry.fieldId === field.id && entry.source === 'override'
  );
  if (overrides !== undefined) return overrides.values;
  const stored = item.fieldValues.find(
    (entry) => entry.fieldId === field.id && entry.source === 'stored'
  );
  if (stored !== undefined) return stored.values;
  const computed = item.computedValues.find((entry) => entry.fieldId === field.id);
  if (computed?.state === 'ok' || computed?.state === 'overridden') return computed.values;
  const legacy = item.fields[field.key] ?? item.fields[field.label];
  return legacy === undefined ? [] : [legacy];
}

function catalogueDetailsFor(
  item: WebItem,
  contents: readonly LabelSubject[],
  type: CatalogueType
): LabelDetails {
  const prefix = item.typeKey ?? type.key;
  const fields: LabelFieldValue[] = [];
  for (const field of type.fields) {
    const value = fieldValuesFor(item, field)
      .map((entry) => valueText(entry, field))
      .filter(Boolean)
      .join(', ');
    if (value.length === 0) continue;
    fields.push({ id: `${prefix}.${field.key}`, label: field.label, value });
  }
  return {
    typeName: type.label,
    fields,
    contents: contents.map((subject) =>
      subject.quantity > 1 ? `${subject.name} ×${subject.quantity}` : subject.name
    ),
  };
}

/** Builds printable label details from catalogue fields, with legacy fallback values. */
export function detailsFor(
  item: WebItem,
  contents: readonly LabelSubject[],
  types: ReadonlyMap<string, CatalogueType>
): LabelDetails {
  const type = item.typeId === null ? undefined : types.get(item.typeId);
  if (type !== undefined) return catalogueDetailsFor(item, contents, type);

  const fields: LabelFieldValue[] = [];
  if (item.typeKey !== null) {
    for (const [key, rawValue] of Object.entries(item.fields)) {
      const value = valueText(rawValue);
      if (value.length === 0) continue;
      fields.push({ id: `${item.typeKey}.${key}`, label: key, value });
    }
  }
  return {
    typeName: item.typeKey,
    fields,
    contents: contents.map((subject) =>
      subject.quantity > 1 ? `${subject.name} ×${subject.quantity}` : subject.name
    ),
  };
}
