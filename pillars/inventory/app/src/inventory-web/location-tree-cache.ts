import type { LocationTreeNode, LocationsTreeResponse } from '../inventory-api/types.gen.js';

/** The value stored under {@link LOCATIONS_TREE_QUERY_KEY}. */
export type LocationTreeCache = LocationsTreeResponse;

interface FoundNode {
  readonly node: LocationTreeNode;
  readonly parentId: string | null;
}

interface TreeChange {
  readonly nodes: LocationTreeNode[];
  readonly changed: boolean;
}

function compareNodes(left: LocationTreeNode, right: LocationTreeNode): number {
  const orderDifference = left.sortOrder - right.sortOrder;
  if (orderDifference !== 0) return orderDifference;
  if (left.name < right.name) return -1;
  if (left.name > right.name) return 1;
  return 0;
}

function ordered(nodes: readonly LocationTreeNode[]): LocationTreeNode[] {
  return nodes.toSorted(compareNodes);
}

function cloneCache(cache: LocationTreeCache, data = cache.data): LocationTreeCache {
  return { ...cache, data };
}

function findInTree(
  nodes: readonly LocationTreeNode[],
  id: string,
  parentId: string | null
): FoundNode | null {
  for (const node of nodes) {
    if (node.id === id) return { node, parentId };
    const found = findInTree(node.children, id, node.id);
    if (found !== null) return found;
  }
  return null;
}

/** Finds one node and the parent represented by its position in the tree. */
export function findNode(cache: LocationTreeCache, id: string): FoundNode | null {
  return findInTree(cache.data, id, null);
}

/** Returns the next sibling sort order, or zero when the cache has no siblings. */
export function nextSortOrder(
  cache: LocationTreeCache | undefined,
  parentId: string | null
): number {
  if (cache === undefined) return 0;
  const siblings =
    parentId === null ? cache.data : (findNode(cache, parentId)?.node.children ?? undefined);
  if (siblings === undefined || siblings.length === 0) return 0;
  return Math.max(...siblings.map((node) => node.sortOrder)) + 1;
}

function appendUnder(
  nodes: readonly LocationTreeNode[],
  parentId: string,
  child: LocationTreeNode
): TreeChange {
  let changed = false;
  const next = nodes.map((node) => {
    if (node.id === parentId) {
      changed = true;
      return { ...node, children: ordered([...node.children, child]) };
    }

    const childChange = appendUnder(node.children, parentId, child);
    if (!childChange.changed) return node;
    changed = true;
    return { ...node, children: childChange.nodes };
  });
  return { nodes: changed ? next : [...nodes], changed };
}

/** Adds a node to its parent's sibling list and preserves server ordering. */
export function appendNode(cache: LocationTreeCache, node: LocationTreeNode): LocationTreeCache {
  if (findNode(cache, node.id) !== null) return cloneCache(cache);
  if (node.parentId === null) return cloneCache(cache, ordered([...cache.data, node]));

  const change = appendUnder(cache.data, node.parentId, node);
  return cloneCache(cache, change.changed ? change.nodes : cache.data);
}

function renameInTree(nodes: readonly LocationTreeNode[], id: string, name: string): TreeChange {
  let changed = false;
  const next = nodes.map((node) => {
    if (node.id === id) {
      changed = true;
      return { ...node, name };
    }

    const childChange = renameInTree(node.children, id, name);
    if (!childChange.changed) return node;
    changed = true;
    return { ...node, children: childChange.nodes };
  });
  return { nodes: changed ? next : [...nodes], changed };
}

/** Renames one node without changing any other cached tree entry. */
export function renameNode(cache: LocationTreeCache, id: string, name: string): LocationTreeCache {
  const change = renameInTree(cache.data, id, name);
  return cloneCache(cache, change.changed ? change.nodes : cache.data);
}

interface DetachResult {
  readonly node: LocationTreeNode | null;
  readonly nodes: LocationTreeNode[];
}

function detachNode(nodes: readonly LocationTreeNode[], id: string): DetachResult {
  let detached: LocationTreeNode | null = null;
  let changed = false;
  const next: LocationTreeNode[] = [];

  for (const node of nodes) {
    if (detached === null && node.id === id) {
      detached = node;
      changed = true;
      continue;
    }

    const childResult = detachNode(node.children, id);
    if (childResult.node === null) {
      next.push(node);
      continue;
    }

    detached = childResult.node;
    changed = true;
    next.push({ ...node, children: childResult.nodes });
  }

  return { node: detached, nodes: changed ? next : [...nodes] };
}

function insertUnder(
  nodes: readonly LocationTreeNode[],
  parentId: string,
  child: LocationTreeNode
): TreeChange {
  let changed = false;
  const next = nodes.map((node) => {
    if (node.id === parentId) {
      changed = true;
      return { ...node, children: ordered([...node.children, child]) };
    }

    const childChange = insertUnder(node.children, parentId, child);
    if (!childChange.changed) return node;
    changed = true;
    return { ...node, children: childChange.nodes };
  });
  return { nodes: changed ? next : [...nodes], changed };
}

/** Moves one node and its subtree, ordering the destination siblings. */
export function placeNode(
  cache: LocationTreeCache,
  id: string,
  parentId: string | null,
  sortOrder: number
): LocationTreeCache {
  const found = findNode(cache, id);
  if (found === null || parentId === id) return cloneCache(cache);

  const detached = detachNode(cache.data, id);
  if (detached.node === null) return cloneCache(cache);

  const moved = { ...detached.node, parentId, sortOrder };
  if (parentId === null) return cloneCache(cache, ordered([...detached.nodes, moved]));

  const change = insertUnder(detached.nodes, parentId, moved);
  return cloneCache(cache, change.changed ? change.nodes : cache.data);
}

function removeFromTree(
  nodes: readonly LocationTreeNode[],
  id: string,
  mode: 'reparent' | 'subtree'
): TreeChange {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node === undefined) continue;

    if (node.id === id) {
      const replacement =
        mode === 'reparent'
          ? node.children.map((child) => ({ ...child, parentId: node.parentId }))
          : [];
      return {
        nodes: ordered([...nodes.slice(0, index), ...replacement, ...nodes.slice(index + 1)]),
        changed: true,
      };
    }

    const childChange = removeFromTree(node.children, id, mode);
    if (!childChange.changed) continue;
    return {
      nodes: [
        ...nodes.slice(0, index),
        { ...node, children: childChange.nodes },
        ...nodes.slice(index + 1),
      ],
      changed: true,
    };
  }

  return { nodes: [...nodes], changed: false };
}

/** Removes a node, either promoting its children or dropping its whole subtree. */
export function removeNode(
  cache: LocationTreeCache,
  id: string,
  mode: 'reparent' | 'subtree'
): LocationTreeCache {
  const change = removeFromTree(cache.data, id, mode);
  return cloneCache(cache, change.changed ? change.nodes : cache.data);
}
