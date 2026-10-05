import type { PersistedItemTypeField } from './catalogue-types.js';

/** Trims submitted text while preserving an unchanged archived value byte-for-byte. */
export function normalizeItemValueText(
  field: PersistedItemTypeField,
  values: readonly unknown[],
  existing: readonly string[]
): { readonly values: readonly unknown[]; readonly emptyTextClear: boolean } {
  const isText = field.kind === 'short_text' || field.kind === 'long_text';
  if (!isText) return { values, emptyTextClear: false };
  const existingSet = new Set(existing);
  const normalized = values
    .map((value) => {
      if (
        field.archivedAt !== null &&
        typeof value === 'string' &&
        existingSet.has(JSON.stringify(value))
      ) {
        return value;
      }
      return typeof value === 'string' ? value.trim() : value;
    })
    .filter((value) => typeof value !== 'string' || value.length > 0);
  return {
    values: normalized,
    emptyTextClear: values.length > 0 && normalized.length === 0,
  };
}
