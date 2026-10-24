import { effectiveType } from '../../lib/type-tree.js';
import { fieldValueError, fieldValuesFor, labelFieldId } from './label-field-values';

import type { CatalogueType } from '../../catalogue-editor/types.js';
import type { WebItem } from './label-item';

/** Existing item metadata that controls the printed handling warning and manual fallback. */
export interface LabelFragility {
  fragile: boolean;
  /** Whether the selected item has a selectable Fragile field instead of needing a manual switch. */
  recorded: boolean;
  /** Printable field ids represented by the handling symbol on the selected item. */
  fields: ReadonlySet<string>;
  error: Error | null;
}

function legacyFragility(item: WebItem): LabelFragility {
  const fields = new Set<string>();
  for (const [key, value] of Object.entries(item.fields)) {
    if (key.toLowerCase() !== 'fragile' || typeof value !== 'boolean') continue;
    if (item.typeKey !== null) fields.add(`${item.typeKey}.${key}`);
    return { fragile: value, recorded: fields.size > 0, fields, error: null };
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
    fields.add(labelFieldId(field, types, item.typeKey ?? type.key));
    error ??= fieldValueError(item, field);
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
