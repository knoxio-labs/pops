import { useRef } from 'react';
import { useNavigate } from 'react-router';

import { useGraphInteraction } from '../../components/connection-graph/useGraphInteraction.js';
import { useGraphSimulation } from '../../components/connection-graph/useGraphSimulation.js';
import { registryGraph } from './connection-model.js';

import type { ReactElement } from 'react';

import type { GraphLink, GraphNode, Transform } from '../../components/connection-graph/types.js';
import type { ConnectionRow } from './connection-model.js';

/** Props for the all-connections graph. */
export interface ConnectionGraphProps {
  rows: readonly ConnectionRow[];
  focusItemId?: string | null;
}

function navigateToNode(navigate: ReturnType<typeof useNavigate>, key: string): void {
  if (key.startsWith('item:')) {
    void navigate(`/inventory/items/${key.slice('item:'.length)}`);
    return;
  }
  if (key.startsWith('fixture:'))
    void navigate(`/inventory/fixtures/${key.slice('fixture:'.length)}`);
}

function GraphCanvas({
  data,
  focusItemId,
}: {
  data: ReturnType<typeof registryGraph>;
  focusItemId: string | null;
}): ReactElement {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const transformRef = useRef<Transform>({ x: 0, y: 0, k: 1 });
  useGraphSimulation({
    rawData: data,
    canvasRef,
    containerRef,
    itemId: focusItemId === null ? '' : `item:${focusItemId}`,
    nodesRef,
    linksRef,
    transformRef,
  });
  useGraphInteraction({
    canvasRef,
    nodesRef,
    linksRef,
    transformRef,
    itemId: focusItemId === null ? '' : `item:${focusItemId}`,
    onNavigate: (id) => navigateToNode(navigate, id),
  });

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-80 w-full overflow-hidden rounded-lg border bg-muted/20"
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Connections graph"
        className="size-full cursor-grab active:cursor-grabbing"
      />
      <p className="absolute bottom-2 right-2 text-xs text-muted-foreground">
        Scroll to zoom, drag to pan, click a node to open it
      </p>
    </div>
  );
}

/** Renders every unfiltered connection through the existing force simulation. */
export function ConnectionGraph({ rows, focusItemId = null }: ConnectionGraphProps): ReactElement {
  const data = registryGraph(rows);
  if (data.nodes.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">Not enough connections to display a graph.</p>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        {data.nodes.length} things, {data.edges.length} connections. Select one to open it.
      </p>
      <div className="min-h-0 flex-1">
        <GraphCanvas data={data} focusItemId={focusItemId} />
      </div>
    </div>
  );
}
