import { randomUUID } from 'node:crypto';

/**
 * Invariant tests for the connections service against an in-memory SQLite
 * brought up by the real migration journal. Pure DB + service layer.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { connectionsService } from '../index.js';
import { fixtures, itemFixtureConnections } from '../schema.js';
import {
  ConnectionConflictError,
  ConnectionItemNotFoundError,
  ConnectionNotFoundError,
  SelfConnectionError,
} from '../services/connections-errors.js';
import { seedInventoryItem } from './item-fixture.js';
import { openMigratedTestDb } from './migrated-db.js';

import type { TraceNode } from '../services/connections-types.js';
import type { InventoryDb } from '../services/internal.js';

function freshDb(): InventoryDb {
  return openMigratedTestDb().db;
}

/** Seed two items and return their IDs in sorted (A<B) order. */
function seedPair(db: InventoryDb, nameA = 'Item A', nameB = 'Item B'): [string, string] {
  const a = seedInventoryItem(db, { name: nameA });
  const b = seedInventoryItem(db, { name: nameB });
  return [a.id, b.id].toSorted() as [string, string];
}

function seedFixture(db: InventoryDb, name = 'Wall outlet', type = 'power'): string {
  const id = randomUUID();
  db.insert(fixtures).values({ id, name, type, lastEditedTime: new Date().toISOString() }).run();
  return id;
}

function wireFixture(db: InventoryDb, itemId: string, fixtureId: string): void {
  db.insert(itemFixtureConnections).values({ itemId, fixtureId }).run();
}

describe('connectionsService.create', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('connects two items and returns the row with A<B ordering', () => {
    const [idA, idB] = seedPair(db);
    const row = connectionsService.create(db, { itemAId: idA, itemBId: idB });
    expect(row.itemAId).toBe(idA);
    expect(row.itemBId).toBe(idB);
    expect(typeof row.id).toBe('number');
    expect(row.createdAt).toBeTruthy();
  });

  it('normalises caller-provided reverse ordering to A<B', () => {
    const [idA, idB] = seedPair(db);
    const row = connectionsService.create(db, { itemAId: idB, itemBId: idA });
    expect(row.itemAId).toBe(idA);
    expect(row.itemBId).toBe(idB);
  });

  it('rejects connecting an item to itself with SelfConnectionError', () => {
    const item = seedInventoryItem(db, { name: 'Solo' });
    expect(() =>
      connectionsService.create(db, { itemAId: item.id, itemBId: item.id })
    ).toThrowError(SelfConnectionError);
  });

  it('rejects duplicate pairs with ConnectionConflictError', () => {
    const [idA, idB] = seedPair(db);
    connectionsService.create(db, { itemAId: idA, itemBId: idB });
    expect(() => connectionsService.create(db, { itemAId: idA, itemBId: idB })).toThrowError(
      ConnectionConflictError
    );
  });

  it('rejects duplicate pairs in reverse order (same canonical pair)', () => {
    const [idA, idB] = seedPair(db);
    connectionsService.create(db, { itemAId: idA, itemBId: idB });
    expect(() => connectionsService.create(db, { itemAId: idB, itemBId: idA })).toThrowError(
      ConnectionConflictError
    );
  });

  it('throws ConnectionItemNotFoundError when itemA is missing', () => {
    const b = seedInventoryItem(db, { name: 'B' });
    expect(() => connectionsService.create(db, { itemAId: 'nope', itemBId: b.id })).toThrowError(
      ConnectionItemNotFoundError
    );
  });

  it('throws ConnectionItemNotFoundError when itemB is missing', () => {
    const a = seedInventoryItem(db, { name: 'A' });
    expect(() => connectionsService.create(db, { itemAId: a.id, itemBId: 'nope' })).toThrowError(
      ConnectionItemNotFoundError
    );
  });
});

describe('connectionsService.get', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns the row for an existing pair (normalised)', () => {
    const [idA, idB] = seedPair(db);
    connectionsService.create(db, { itemAId: idA, itemBId: idB });
    const row = connectionsService.get(db, idB, idA);
    expect(row.itemAId).toBe(idA);
    expect(row.itemBId).toBe(idB);
  });

  it('throws ConnectionNotFoundError when no row matches', () => {
    const [idA, idB] = seedPair(db);
    expect(() => connectionsService.get(db, idA, idB)).toThrowError(ConnectionNotFoundError);
  });
});

