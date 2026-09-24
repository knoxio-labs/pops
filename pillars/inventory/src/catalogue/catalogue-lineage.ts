import type {
  PersistedCatalogue,
  PersistedItemType,
  PersistedItemTypeField,
} from './catalogue-types.js';

/** A type or field as far as replacement lineage is concerned. */
export interface Replaceable {
  readonly id: string;
  readonly archivedAt: string | null;
  readonly replacedBy: string | null;
}

function liveEnd<T extends Replaceable>(start: T, find: (id: string) => T | undefined): T | null {
  const seen = new Set([start.id]);
  let current = start;
  while (current.archivedAt !== null && current.replacedBy !== null) {
    if (seen.has(current.replacedBy)) return null;
    seen.add(current.replacedBy);
    const next = find(current.replacedBy);
    if (next === undefined) return null;
    current = next;
  }
  return current === start || current.archivedAt !== null ? null : current;
}

/** The field `id` in any type of `catalogue`. */
export function fieldById(
  catalogue: PersistedCatalogue,
  id: string
): PersistedItemTypeField | undefined {
  return catalogue.types.flatMap((type) => type.fields).find((field) => field.id === id);
}

/** The type `id` in `catalogue`. */
export function typeById(catalogue: PersistedCatalogue, id: string): PersistedItemType | undefined {
  return catalogue.types.find((type) => type.id === id);
}

/**
 * The live field that stands in for the archived field `fieldId` in
 * `catalogue`, following recorded lineage across later replacements; null
 * when the field is live, unknown, or its lineage ends at an archived field.
 */
export function replacingField(
  catalogue: PersistedCatalogue,
  fieldId: string
): PersistedItemTypeField | null {
  const field = fieldById(catalogue, fieldId);
  return field === undefined ? null : liveEnd(field, (id) => fieldById(catalogue, id));
}

/** {@link replacingField} for an archived type. */
export function replacingType(
  catalogue: PersistedCatalogue,
  typeId: string
): PersistedItemType | null {
  const type = typeById(catalogue, typeId);
  return type === undefined ? null : liveEnd(type, (id) => typeById(catalogue, id));
}
