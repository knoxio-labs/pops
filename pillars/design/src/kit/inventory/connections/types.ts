import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';

export interface GraphNode extends SimulationNodeDatum {
  id: string;
  itemName: string;
  assetId: string | null;
  type: string | null;
}

export interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: GraphNode;
  target: GraphNode;
}

export interface Transform {
  x: number;
  y: number;
  k: number;
}

/**
 * The connection graph's raw shape, before the force simulation lays it
 * out: nodes as the API returns them, edges as bare id pairs.
 */
export interface GraphData {
  nodes: Array<{ id: string; itemName: string; assetId: string | null; type: string | null }>;
  edges: Array<{ source: string; target: string }>;
}

/**
 * A node in the connection trace tree. Declared here rather than imported
 * because the source types this against the generated inventory client,
 * which the playground may not import.
 */
export interface TraceNode {
  id: string;
  itemName: string;
  assetId: string | null;
  type: string | null;
  children: TraceNode[];
}

/** A candidate item ConnectDialog's search can offer to connect to. */
export interface ConnectCandidateItem {
  id: string;
  itemName: string;
  brand: string | null;
  model: string | null;
  assetId: string | null;
  type: string | null;
}
