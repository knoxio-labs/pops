import type { LocationPatch } from './reorder';
import type { LocationTreeNode } from './utils';

/**
 * Applies the patches a real `PATCH /locations/{id}` round trip would leave
 * behind, directly against the fixture tree held in the screen's local
 * state. There is no server here: this is what the mutation-then-refetch
 * the app performs would settle into, computed in one step. Every field a
 * patch omits is left as it was, matching a partial update.
 */
export function applyLocationPatches(
  tree: LocationTreeNode[],
  patches: LocationPatch[]
): LocationTreeNode[] {
  let next = tree;
  for (const { id, ...fields } of patches) {
    if (fields.parentId !== undefined) {
      const removal = findAndRemove(next, id);
      if (!removal) continue;
      const moved: LocationTreeNode = { ...removal.removed, ...fields };
      next = insertNode(removal.rest, fields.parentId, moved);
    } else {
      next = patchNode(next, id, fields);
    }
  }
  return sortTree(next);
}

function findAndRemove(
  nodes: LocationTreeNode[],
  id: string
): { removed: LocationTreeNode; rest: LocationTreeNode[] } | null {
  const index = nodes.findIndex((n) => n.id === id);
  const removed = index >= 0 ? nodes[index] : undefined;
  if (removed) {
    return { removed, rest: [...nodes.slice(0, index), ...nodes.slice(index + 1)] };
  }
  for (const [i, node] of nodes.entries()) {
    const found = findAndRemove(node.children, id);
    if (found) {
      const rest = [...nodes];
      rest[i] = { ...node, children: found.rest };
      return { removed: found.removed, rest };
    }
  }
  return null;
}

function insertNode(
  nodes: LocationTreeNode[],
  parentId: string | null,
  node: LocationTreeNode
): LocationTreeNode[] {
  if (parentId === null) return [...nodes, node];
  return nodes.map((n) =>
    n.id === parentId
      ? { ...n, children: [...n.children, node] }
      : { ...n, children: insertNode(n.children, parentId, node) }
  );
}

function patchNode(
  nodes: LocationTreeNode[],
  id: string,
  fields: Omit<LocationPatch, 'id'>
): LocationTreeNode[] {
  return nodes.map((n) =>
    n.id === id ? { ...n, ...fields } : { ...n, children: patchNode(n.children, id, fields) }
  );
}

function sortTree(nodes: LocationTreeNode[]): LocationTreeNode[] {
  return [...nodes]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((n) => ({ ...n, children: sortTree(n.children) }));
}

/** Removes a node (and its subtree) from the tree, e.g. after a confirmed delete. */
export function removeLocation(tree: LocationTreeNode[], id: string): LocationTreeNode[] {
  const removal = findAndRemove(tree, id);
  return removal ? removal.rest : tree;
}

let nextIdCounter = 0;

/** A stable-enough id for a node created on the canvas; the real API mints a UUID. */
export function generateLocationId(): string {
  nextIdCounter += 1;
  return `loc-new-${nextIdCounter}`;
}

export function addLocation(
  tree: LocationTreeNode[],
  { name, parentId }: { name: string; parentId: string | null }
): LocationTreeNode[] {
  const siblings = parentId === null ? tree : (findNode(tree, parentId)?.children ?? []);
  const node: LocationTreeNode = {
    id: generateLocationId(),
    name,
    parentId,
    sortOrder: siblings.length,
    children: [],
  };
  return insertNode(tree, parentId, node);
}

export function renameLocation(
  tree: LocationTreeNode[],
  id: string,
  name: string
): LocationTreeNode[] {
  return nodes(tree, id, name);
}

function nodes(list: LocationTreeNode[], id: string, name: string): LocationTreeNode[] {
  return list.map((n) =>
    n.id === id ? { ...n, name } : { ...n, children: nodes(n.children, id, name) }
  );
}

function findNode(nodes: LocationTreeNode[], id: string): LocationTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return undefined;
}
