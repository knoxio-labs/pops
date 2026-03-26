/**
 * Item connections router tests.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database } from "better-sqlite3";
import { TRPCError } from "@trpc/server";
import {
  setupTestContext,
  createCaller,
  seedInventoryItem,
  seedItemConnection,
} from "../../../shared/test-utils.js";

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;
let db: Database;

beforeEach(() => {
  ({ caller, db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

/** Seed two items and return their IDs (sorted for A<B). */
function seedTwoItems(nameA = "Item A", nameB = "Item B") {
  const idA = seedInventoryItem(db, { item_name: nameA });
  const idB = seedInventoryItem(db, { item_name: nameB });
  return [idA, idB].sort() as [string, string];
}

describe("inventory.connections.connect", () => {
  it("connects two items and returns the connection", async () => {
    const [idA, idB] = seedTwoItems();

    const result = await caller.inventory.connections.connect({
      itemAId: idA,
      itemBId: idB,
    });

    expect(result.data).toMatchObject({
      itemAId: idA,
      itemBId: idB,
    });
    expect(result.data.id).toBeTypeOf("number");
    expect(result.data.createdAt).toBeTypeOf("string");
    expect(result.message).toBe("Items connected");
  });

  it("auto-orders A<B when inputs are reversed", async () => {
    const [idA, idB] = seedTwoItems();

    // Pass in reverse order (B first, A second)
    const result = await caller.inventory.connections.connect({
      itemAId: idB,
      itemBId: idA,
    });

    // Should be stored with A<B ordering
    expect(result.data.itemAId).toBe(idA);
    expect(result.data.itemBId).toBe(idB);
  });

  it("throws CONFLICT when connecting same pair twice", async () => {
    const [idA, idB] = seedTwoItems();

    await caller.inventory.connections.connect({ itemAId: idA, itemBId: idB });

    await expect(
      caller.inventory.connections.connect({ itemAId: idA, itemBId: idB })
    ).rejects.toThrow(TRPCError);

    try {
      await caller.inventory.connections.connect({ itemAId: idA, itemBId: idB });
    } catch (err) {
      expect((err as TRPCError).code).toBe("CONFLICT");
    }
  });

  it("throws CONFLICT when connecting same pair in reverse order", async () => {
    const [idA, idB] = seedTwoItems();

    await caller.inventory.connections.connect({ itemAId: idA, itemBId: idB });

    await expect(
      caller.inventory.connections.connect({ itemAId: idB, itemBId: idA })
    ).rejects.toThrow(TRPCError);
  });

  it("throws CONFLICT when connecting an item to itself", async () => {
    const id = seedInventoryItem(db, { item_name: "Solo Item" });

    await expect(
      caller.inventory.connections.connect({ itemAId: id, itemBId: id })
    ).rejects.toThrow(TRPCError);

    try {
      await caller.inventory.connections.connect({ itemAId: id, itemBId: id });
    } catch (err) {
      expect((err as TRPCError).code).toBe("CONFLICT");
    }
  });

  it("throws NOT_FOUND when item A does not exist", async () => {
    const idB = seedInventoryItem(db, { item_name: "Real Item" });

    await expect(
      caller.inventory.connections.connect({ itemAId: "nonexistent", itemBId: idB })
    ).rejects.toThrow(TRPCError);

    try {
      await caller.inventory.connections.connect({ itemAId: "nonexistent", itemBId: idB });
    } catch (err) {
      expect((err as TRPCError).code).toBe("NOT_FOUND");
    }
  });

  it("throws NOT_FOUND when item B does not exist", async () => {
    const idA = seedInventoryItem(db, { item_name: "Real Item" });

    await expect(
      caller.inventory.connections.connect({ itemAId: idA, itemBId: "nonexistent" })
    ).rejects.toThrow(TRPCError);

    try {
      await caller.inventory.connections.connect({ itemAId: idA, itemBId: "nonexistent" });
    } catch (err) {
      expect((err as TRPCError).code).toBe("NOT_FOUND");
    }
  });

  it("persists to the database", async () => {
    const [idA, idB] = seedTwoItems();

    await caller.inventory.connections.connect({ itemAId: idA, itemBId: idB });

    const row = db
      .prepare("SELECT * FROM item_connections WHERE item_a_id = ? AND item_b_id = ?")
      .get(idA, idB) as { item_a_id: string; item_b_id: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.item_a_id).toBe(idA);
    expect(row!.item_b_id).toBe(idB);
  });
});