describe('connectionsService.list', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns empty rows + zero total when the item has no connections', () => {
    const item = seedInventoryItem(db, { name: 'Lonely' });
    const result = connectionsService.list(db, item.id, 50, 0);
    expect(result).toEqual({ rows: [], total: 0 });
  });

  it('returns rows where the item appears in column A', () => {
    const [idA, idB] = seedPair(db, 'AAA', 'ZZZ');
    connectionsService.create(db, { itemAId: idA, itemBId: idB });
    const result = connectionsService.list(db, idA, 50, 0);
    expect(result.total).toBe(1);
    expect(result.rows[0]!.itemAId).toBe(idA);
    expect(result.rows[0]!.itemBId).toBe(idB);
  });

  it('returns rows where the item appears in column B', () => {
    const [idA, idB] = seedPair(db, 'AAA', 'ZZZ');
    connectionsService.create(db, { itemAId: idA, itemBId: idB });
    const result = connectionsService.list(db, idB, 50, 0);
    expect(result.total).toBe(1);
    expect(result.rows[0]!.itemAId).toBe(idA);
    expect(result.rows[0]!.itemBId).toBe(idB);
  });

  it('paginates rows but reports the full total for the filter', () => {
    const hub = seedInventoryItem(db, { name: 'Hub' });
    for (let i = 0; i < 3; i++) {
      const peer = seedInventoryItem(db, { name: `Peer ${i}` });
      connectionsService.create(db, { itemAId: hub.id, itemBId: peer.id });
    }

    const page1 = connectionsService.list(db, hub.id, 2, 0);
    expect(page1.rows).toHaveLength(2);
    expect(page1.total).toBe(3);

    const page2 = connectionsService.list(db, hub.id, 2, 2);
    expect(page2.rows).toHaveLength(1);
    expect(page2.total).toBe(3);
  });
});

describe('connectionsService.delete', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('removes an existing connection by ordered pair', () => {
    const [idA, idB] = seedPair(db);
    connectionsService.create(db, { itemAId: idA, itemBId: idB });
    connectionsService.delete(db, idA, idB);
    expect(() => connectionsService.get(db, idA, idB)).toThrowError(ConnectionNotFoundError);
  });

  it('normalises reverse ordering before deleting', () => {
    const [idA, idB] = seedPair(db);
    connectionsService.create(db, { itemAId: idA, itemBId: idB });
    connectionsService.delete(db, idB, idA);
    expect(connectionsService.list(db, idA, 50, 0).total).toBe(0);
  });

  it('throws ConnectionNotFoundError when no row matches', () => {
    const [idA, idB] = seedPair(db);
    expect(() => connectionsService.delete(db, idA, idB)).toThrowError(ConnectionNotFoundError);
  });

  it('leaves unrelated connections untouched', () => {
    const a = seedInventoryItem(db, { name: 'A' });
    const b = seedInventoryItem(db, { name: 'B' });
    const c = seedInventoryItem(db, { name: 'C' });

    const pairAB = [a.id, b.id].toSorted() as [string, string];
    const pairAC = [a.id, c.id].toSorted() as [string, string];
    connectionsService.create(db, { itemAId: pairAB[0], itemBId: pairAB[1] });
    connectionsService.create(db, { itemAId: pairAC[0], itemBId: pairAC[1] });

    connectionsService.delete(db, pairAB[0], pairAB[1]);

    expect(connectionsService.get(db, pairAC[0], pairAC[1]).itemAId).toBe(pairAC[0]);
  });
});

