/** The smallest type record needed to build an inventory hierarchy. */
export interface TypeTreeRecord {
  id: string;
  label: string;
  parentTypeId: string | null;
  archived?: boolean;
  status?: 'published' | 'draft' | 'archived';
}

/** A flattened type row with the path and depth needed by a chooser or tree. */
export interface TypeTreeOption {
  value: string;
  label: string;
  pathLabel: string;
  depth: number;
  disabled?: boolean;
  reason?: string;
}

function byId(types: readonly TypeTreeRecord[]): Map<string, TypeTreeRecord> {
  return new Map(types.map((type) => [type.id, type]));
}

function isArchived(type: TypeTreeRecord): boolean {
  return type.archived === true || type.status === 'archived';
}

function childrenByParent(types: readonly TypeTreeRecord[]): Map<string | null, TypeTreeRecord[]> {
  const children = new Map<string | null, TypeTreeRecord[]>();
  for (const type of types) {
    const parent =
      type.parentTypeId !== null && types.some((candidate) => candidate.id === type.parentTypeId)
        ? type.parentTypeId
        : null;
    children.set(parent, [...(children.get(parent) ?? []), type]);
  }
  return children;
}

/** Returns the type and its ancestors in root-to-leaf order. */
export function typePath(types: readonly TypeTreeRecord[], typeId: string): TypeTreeRecord[] {
  const index = byId(types);
  const path: TypeTreeRecord[] = [];
  const seen = new Set<string>();
  let current = index.get(typeId);
  while (current !== undefined && !seen.has(current.id)) {
    path.unshift(current);
    seen.add(current.id);
    current = current.parentTypeId === null ? undefined : index.get(current.parentTypeId);
  }
  return path;
}

/** Returns the owner-facing path, such as `Bedding › Sheet`. */
export function typePathLabel(types: readonly TypeTreeRecord[], typeId: string): string {
  const path = typePath(types, typeId);
  return path.map((type) => type.label).join(' › ');
}

/** Returns the one-based depth of a type, with a root at depth one. */
export function typeDepth(types: readonly TypeTreeRecord[], typeId: string): number {
  return Math.max(typePath(types, typeId).length, 1);
}

/** Returns the deepest level below a type, counting the type itself. */
export function typeHeight(types: readonly TypeTreeRecord[], typeId: string): number {
  const children = childrenByParent(types);
  const visiting = new Set<string>();
  const height = (id: string): number => {
    if (visiting.has(id)) return 1;
    visiting.add(id);
    const descendants = children.get(id) ?? [];
    const result =
      descendants.length === 0 ? 1 : 1 + Math.max(...descendants.map((child) => height(child.id)));
    visiting.delete(id);
    return result;
  };
  return height(typeId);
}

/** Returns all descendants of a type, in fixture order. */
export function descendantIds(types: readonly TypeTreeRecord[], typeId: string): string[] {
  const children = childrenByParent(types);
  const descendants: string[] = [];
  const visit = (id: string) => {
    for (const child of children.get(id) ?? []) {
      descendants.push(child.id);
      visit(child.id);
    }
  };
  visit(typeId);
  return descendants;
}

function flattenFrom(
  children: ReadonlyMap<string | null, readonly TypeTreeRecord[]>,
  parentTypeId: string | null,
  result: TypeTreeRecord[]
): void {
  for (const type of children.get(parentTypeId) ?? []) {
    result.push(type);
    flattenFrom(children, type.id, result);
  }
}

/** Flattens roots and descendants in display order. */
export function flattenTypeTree(types: readonly TypeTreeRecord[]): TypeTreeRecord[] {
  const result: TypeTreeRecord[] = [];
  flattenFrom(childrenByParent(types), null, result);
  return result;
}

/** Returns type options, keeping matching ancestors visible for a child search. */
export function typeTreeOptions(
  types: readonly TypeTreeRecord[],
  query = '',
  includeArchived = true
): TypeTreeOption[] {
  const flattened = flattenTypeTree(types);
  const normalised = query.trim().toLocaleLowerCase();
  const visible = new Set<string>();
  if (normalised === '') {
    for (const type of flattened) visible.add(type.id);
  } else {
    for (const type of flattened) {
      const path = typePathLabel(types, type.id).toLocaleLowerCase();
      if (!path.includes(normalised) && !type.label.toLocaleLowerCase().includes(normalised))
        continue;
      visible.add(type.id);
      for (const ancestor of typePath(types, type.id)) visible.add(ancestor.id);
    }
  }
  return flattened
    .filter((type) => visible.has(type.id))
    .filter((type) => includeArchived || !isArchived(type))
    .map((type) => ({
      value: type.id,
      label: type.label,
      pathLabel: typePathLabel(types, type.id),
      depth: typeDepth(types, type.id),
      disabled: isArchived(type),
      reason: isArchived(type) ? 'Archived types cannot be chosen.' : undefined,
    }));
}

/** Returns the choices for reparenting an edited type and each refusal reason. */
export function parentChoices(
  types: readonly TypeTreeRecord[],
  editedTypeId: string,
  maxDepth = 3
): TypeTreeOption[] {
  const editedHeight = typeHeight(types, editedTypeId);
  const descendants = new Set(descendantIds(types, editedTypeId));
  return flattenTypeTree(types).map((type) => {
    let reason: string | undefined;
    if (type.id === editedTypeId) reason = 'A type cannot be its own parent.';
    else if (isArchived(type)) reason = 'Archived types cannot become parents.';
    else if (descendants.has(type.id)) reason = 'A type cannot be parented below its descendant.';
    else if (typeDepth(types, type.id) + editedHeight > maxDepth) {
      reason = `Depth ${String(typeDepth(types, type.id) + editedHeight)} exceeds the cap of ${String(maxDepth)}.`;
    }
    return {
      value: type.id,
      label: type.label,
      pathLabel: typePathLabel(types, type.id),
      depth: typeDepth(types, type.id),
      disabled: reason !== undefined,
      reason,
    };
  });
}

/** Returns the record for a type, or null when a fixture refers to no type. */
export function findType(types: readonly TypeTreeRecord[], typeId: string): TypeTreeRecord | null {
  return types.find((type) => type.id === typeId) ?? null;
}