describe("inventory.connections.disconnect", () => {
  it("removes an existing connection", async () => {
    const [idA, idB] = seedTwoItems();
    const connId = seedItemConnection(db, idA, idB);

    const result = await caller.inventory.connections.disconnect({ id: connId });

    expect(result.message).toBe("Items disconnected");

    const row = db.prepare("SELECT * FROM item_connections WHERE id = ?").get(connId);
    expect(row).toBeUndefined();
  });

  it("throws NOT_FOUND for nonexistent connection", async () => {
    await expect(caller.inventory.connections.disconnect({ id: 999 })).rejects.toThrow(TRPCError);

    try {
      await caller.inventory.connections.disconnect({ id: 999 });
    } catch (err) {
      expect((err as TRPCError).code).toBe("NOT_FOUND");
    }
  });
});

describe("inventory.connections.disconnectByItems", () => {
  it("disconnects two items by their IDs", async () => {
    const [idA, idB] = seedTwoItems();
    seedItemConnection(db, idA, idB);

    const result = await caller.inventory.connections.disconnectByItems({
      itemAId: idA,
      itemBId: idB,
    });

    expect(result.message).toBe("Items disconnected");

    const row = db
      .prepare("SELECT * FROM item_connections WHERE item_a_id = ? AND item_b_id = ?")
      .get(idA, idB);
    expect(row).toBeUndefined();
  });

  it("normalises A<B ordering when IDs are reversed", async () => {
    const [idA, idB] = seedTwoItems("AAA", "ZZZ");
    seedItemConnection(db, idA, idB);

    // Pass in reverse order — should still find and delete the connection
    const result = await caller.inventory.connections.disconnectByItems({
      itemAId: idB,
      itemBId: idA,
    });

    expect(result.message).toBe("Items disconnected");

    const row = db
      .prepare("SELECT * FROM item_connections WHERE item_a_id = ? AND item_b_id = ?")
      .get(idA, idB);
    expect(row).toBeUndefined();
  });

  it("throws NOT_FOUND when connection does not exist", async () => {
    const [idA, idB] = seedTwoItems();

    await expect(
      caller.inventory.connections.disconnectByItems({ itemAId: idA, itemBId: idB })
    ).rejects.toThrow(TRPCError);

    try {
      await caller.inventory.connections.disconnectByItems({ itemAId: idA, itemBId: idB });
    } catch (err) {
      expect((err as TRPCError).code).toBe("NOT_FOUND");
    }
  });
});

