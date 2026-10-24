import type { CatalogueField, CatalogueType } from '../../catalogue-editor/types.js';
import type { WebItem } from './label-item';

/** Preserves the defining type's key for inherited printable fields. */
export function labelFieldId(
  field: CatalogueField,
  types: ReadonlyMap<string, CatalogueType>,
  fallbackTypeKey: string
): string {
  return `${types.get(field.typeId)?.key ?? fallbackTypeKey}.${field.key}`;
}

/** Reports unavailable computed values unless an explicit override supplies the field. */
export function fieldValueError(item: WebItem, field: CatalogueField): Error | null {
  if (field.storage !== 'computed') return null;
  if (item.fieldValues.some((value) => value.fieldId === field.id && value.source === 'override'))
    return null;
  const computed = item.computedValues.find((value) => value.fieldId === field.id);
  if (computed?.state === 'ok' || computed?.state === 'overridden') return null;
  return new Error(
    `Could not read ${field.label} for ${item.name}. The computed field is unavailable.`
  );
}

/** Reads override, stored, computed or legacy values in label display precedence. */
export function fieldValuesFor(item: WebItem, field: CatalogueField): readonly unknown[] {
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