describe('connectionsService.trace', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns root with no children when the item has no connections', () => {
    const item = seedInventoryItem(db, { name: 'Lonely' });
    const tree = connectionsService.trace(db, item.id, 10);
    expect(tree.id).toBe(item.id);
    expect(tree.itemName).toBe('Lonely');
    expect(tree.children).toEqual([]);
  });

  it('returns immediate neighbours as direct children', () => {
    const hub = seedInventoryItem(db, { name: 'Hub' });
    const peer1 = seedInventoryItem(db, { name: 'Peer 1' });
    const peer2 = seedInventoryItem(db, { name: 'Peer 2' });
    connectionsService.create(db, { itemAId: hub.id, itemBId: peer1.id });
    connectionsService.create(db, { itemAId: hub.id, itemBId: peer2.id });

    const tree = connectionsService.trace(db, hub.id, 10);
    expect(tree.children).toHaveLength(2);
    expect(tree.children.map((c) => c.id).toSorted()).toEqual([peer1.id, peer2.id].toSorted());
  });

  it('traverses multi-hop chains recursively', () => {
    const a = seedInventoryItem(db, { name: 'A' });
    const b = seedInventoryItem(db, { name: 'B' });
    const c = seedInventoryItem(db, { name: 'C' });
    const d = seedInventoryItem(db, { name: 'D' });

    const pairs = [
      [a.id, b.id],
      [b.id, c.id],
      [c.id, d.id],
    ];
    for (const [x, y] of pairs) {
      const sorted = [x!, y!].toSorted() as [string, string];
      connectionsService.create(db, { itemAId: sorted[0], itemBId: sorted[1] });
    }

    const tree = connectionsService.trace(db, a.id, 10);
    expect(tree.children).toHaveLength(1);
    const nodeB = tree.children[0]!;
    expect(nodeB.id).toBe(b.id);
    const nodeC = nodeB.children[0]!;
    expect(nodeC.id).toBe(c.id);
    const nodeD = nodeC.children[0]!;
    expect(nodeD.id).toBe(d.id);
    expect(nodeD.children).toEqual([]);
  });

  it('caps depth at maxDepth', () => {
    const a = seedInventoryItem(db, { name: 'A' });
    const b = seedInventoryItem(db, { name: 'B' });
    const c = seedInventoryItem(db, { name: 'C' });

    const pairAB = [a.id, b.id].toSorted() as [string, string];
    const pairBC = [b.id, c.id].toSorted() as [string, string];
    connectionsService.create(db, { itemAId: pairAB[0], itemBId: pairAB[1] });
    connectionsService.create(db, { itemAId: pairBC[0], itemBId: pairBC[1] });

    const tree = connectionsService.trace(db, a.id, 1);
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0]!.id).toBe(b.id);
    expect(tree.children[0]!.children).toEqual([]);
  });

  it('breaks cycles in a triangle so each node appears at most once', () => {
    const a = seedInventoryItem(db, { name: 'A' });
    const b = seedInventoryItem(db, { name: 'B' });
    const c = seedInventoryItem(db, { name: 'C' });

    for (const [x, y] of [
      [a.id, b.id],
      [a.id, c.id],
      [b.id, c.id],
    ]) {
      const sorted = [x!, y!].toSorted() as [string, string];
      connectionsService.create(db, { itemAId: sorted[0], itemBId: sorted[1] });
    }

    const tree = connectionsService.trace(db, a.id, 10);

    function countNodes(node: TraceNode): number {
      return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
    }
    expect(countNodes(tree)).toBe(3);
  });

  it('trace ends at a fixture leaf flagged isFixture', () => {
    const item = seedInventoryItem(db, { name: 'Television' });
    const fixtureId = seedFixture(db);
    wireFixture(db, item.id, fixtureId);

    const tree = connectionsService.trace(db, item.id, 10);

    expect(tree).not.toHaveProperty('isFixture');
    expect(tree.children).toEqual([
      {
        id: fixtureId,
        itemName: 'Wall outlet',
        assetId: null,
        type: 'power',
        isFixture: true,
        children: [],
      },
    ]);
  });

  it('includes fixtures on the item at maxDepth', () => {
    const root = seedInventoryItem(db, { name: 'Television' });
    const child = seedInventoryItem(db, { name: 'Stand' });
    const fixtureId = seedFixture(db);
    connectionsService.create(db, { itemAId: root.id, itemBId: child.id });
    wireFixture(db, child.id, fixtureId);

    const tree = connectionsService.trace(db, root.id, 1);

    expect(tree.children[0]?.children).toEqual([
      expect.objectContaining({ id: fixtureId, isFixture: true, children: [] }),
    ]);
  });

  it('throws ConnectionItemNotFoundError when the root is missing', () => {
    expect(() => connectionsService.trace(db, 'nope', 10)).toThrowError(
      ConnectionItemNotFoundError
    );
  });
});