describe("inventory.connections.listForItem", () => {
  it("returns empty list when no connections exist", async () => {
    const id = seedInventoryItem(db, { item_name: "Lonely Item" });

    const result = await caller.inventory.connections.listForItem({ itemId: id });

    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  it("returns connections where item is in A column", async () => {
    const [idA, idB] = seedTwoItems("AAA", "ZZZ");
    seedItemConnection(db, idA, idB);

    const result = await caller.inventory.connections.listForItem({ itemId: idA });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.itemAId).toBe(idA);
    expect(result.data[0]!.itemBId).toBe(idB);
  });

  it("returns connections where item is in B column", async () => {
    const [idA, idB] = seedTwoItems("AAA", "ZZZ");
    seedItemConnection(db, idA, idB);

    const result = await caller.inventory.connections.listForItem({ itemId: idB });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.itemAId).toBe(idA);
    expect(result.data[0]!.itemBId).toBe(idB);
  });

  it("returns multiple connections for an item", async () => {
    const idA = seedInventoryItem(db, { item_name: "Hub" });
    const idB = seedInventoryItem(db, { item_name: "Device 1" });
    const idC = seedInventoryItem(db, { item_name: "Device 2" });

    // Manually sort pairs for A<B
    const pairAB = [idA, idB].sort() as [string, string];
    const pairAC = [idA, idC].sort() as [string, string];

    seedItemConnection(db, pairAB[0], pairAB[1]);
    seedItemConnection(db, pairAC[0], pairAC[1]);

    const result = await caller.inventory.connections.listForItem({ itemId: idA });

    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
  });

  it("paginates results", async () => {
    const idA = seedInventoryItem(db, { item_name: "Hub" });
    const items: string[] = [];

    for (let i = 0; i < 3; i++) {
      items.push(seedInventoryItem(db, { item_name: `Device ${i}` }));
    }

    for (const idB of items) {
      const pair = [idA, idB].sort() as [string, string];
      seedItemConnection(db, pair[0], pair[1]);
    }

    const page1 = await caller.inventory.connections.listForItem({
      itemId: idA,
      limit: 2,
      offset: 0,
    });

    expect(page1.data).toHaveLength(2);
    expect(page1.pagination.total).toBe(3);
    expect(page1.pagination.hasMore).toBe(true);

    const page2 = await caller.inventory.connections.listForItem({
      itemId: idA,
      limit: 2,
      offset: 2,
    });

    expect(page2.data).toHaveLength(1);
    expect(page2.pagination.hasMore).toBe(false);
  });
});

describe("inventory.connections.graph", () => {
  it("returns nodes and edges for a connected graph", async () => {
    const idA = seedInventoryItem(db, { item_name: "Hub" });
    const idB = seedInventoryItem(db, { item_name: "Device 1" });
    const idC = seedInventoryItem(db, { item_name: "Device 2" });

    const pairAB = [idA, idB].sort() as [string, string];
    const pairAC = [idA, idC].sort() as [string, string];
    seedItemConnection(db, pairAB[0], pairAB[1]);
    seedItemConnection(db, pairAC[0], pairAC[1]);

    const result = await caller.inventory.connections.graph({ itemId: idA });

    expect(result.data.nodes).toHaveLength(3);
    expect(result.data.edges).toHaveLength(2);

    const nodeIds = result.data.nodes.map((n: { id: string }) => n.id).sort();
    expect(nodeIds).toEqual([idA, idB, idC].sort());
  });

  it("returns single node with no edges when item has no connections", async () => {
    const id = seedInventoryItem(db, { item_name: "Lonely Item" });

    const result = await caller.inventory.connections.graph({ itemId: id });

    expect(result.data.nodes).toHaveLength(1);
    expect(result.data.nodes[0]!.id).toBe(id);
    expect(result.data.edges).toHaveLength(0);
  });

  it("throws NOT_FOUND for nonexistent item", async () => {
    await expect(caller.inventory.connections.graph({ itemId: "nonexistent" })).rejects.toThrow(
      TRPCError
    );

    try {
      await caller.inventory.connections.graph({ itemId: "nonexistent" });
    } catch (err) {
      expect((err as TRPCError).code).toBe("NOT_FOUND");
    }
  });

  it("respects maxDepth parameter", async () => {
    // Chain: A -- B -- C -- D
    const idA = seedInventoryItem(db, { item_name: "A" });
    const idB = seedInventoryItem(db, { item_name: "B" });
    const idC = seedInventoryItem(db, { item_name: "C" });
    const idD = seedInventoryItem(db, { item_name: "D" });

    const pairAB = [idA, idB].sort() as [string, string];
    const pairBC = [idB, idC].sort() as [string, string];
    const pairCD = [idC, idD].sort() as [string, string];
    seedItemConnection(db, pairAB[0], pairAB[1]);
    seedItemConnection(db, pairBC[0], pairBC[1]);
    seedItemConnection(db, pairCD[0], pairCD[1]);

    // maxDepth=1 from A should only reach B
    const result = await caller.inventory.connections.graph({ itemId: idA, maxDepth: 1 });

    expect(result.data.nodes).toHaveLength(2);
    const nodeIds = result.data.nodes.map((n: { id: string }) => n.id).sort();
    expect(nodeIds).toEqual([idA, idB].sort());
  });

  it("includes cross-links between visited nodes", async () => {
    // Triangle: A -- B, A -- C, B -- C
    const idA = seedInventoryItem(db, { item_name: "A" });
    const idB = seedInventoryItem(db, { item_name: "B" });
    const idC = seedInventoryItem(db, { item_name: "C" });

    const pairAB = [idA, idB].sort() as [string, string];
    const pairAC = [idA, idC].sort() as [string, string];
    const pairBC = [idB, idC].sort() as [string, string];
    seedItemConnection(db, pairAB[0], pairAB[1]);
    seedItemConnection(db, pairAC[0], pairAC[1]);
    seedItemConnection(db, pairBC[0], pairBC[1]);

    const result = await caller.inventory.connections.graph({ itemId: idA });

    expect(result.data.nodes).toHaveLength(3);
    // All 3 edges should be present (cross-link B--C included)
    expect(result.data.edges).toHaveLength(3);
  });

  it("returns node metadata (itemName, assetId, type)", async () => {
    const id = seedInventoryItem(db, {
      item_name: "MacBook Pro",
      asset_id: "ASSET-001",
      type: "electronics",
    });

    const result = await caller.inventory.connections.graph({ itemId: id });

    expect(result.data.nodes[0]).toMatchObject({
      id,
      itemName: "MacBook Pro",
      assetId: "ASSET-001",
      type: "electronics",
    });
  });
});

