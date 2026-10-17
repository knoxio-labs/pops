import { effectiveType } from '../../lib/type-tree.js';
import { fieldValuesFor } from './label-field-values';

import type { CatalogueField, CatalogueType } from '../../catalogue-editor/types.js';
import type { WebItem } from './useLabelSubjects';

/** Existing item metadata that controls the printed handling warning and manual fallback. */
export interface LabelFragility {
  fragile: boolean;
  /** Whether the selected item already owns a Fragile field instead of needing a manual switch. */
  recorded: boolean;
  /** Printable field ids represented by the handling symbol on the selected item. */
  fields: ReadonlySet<string>;
  error: Error | null;
}

function computedUnavailable(item: WebItem, field: CatalogueField): boolean {
  if (field.storage !== 'computed') return false;
  if (item.fieldValues.some((value) => value.fieldId === field.id && value.source === 'override'))
    return false;
  const computed = item.computedValues.find((value) => value.fieldId === field.id);
  return computed?.state !== 'ok' && computed?.state !== 'overridden';
}

function legacyFragility(item: WebItem): LabelFragility {
  const fields = new Set<string>();
  for (const [key, value] of Object.entries(item.fields)) {
    if (key.toLowerCase() !== 'fragile' || typeof value !== 'boolean') continue;
    if (item.typeKey !== null) fields.add(`${item.typeKey}.${key}`);
    return { fragile: value, recorded: true, fields, error: null };
  }
  return { fragile: false, recorded: false, fields, error: null };
}

function ownFragility(item: WebItem, types: ReadonlyMap<string, CatalogueType>): LabelFragility {
  const type = item.typeId == null ? null : effectiveType([...types.values()], item.typeId);
  if (type === null) return legacyFragility(item);
  const fields = new Set<string>();
  let fragile = false;
  let error: Error | null = null;
  for (const field of type.fields) {
    if (field.kind !== 'boolean' || field.key.toLowerCase() !== 'fragile') continue;
    fields.add(`${types.get(field.typeId)?.key ?? item.typeKey}.${field.key}`);
    if (computedUnavailable(item, field))
      error = new Error(
        `Could not determine fragility for ${item.name}. The Fragile field is unavailable.`
      );
    fragile ||= fieldValuesFor(item, field).some((value) => value === true);
  }
  return { fragile, recorded: fields.size > 0, fields, error };
}

/** Uses the configured boolean Fragile key, including inherited fields, across the complete item tree. */
export function treeFragility(
  item: WebItem,
  descendants: readonly WebItem[],
  types: ReadonlyMap<string, CatalogueType>
): LabelFragility {
  const own = ownFragility(item, types);
  for (const descendant of descendants) {
    const held = ownFragility(descendant, types);
    own.fragile ||= held.fragile;
    own.error ??= held.error;
  }
  return own;
}
