import type {
  PersistedItemType,
  PersistedItemTypeField,
  UnresolvedItemType,
} from './catalogue-types.js';

type TypeTreeNode = Pick<PersistedItemType, 'id' | 'parentTypeId'>;

/** Maximum supported depth for a type tree, counting a root as depth one. */
export const MAX_TYPE_TREE_DEPTH = 3;

/** The result of walking a type's parent chain. */
export interface TypeChain {
  readonly ancestorIds: readonly string[];
  readonly stop: 'root' | 'missing_parent' | 'cycle';
}

/** Walks a type's parent chain without throwing or looping on malformed input. */
export function typeChain(types: readonly TypeTreeNode[], typeId: string): TypeChain {
  const byId = new Map(types.map((type) => [type.id, type]));
  const start = byId.get(typeId);
  if (start === undefined) return { ancestorIds: [], stop: 'missing_parent' };

  const seen = new Set([typeId]);
  const ancestors: string[] = [];
  let current = start;
  let stop: TypeChain['stop'] = 'root';
  while (current.parentTypeId !== null) {
    const parent = byId.get(current.parentTypeId);
    if (parent === undefined) {
      stop = 'missing_parent';
      break;
    }
    if (seen.has(parent.id)) {
      stop = 'cycle';
      break;
    }
    seen.add(parent.id);
    ancestors.push(parent.id);
    current = parent;
  }
  return { ancestorIds: ancestors.toReversed(), stop };
}

/** Returns the root-first ancestor ids of a type. */
export function ancestorIds(types: readonly TypeTreeNode[], typeId: string): readonly string[] {
  return typeChain(types, typeId).ancestorIds;
}

/** Returns every type whose parent chain contains `typeId`, including archived types. */
export function descendantIds(types: readonly TypeTreeNode[], typeId: string): string[] {
  return types
    .filter((type) => type.id !== typeId)
    .filter((type) => typeChain(types, type.id).ancestorIds.includes(typeId))
    .map((type) => type.id);
}

function resolvedOwnFields(
  types: readonly UnresolvedItemType[]
): Map<string, PersistedItemTypeField[]> {
  return new Map(
    types.map((type) => [
      type.id,
      type.fields
        .map((field): PersistedItemTypeField => {
          const admittedReferenceTypeIds = new Set(field.referenceTypeIds);
          for (const referenceTypeId of field.referenceTypeIds) {
            for (const descendantId of descendantIds(types, referenceTypeId)) {
              admittedReferenceTypeIds.add(descendantId);
            }
          }
          return { ...field, admittedReferenceTypeIds };
        })
        .toSorted(
          (left, right) => left.sortOrder - right.sortOrder || left.key.localeCompare(right.key)
        ),
    ])
  );
}

/** Resolves own fields, inherited fields, admitted reference ids, and capabilities for every type. */
export function resolveTypeTree(types: readonly UnresolvedItemType[]): PersistedItemType[] {
  const fieldsByTypeId = resolvedOwnFields(types);
  return types.map((type): PersistedItemType => {
    const fields = fieldsByTypeId.get(type.id) ?? [];
    const chain = typeChain(types, type.id).ancestorIds;
    const effectiveFields = [
      ...chain.flatMap((ancestorId) => fieldsByTypeId.get(ancestorId) ?? []),
      ...fields,
    ];
    const capabilities = new Set<string>();
    for (const ancestorId of chain) {
      for (const capability of types.find((entry) => entry.id === ancestorId)?.capabilities ?? []) {
        capabilities.add(capability);
      }
    }
    for (const capability of type.capabilities) capabilities.add(capability);
    return {
      ...type,
      fields,
      effectiveFields,
      effectiveCapabilities: [...capabilities],
    };
  });
}