describe("inventory.connections.trace", () => {
  it("returns a tree rooted at the starting item", async () => {
    const idA = seedInventoryItem(db, { item_name: "Hub" });
    const idB = seedInventoryItem(db, { item_name: "Device 1" });
    const idC = seedInventoryItem(db, { item_name: "Device 2" });

    const pairAB = [idA, idB].sort() as [string, string];
    const pairAC = [idA, idC].sort() as [string, string];
    seedItemConnection(db, pairAB[0], pairAB[1]);
    seedItemConnection(db, pairAC[0], pairAC[1]);

    const result = await caller.inventory.connections.trace({ itemId: idA });

    expect(result.data.id).toBe(idA);
    expect(result.data.itemName).toBe("Hub");
    expect(result.data.children).toHaveLength(2);

    const childNames = result.data.children.map((c: { itemName: string }) => c.itemName).sort();
    expect(childNames).toEqual(["Device 1", "Device 2"]);
  });

  it("traverses a chain recursively (A--B--C--D)", async () => {
    const idA = seedInventoryItem(db, { item_name: "A" });
    const idB = seedInventoryItem(db, { item_name: "B" });
    const idC = seedInventoryItem(db, { item_name: "C" });
    const idD = seedInventoryItem(db, { item_name: "D" });

    const pairAB = [idA, idB].sort() as [string, string];
    const pairBC = [idB, idC].sort() as [string, string];
    const pairCD = [idC, idD].sort() as [string, string];
    seedItemConnection(db, pairAB[0], pairAB[1]);
    seedItemConnection(db, pairBC[0], pairBC[1]);
    seedItemConnection(db, pairCD[0], pairCD[1]);

    const result = await caller.inventory.connections.trace({ itemId: idA });

    // A -> B -> C -> D (linear chain)
    expect(result.data.id).toBe(idA);
    expect(result.data.children).toHaveLength(1);
    const level1 = result.data.children[0]!;
    expect(level1.id).toBe(idB);
    expect(level1.children).toHaveLength(1);
    const level2 = level1.children[0]!;
    expect(level2.id).toBe(idC);
    expect(level2.children).toHaveLength(1);
    const level3 = level2.children[0]!;
    expect(level3.id).toBe(idD);
  });

  it("respects maxDepth parameter", async () => {
    // Chain: A -- B -- C -- D
    const idA = seedInventoryItem(db, { item_name: "A" });
    const idB = seedInventoryItem(db, { item_name: "B" });
    const idC = seedInventoryItem(db, { item_name: "C" });
    const idD = seedInventoryItem(db, { item_name: "D" });

    const pairAB = [idA, idB].sort() as [string, string];
    const pairBC = [idB, idC].sort() as [string, string];
    const pairCD = [idC, idD].sort() as [string, string];
    seedItemConnection(db, pairAB[0], pairAB[1]);
    seedItemConnection(db, pairBC[0], pairBC[1]);
    seedItemConnection(db, pairCD[0], pairCD[1]);

    // maxDepth=1 from A should only reach B, not C or D
    const result = await caller.inventory.connections.trace({ itemId: idA, maxDepth: 1 });

    expect(result.data.id).toBe(idA);
    expect(result.data.children).toHaveLength(1);
    const child = result.data.children[0]!;
    expect(child.id).toBe(idB);
    expect(child.children).toHaveLength(0);
  });

  it("handles circular references without infinite loop", async () => {
    // Triangle: A -- B, A -- C, B -- C
    const idA = seedInventoryItem(db, { item_name: "A" });
    const idB = seedInventoryItem(db, { item_name: "B" });
    const idC = seedInventoryItem(db, { item_name: "C" });

    const pairAB = [idA, idB].sort() as [string, string];
    const pairAC = [idA, idC].sort() as [string, string];
    const pairBC = [idB, idC].sort() as [string, string];
    seedItemConnection(db, pairAB[0], pairAB[1]);
    seedItemConnection(db, pairAC[0], pairAC[1]);
    seedItemConnection(db, pairBC[0], pairBC[1]);

    const result = await caller.inventory.connections.trace({ itemId: idA });

    // Should not loop — visited set prevents revisiting
    expect(result.data.id).toBe(idA);
    expect(result.data.children).toHaveLength(2);

    // Each child should have at most 0 further children (C already visited via A)
    // or 1 if C is reached via B first
    const totalNodes = countTreeNodes(result.data);
    expect(totalNodes).toBe(3); // A, B, C — each visited once
  });

  it("returns single node with no children when item has no connections", async () => {
    const id = seedInventoryItem(db, { item_name: "Lonely" });

    const result = await caller.inventory.connections.trace({ itemId: id });

    expect(result.data.id).toBe(id);
    expect(result.data.children).toHaveLength(0);
  });

  it("throws NOT_FOUND for nonexistent item", async () => {
    await expect(
      caller.inventory.connections.trace({ itemId: "nonexistent" })
    ).rejects.toThrow(TRPCError);

    try {
      await caller.inventory.connections.trace({ itemId: "nonexistent" });
    } catch (err) {
      expect((err as TRPCError).code).toBe("NOT_FOUND");
    }
  });

  it("returns node metadata (itemName, assetId, type)", async () => {
    const id = seedInventoryItem(db, {
      item_name: "MacBook Pro",
      asset_id: "ASSET-001",
      type: "electronics",
    });

    const result = await caller.inventory.connections.trace({ itemId: id });

    expect(result.data).toMatchObject({
      id,
      itemName: "MacBook Pro",
      assetId: "ASSET-001",
      type: "electronics",
    });
  });
});

/** Count total nodes in a trace tree. */
function countTreeNodes(node: { children: { children: unknown[] }[] }): number {
  let count = 1;
  for (const child of node.children) {
    count += countTreeNodes(child as typeof node);
  }
  return count;
}

describe("inventory.connections auth", () => {
  it("throws UNAUTHORIZED without auth on connect", async () => {
    const unauthCaller = createCaller(false);
    await expect(
      unauthCaller.inventory.connections.connect({ itemAId: "a", itemBId: "b" })
    ).rejects.toThrow(TRPCError);
  });

  it("throws UNAUTHORIZED without auth on disconnect", async () => {
    const unauthCaller = createCaller(false);
    await expect(unauthCaller.inventory.connections.disconnect({ id: 1 })).rejects.toThrow(
      TRPCError
    );
  });

  it("throws UNAUTHORIZED without auth on listForItem", async () => {
    const unauthCaller = createCaller(false);
    await expect(unauthCaller.inventory.connections.listForItem({ itemId: "a" })).rejects.toThrow(
      TRPCError
    );
  });
});
