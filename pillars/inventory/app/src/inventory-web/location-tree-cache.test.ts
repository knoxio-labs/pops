import { describe, expect, it } from 'vitest';

import {
  appendNode,
  findNode,
  nextSortOrder,
  placeNode,
  removeNode,
  renameNode,
  type LocationTreeCache,
} from './location-tree-cache';

import type { LocationTreeNode } from '../inventory-api/types.gen.js';

function node(
  id: string,
  parentId: string | null,
  sortOrder: number,
  children: LocationTreeNode[] = []
): LocationTreeNode {
  return { id, name: id, parentId, sortOrder, children };
}

function cache(data: LocationTreeNode[]): LocationTreeCache {
  return { data };
}

describe('location tree cache', () => {
  it('nextSortOrder is one above the largest sibling sortOrder and 0 with no siblings or no cache', () => {
    const current = cache([
      node('root-a', null, 0),
      node('root-b', null, 4),
      node('parent', null, 5, [node('child', 'parent', 2)]),
    ]);

    expect(nextSortOrder(current, null)).toBe(6);
    expect(nextSortOrder(current, 'parent')).toBe(3);
    expect(nextSortOrder(current, 'empty')).toBe(0);
    expect(nextSortOrder(undefined, null)).toBe(0);
  });

  it('appendNode inserts the node by sortOrder then name under its parent or at the top level', () => {
    const current = cache([
      node('parent', null, 0, [node('zebra', 'parent', 1), node('attic', 'parent', 0)]),
      node('top-z', null, 1),
      node('top-a', null, 0),
    ]);
    const child = node('bench', 'parent', 0);
    const root = node('top-b', null, 0);

    const withChild = appendNode(current, child);
    const withRoot = appendNode(withChild, root);

    expect(withChild.data[0]?.children.map(({ id }) => id)).toEqual(['attic', 'bench', 'zebra']);
    expect(withRoot.data.map(({ id }) => id)).toEqual(['parent', 'top-a', 'top-b', 'top-z']);
    expect(current.data[0]?.children.map(({ id }) => id)).toEqual(['zebra', 'attic']);
  });

  it('renameNode renames one node and leaves the rest', () => {
    const current = cache([node('root', null, 0, [node('child', 'root', 0)])]);
    const renamed = renameNode(current, 'child', 'Renamed');

    expect(renamed.data[0]?.children[0]).toMatchObject({ id: 'child', name: 'Renamed' });
    expect(renamed.data[0]?.name).toBe('root');
    expect(current.data[0]?.children[0]?.name).toBe('child');
  });

  it('placeNode moves a node with its subtree and orders siblings by sortOrder then name', () => {
    const current = cache([
      node('source', null, 0, [node('moving', 'source', 0, [node('nested', 'moving', 0)])]),
      node('target', null, 1, [node('existing', 'target', 0)]),
    ]);
    const placed = placeNode(current, 'moving', 'target', 1);

    expect(placed.data[0]?.children).toHaveLength(0);
    expect(placed.data[1]?.children.map(({ id }) => id)).toEqual(['existing', 'moving']);
    expect(findNode(placed, 'moving')).toMatchObject({ parentId: 'target' });
    expect(findNode(placed, 'nested')).toMatchObject({ parentId: 'moving' });
    expect(findNode(current, 'moving')).toMatchObject({ parentId: 'source' });
  });

  it("removeNode reparent moves the children into the removed node's parent", () => {
    const current = cache([
      node('house', null, 0, [
        node('garage', 'house', 0, [node('shelf', 'garage', 3), node('bench', 'garage', 1)]),
        node('office', 'house', 1),
      ]),
    ]);
    const removed = removeNode(current, 'garage', 'reparent');

    expect(removed.data[0]?.children.map(({ id }) => id)).toEqual(['bench', 'office', 'shelf']);
    expect(removed.data[0]?.children).toMatchObject([
      { id: 'bench', parentId: 'house' },
      { id: 'office', parentId: 'house' },
      { id: 'shelf', parentId: 'house' },
    ]);
    expect(findNode(removed, 'garage')).toBeNull();
    expect(findNode(current, 'garage')).not.toBeNull();
  });

  it('removeNode subtree drops the node and every descendant', () => {
    const current = cache([
      node('root', null, 0, [
        node('drop', 'root', 0, [node('nested', 'drop', 0)]),
        node('keep', 'root', 1),
      ]),
    ]);
    const removed = removeNode(current, 'drop', 'subtree');

    expect(removed.data[0]?.children.map(({ id }) => id)).toEqual(['keep']);
    expect(findNode(removed, 'nested')).toBeNull();
  });
});
