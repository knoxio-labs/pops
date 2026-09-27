import { useRef } from 'react';
import { useNavigate } from 'react-router';

import { useGraphInteraction } from '../../components/connection-graph/useGraphInteraction.js';
import { useGraphSimulation } from '../../components/connection-graph/useGraphSimulation.js';
import { connectionGraph } from './connection-model.js';

import type { ReactElement } from 'react';

import type { GraphLink, GraphNode, Transform } from '../../components/connection-graph/types.js';
import type { WebConnectionRow } from '../../inventory-web/useConnectionsRegistry.js';

/** Props for the all-connections graph. */
export interface ConnectionGraphProps {
  rows: readonly WebConnectionRow[];
  focusItemId?: string | null;
}

function GraphCanvas({
  data,
  focusItemId,
}: {
  data: ReturnType<typeof connectionGraph>;
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
    itemId: focusItemId ?? '',
    nodesRef,
    linksRef,
    transformRef,
  });
  useGraphInteraction({
    canvasRef,
    nodesRef,
    linksRef,
    transformRef,
    itemId: focusItemId ?? '',
    onNavigate: (id) => void navigate(`/inventory/items/${id}`),
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
        Scroll to zoom, drag to pan, click an item node to open it
      </p>
    </div>
  );
}

/** Renders every unfiltered connection through the existing force simulation. */
export function ConnectionGraph({ rows, focusItemId = null }: ConnectionGraphProps): ReactElement {
  const data = connectionGraph(rows);
  if (data.nodes.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">Not enough connections to display a graph.</p>
    );
  }
  return <GraphCanvas data={data} focusItemId={focusItemId} />;
}
