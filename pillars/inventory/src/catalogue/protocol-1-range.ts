/** Legacy protocol-1 range field lookup. */
import type { PersistedItemType, PersistedItemTypeField } from './catalogue.js';

/** Finds the split persisted fields that represent protocol-1 colour temperature. */
export function protocol1RangeFields(
  type: PersistedItemType
):
  | { readonly minimum: PersistedItemTypeField; readonly maximum: PersistedItemTypeField }
  | undefined {
  const minimum = type.fields.find((field) => field.key === 'Colour temperature minimum');
  const maximum = type.fields.find((field) => field.key === 'Colour temperature maximum');
  return minimum && maximum ? { minimum, maximum } : undefined;
}