describe('connectionsService.graph', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns a single-node subgraph when the item has no connections', () => {
    const item = seedInventoryItem(db, { name: 'Lonely' });
    const result = connectionsService.graph(db, item.id, 10);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]!.id).toBe(item.id);
    expect(result.edges).toEqual([]);
  });

  it('includes cross-links between visited nodes (triangle)', () => {
    const a = seedInventoryItem(db, { name: 'A' });
    const b = seedInventoryItem(db, { name: 'B' });
    const c = seedInventoryItem(db, { name: 'C' });

    for (const [x, y] of [
      [a.id, b.id],
      [a.id, c.id],
      [b.id, c.id],
    ]) {
      const sorted = [x!, y!].toSorted() as [string, string];
      connectionsService.create(db, { itemAId: sorted[0], itemBId: sorted[1] });
    }

    const result = connectionsService.graph(db, a.id, 10);
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(3);
  });

  it('respects maxDepth', () => {
    const a = seedInventoryItem(db, { name: 'A' });
    const b = seedInventoryItem(db, { name: 'B' });
    const c = seedInventoryItem(db, { name: 'C' });

    const pairAB = [a.id, b.id].toSorted() as [string, string];
    const pairBC = [b.id, c.id].toSorted() as [string, string];
    connectionsService.create(db, { itemAId: pairAB[0], itemBId: pairAB[1] });
    connectionsService.create(db, { itemAId: pairBC[0], itemBId: pairBC[1] });

    const result = connectionsService.graph(db, a.id, 1);
    expect(result.nodes.map((n) => n.id).toSorted()).toEqual([a.id, b.id].toSorted());
  });

  it('emits edges in canonical A<B (source<target) ordering', () => {
    const [idA, idB] = seedPair(db);
    connectionsService.create(db, { itemAId: idA, itemBId: idB });

    const result = connectionsService.graph(db, idA, 10);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]!.source).toBe(idA);
    expect(result.edges[0]!.target).toBe(idB);
  });

  it('includes node metadata (itemName, assetId, type)', () => {
    const item = seedInventoryItem(db, {
      name: 'MacBook Pro',
      code: 'ASSET-001',
      legacyType: 'electronics',
    });

    const result = connectionsService.graph(db, item.id, 10);
    expect(result.nodes[0]).toMatchObject({
      id: item.id,
      itemName: 'MacBook Pro',
      assetId: 'ASSET-001',
      type: 'electronics',
    });
    expect(result.nodes[0]).not.toHaveProperty('isFixture');
  });

  it('graph adds fixture nodes and item-to-fixture edges without walking through them', () => {
    const item = seedInventoryItem(db, { name: 'Television' });
    const otherItem = seedInventoryItem(db, { name: 'Console' });
    const fixtureId = seedFixture(db);
    wireFixture(db, item.id, fixtureId);
    wireFixture(db, otherItem.id, fixtureId);

    const result = connectionsService.graph(db, item.id, 10);

    expect(result.nodes.map((node) => node.id)).toEqual([item.id, fixtureId]);
    expect(result.nodes[0]).not.toHaveProperty('isFixture');
    expect(result.nodes[1]).toMatchObject({
      id: fixtureId,
      itemName: 'Wall outlet',
      assetId: null,
      type: 'power',
      isFixture: true,
    });
    expect(result.edges).toEqual([{ source: item.id, target: fixtureId }]);
  });

  it('a fixture shared by two items appears once', () => {
    const itemA = seedInventoryItem(db, { name: 'Television' });
    const itemB = seedInventoryItem(db, { name: 'Console' });
    const fixtureId = seedFixture(db);
    connectionsService.create(db, { itemAId: itemA.id, itemBId: itemB.id });
    wireFixture(db, itemA.id, fixtureId);
    wireFixture(db, itemB.id, fixtureId);

    const result = connectionsService.graph(db, itemA.id, 10);

    expect(result.nodes.filter((node) => node.isFixture)).toHaveLength(1);
    expect(result.edges.filter((edge) => edge.target === fixtureId)).toEqual([
      { source: itemA.id, target: fixtureId },
      { source: itemB.id, target: fixtureId },
    ]);
  });

  it('throws ConnectionItemNotFoundError when the root is missing', () => {
    expect(() => connectionsService.graph(db, 'nope', 10)).toThrowError(
      ConnectionItemNotFoundError
    );
  });
});

describe('connectionsService.toConnection', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('maps a row to the public API shape', () => {
    const [idA, idB] = seedPair(db);
    const row = connectionsService.create(db, { itemAId: idA, itemBId: idB });
    const dto = connectionsService.toConnection(row);
    expect(dto).toEqual({
      id: row.id,
      itemAId: idA,
      itemBId: idB,
      createdAt: row.createdAt,
    });
  });
});
