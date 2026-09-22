import type { CatalogueField, CatalogueOperation, CatalogueType } from '../catalogue-editor/types';
import type { EditorMode } from './cataloguePageTypes';

/** Builds an adjacent field reorder while retaining archived definitions in the full order. */
export function reorderField(
  fields: readonly CatalogueField[],
  fieldId: string,
  direction: -1 | 1,
  parentId: string
): CatalogueOperation {
  const ids = fields.map((field) => field.id);
  const active = fields.filter((field) => field.archivedAt === null);
  const adjacent = active[active.findIndex((field) => field.id === fieldId) + direction];
  if (adjacent === undefined) return { kind: 'reorder', definition: 'field', parentId, ids };
  const from = ids.indexOf(fieldId);
  const to = ids.indexOf(adjacent.id);
  if (from >= 0 && to >= 0) {
    const fromId = ids[from];
    const toId = ids[to];
    if (fromId !== undefined && toId !== undefined) [ids[from], ids[to]] = [toId, fromId];
  }
  return { kind: 'reorder', definition: 'field', parentId, ids };
}

/** Keeps a selected type when present or chooses the first active definition. */
export function resolveTypeId(
  types: readonly CatalogueType[],
  storedTypeId: string | null
): string | null {
  if (storedTypeId !== null && types.some((type) => type.id === storedTypeId)) return storedTypeId;
  return types.find((type) => type.archivedAt === null)?.id ?? types[0]?.id ?? null;
}

/** Reports whether a selected field already belongs to the immutable published revision. */
export function publishedField(
  types: readonly CatalogueType[] | undefined,
  typeId: string | null,
  fieldId: string | null
): boolean {
  if (typeId === null || fieldId === null) return false;
  return (
    types?.find((type) => type.id === typeId)?.fields.some((field) => field.id === fieldId) ?? false
  );
}

/** Locates the identity minted by a successful type or field creation operation. */
export function findCreated({
  fieldIds,
  mode,
  selectedTypeId,
  typeIds,
  types,
}: {
  readonly fieldIds: ReadonlySet<string>;
  readonly mode: EditorMode;
  readonly selectedTypeId: string | null;
  readonly typeIds: ReadonlySet<string>;
  readonly types: readonly CatalogueType[];
}) {
  if (mode === 'new-type')
    return {
      kind: 'type' as const,
      typeId: types.find((type) => !typeIds.has(type.id))?.id ?? null,
      fieldId: null,
      mode: 'type' as const,
    };
  if (mode === 'new-field')
    return {
      kind: 'field' as const,
      typeId: null,
      fieldId:
        types
          .find((type) => type.id === selectedTypeId)
          ?.fields.find((field) => !fieldIds.has(field.id))?.id ?? null,
      mode: 'field' as const,
    };
  return { kind: 'saved' as const, typeId: null, fieldId: null, mode: null };
}
