import type { CatalogueField } from '../../catalogue-editor/types.js';
import type { WebItem } from './label-item';

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
