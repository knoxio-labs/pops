import type { CatalogueField, CatalogueType } from '../catalogue-editor/types';

/** Maximum supported depth for a catalogue type tree, counting a root as one. */
export const MAX_TYPE_TREE_DEPTH = 5;

type TypeIndex = ReadonlyMap<string, CatalogueType>;

function typeIndex(types: readonly CatalogueType[]): TypeIndex {
  return new Map(types.map((type) => [type.id, type]));
}

function ancestorTypeIds(index: TypeIndex, typeId: string): string[] {
  const start = index.get(typeId);
  if (start === undefined) return [];
  const ids: string[] = [];
  const seen = new Set([typeId]);
  let current = start;
  while (current.parentTypeId !== null) {
    const parent = index.get(current.parentTypeId);
    if (parent === undefined || seen.has(parent.id)) break;
    seen.add(parent.id);
    ids.push(parent.id);
    current = parent;
  }
  return ids.toReversed();
}

function ownFields(type: CatalogueType): CatalogueField[] {
  return [...type.fields].toSorted(
    (left, right) => left.sortOrder - right.sortOrder || left.key.localeCompare(right.key)
  );
}

function effectiveField(types: readonly CatalogueType[], field: CatalogueField): CatalogueField {
  if (field.kind !== 'reference' || field.referenceTypeIds.length === 0) return field;
  return {
    ...field,
    referenceTypeIds: [
      ...new Set(
        field.referenceTypeIds.flatMap((typeId) => [typeId, ...descendantIds(types, typeId)])
      ),
    ],
  };
}

/** Returns root-first ancestor ids, excluding the requested type itself. */
export function ancestorIds(types: readonly CatalogueType[], id: string): string[] {
  return ancestorTypeIds(typeIndex(types), id);
}

/** Returns every descendant id, including archived types, without following cycles forever. */
export function descendantIds(types: readonly CatalogueType[], id: string): string[] {
  const index = typeIndex(types);
  if (!index.has(id)) return [];
  const descendants: string[] = [];
  const descendantSet = new Set<string>();
  for (const type of types) {
    if (type.id === id) continue;
    const seen = new Set<string>();
    let current: CatalogueType | undefined = type;
    while (current !== undefined && current.parentTypeId !== null) {
      if (current.parentTypeId === id && !descendantSet.has(type.id)) {
        descendantSet.add(type.id);
        descendants.push(type.id);
        break;
      }
      if (seen.has(current.id)) break;
      seen.add(current.id);
      current = index.get(current.parentTypeId);
    }
  }
  return descendants;
}

/** Returns the one-based depth of a type, with a root at depth one. */
export function typeDepth(types: readonly CatalogueType[], id: string): number {
  return Math.max(ancestorIds(types, id).length + (typeIndex(types).has(id) ? 1 : 0), 1);
}

/** Returns the deepest level below a type, counting the type itself. */
export function typeHeight(types: readonly CatalogueType[], id: string): number {
  const children = new Map<string, CatalogueType[]>();
  const knownIds = new Set(types.map((type) => type.id));
  if (!knownIds.has(id)) return 0;
  for (const type of types) {
    if (type.parentTypeId === null || !knownIds.has(type.parentTypeId)) continue;
    children.set(type.parentTypeId, [...(children.get(type.parentTypeId) ?? []), type]);
  }
  const visit = (typeId: string, visiting: ReadonlySet<string>): number => {
    if (visiting.has(typeId)) return 0;
    const next = new Set(visiting);
    next.add(typeId);
    const childTypes = children.get(typeId) ?? [];
    if (childTypes.length === 0) return 1;
    return 1 + Math.max(...childTypes.map((child) => visit(child.id, next)));
  };
  return visit(id, new Set());
}

/** Returns the type labels from the root to the requested type. */
export function typePath(types: readonly CatalogueType[], id: string): string[] {
  const index = typeIndex(types);
  const start = index.get(id);
  if (start === undefined) return [];
  const path = [start.label];
  const seen = new Set([id]);
  let current = start;
  while (current.parentTypeId !== null) {
    const parent = index.get(current.parentTypeId);
    if (parent === undefined || seen.has(parent.id)) break;
    seen.add(parent.id);
    path.unshift(parent.label);
    current = parent;
  }
  return path;
}

/** Returns the root-first label path used wherever a type is shown to a person. */
export function typePathLabel(types: readonly CatalogueType[], id: string): string {
  return typePath(types, id).join(' › ');
}

/** Returns ancestor-owned fields in root-first order, followed by the type's own fields. */
export function effectiveFields(types: readonly CatalogueType[], id: string): CatalogueField[] {
  const index = typeIndex(types);
  const type = index.get(id);
  if (type === undefined) return [];
  const fields = new Map<string, CatalogueField>();
  for (const typeId of [...ancestorIds(types, id), id]) {
    const owner = index.get(typeId);
    for (const field of owner === undefined ? [] : ownFields(owner)) {
      fields.set(field.id, effectiveField(types, field));
    }
  }
  return [...fields.values()];
}

/** Returns the union of inherited and local capabilities in root-first order. */
export function effectiveCapabilities(
  types: readonly CatalogueType[],
  id: string
): CatalogueType['capabilities'] {
  const index = typeIndex(types);
  const capabilities = new Set<CatalogueType['capabilities'][number]>();
  for (const typeId of [...ancestorIds(types, id), id]) {
    for (const capability of index.get(typeId)?.capabilities ?? []) capabilities.add(capability);
  }
  return [...capabilities];
}

/** Returns one catalogue type with inherited fields and capabilities resolved. */
export function effectiveType(types: readonly CatalogueType[], id: string): CatalogueType | null {
  const type = typeIndex(types).get(id);
  return type === undefined
    ? null
    : {
        ...type,
        capabilities: effectiveCapabilities(types, id),
        fields: effectiveFields(types, id),
      };
}
