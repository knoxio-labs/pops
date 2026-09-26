/**
 * In-process BFS over the item-connections adjacency to build a node/edge
 * subgraph from a starting item up to `maxDepth`. Lives next to the
 * connections service so callers get the full graph surface from one
 * namespace.
 *
 * The graph traversal is intentionally db-agnostic beyond the initial
 * `select *` — the BFS works on in-memory adjacency maps so cycles, deep
 * chains, and dense fan-out don't reissue queries per node.
 */
import { eq, or } from 'drizzle-orm';

import { fixtures, itemConnections, itemFixtureConnections, items } from '../schema.js';
import { ConnectionItemNotFoundError } from './connections-errors.js';

import type { GraphData, GraphEdge, GraphNode, TraceNode } from './connections-types.js';
import type { InventoryDb } from './internal.js';

type AdjacencyEntry = { neighborId: string; itemAId: string; itemBId: string };
type AdjacencyMap = Map<string, AdjacencyEntry[]>;

function buildAdjacency(connections: { itemAId: string; itemBId: string }[]): AdjacencyMap {
  const adjacency: AdjacencyMap = new Map();
  for (const conn of connections) {
    if (!adjacency.has(conn.itemAId)) adjacency.set(conn.itemAId, []);
    if (!adjacency.has(conn.itemBId)) adjacency.set(conn.itemBId, []);
    adjacency.get(conn.itemAId)?.push({
      neighborId: conn.itemBId,
      itemAId: conn.itemAId,
      itemBId: conn.itemBId,
    });
    adjacency.get(conn.itemBId)?.push({
      neighborId: conn.itemAId,
      itemAId: conn.itemAId,
      itemBId: conn.itemBId,
    });
  }
  return adjacency;
}

interface BfsState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  visitedNodes: Set<string>;
  visitedFixtureIds: Set<string>;
  visitedEdges: Set<string>;
  queue: { nodeId: string; depth: number }[];
}

interface TraceTraversalState {
  depth: number;
  maxDepth: number;
  visited: Set<string>;
  queue: { node: TraceNode; depth: number }[];
  fixturesByItem: Map<string, GraphNode[]>;
  visitedFixtureIds: Set<string>;
}

function visitNeighbors(
  state: BfsState,
  neighbors: AdjacencyEntry[],
  itemMap: Map<string, GraphNode>,
  depth: number
): void {
  for (const { neighborId, itemAId, itemBId } of neighbors) {
    const edgeKey = `item:${itemAId}|${itemBId}`;
    if (!state.visitedEdges.has(edgeKey)) {
      state.visitedEdges.add(edgeKey);
      state.edges.push({ source: itemAId, target: itemBId });
    }

    if (state.visitedNodes.has(neighborId)) continue;
    state.visitedNodes.add(neighborId);

    const neighbor = itemMap.get(neighborId);
    if (!neighbor) continue;
    state.nodes.push(neighbor);
    state.queue.push({ nodeId: neighborId, depth: depth + 1 });
  }
}

/** Load fixture leaves grouped by the inventory item they are wired to. */
export function getFixtureNodesByItem(db: InventoryDb): Map<string, GraphNode[]> {
  const rows = db
    .select({
      itemId: itemFixtureConnections.itemId,
      fixtureId: fixtures.id,
      itemName: fixtures.name,
      type: fixtures.type,
    })
    .from(itemFixtureConnections)
    .innerJoin(fixtures, eq(itemFixtureConnections.fixtureId, fixtures.id))
    .all();

  const fixturesByItem = new Map<string, GraphNode[]>();
  for (const row of rows) {
    const nodes = fixturesByItem.get(row.itemId) ?? [];
    nodes.push({
      id: row.fixtureId,
      itemName: row.itemName,
      assetId: null,
      type: row.type,
      isFixture: true,
    });
    fixturesByItem.set(row.itemId, nodes);
  }
  return fixturesByItem;
}

function visitFixtures(state: BfsState, fixturesForItem: GraphNode[], itemId: string): void {
  for (const fixture of fixturesForItem) {
    const edgeKey = `fixture:${itemId}|${fixture.id}`;
    if (!state.visitedEdges.has(edgeKey)) {
      state.visitedEdges.add(edgeKey);
      state.edges.push({ source: itemId, target: fixture.id });
    }

    if (state.visitedFixtureIds.has(fixture.id)) continue;
    state.visitedFixtureIds.add(fixture.id);
    state.nodes.push(fixture);
  }
}

function appendTraceItemChildren(
  db: InventoryDb,
  node: TraceNode,
  state: TraceTraversalState
): void {
  if (state.depth >= state.maxDepth) return;

  const connections = db
    .select()
    .from(itemConnections)
    .where(or(eq(itemConnections.itemAId, node.id), eq(itemConnections.itemBId, node.id)))
    .all();

  for (const conn of connections) {
    const neighborId = conn.itemAId === node.id ? conn.itemBId : conn.itemAId;
    if (state.visited.has(neighborId)) continue;
    state.visited.add(neighborId);

    const [neighbor] = db
      .select({
        id: items.id,
        itemName: items.name,
        assetId: items.code,
        type: items.legacyType,
      })
      .from(items)
      .where(eq(items.id, neighborId))
      .all();

    if (!neighbor) continue;

    const childNode: TraceNode = {
      id: neighbor.id,
      itemName: neighbor.itemName,
      assetId: neighbor.assetId,
      type: neighbor.type,
      children: [],
    };

    node.children.push(childNode);
    state.queue.push({ node: childNode, depth: state.depth + 1 });
  }
}

function appendTraceFixtureChildren(node: TraceNode, state: TraceTraversalState): void {
  for (const fixture of state.fixturesByItem.get(node.id) ?? []) {
    if (state.visitedFixtureIds.has(fixture.id)) continue;
    state.visitedFixtureIds.add(fixture.id);
    node.children.push({
      id: fixture.id,
      itemName: fixture.itemName,
      assetId: null,
      type: fixture.type,
      isFixture: true,
      children: [],
    });
  }
}

/** Append item and fixture leaves for one node in a trace traversal. */
export function appendTraceChildren(
  db: InventoryDb,
  node: TraceNode,
  state: TraceTraversalState
): void {
  appendTraceItemChildren(db, node, state);
  appendTraceFixtureChildren(node, state);
}

/**
 * Build the connection subgraph rooted at `itemId`, expanding by BFS up to
 * `maxDepth` hops. Throws `ConnectionItemNotFoundError` when the starting
 * item is missing.
 */
export function getConnectionGraph(db: InventoryDb, itemId: string, maxDepth: number): GraphData {
  const allConnections = db.select().from(itemConnections).all();
  const allItems = db
    .select({
      id: items.id,
      itemName: items.name,
      assetId: items.code,
      type: items.legacyType,
    })
    .from(items)
    .all();

  const itemMap = new Map(allItems.map((item) => [item.id, item]));
  const adjacency = buildAdjacency(allConnections);
  const fixturesByItem = getFixtureNodesByItem(db);

  const startItem = itemMap.get(itemId);
  if (!startItem) throw new ConnectionItemNotFoundError(itemId);

  const state: BfsState = {
    nodes: [startItem],
    edges: [],
    visitedNodes: new Set<string>([itemId]),
    visitedFixtureIds: new Set<string>(),
    visitedEdges: new Set<string>(),
    queue: [{ nodeId: itemId, depth: 0 }],
  };

  while (state.queue.length > 0) {
    const entry = state.queue.shift();
    if (!entry) break;
    if (entry.depth < maxDepth) {
      visitNeighbors(state, adjacency.get(entry.nodeId) ?? [], itemMap, entry.depth);
    }
    visitFixtures(state, fixturesByItem.get(entry.nodeId) ?? [], entry.nodeId);
  }

  return { nodes: state.nodes, edges: state.edges };
}
