import { useRef } from 'react';

import { Skeleton, cn } from '@pops/ui';

import { useGraphInteraction } from './use-graph-interaction';
import { useGraphSimulation } from './use-graph-simulation';

import type { GraphData, GraphLink, GraphNode, Transform } from './types';

export type ConnectionGraphStatus = 'loading' | 'unavailable' | 'error' | 'ready';

export interface ConnectionGraphProps {
  itemId: string;
  status: ConnectionGraphStatus;
  data: GraphData | null;
  /**
   * The canvas renders inside the design canvas iframe, so a real route
   * change would navigate the surface away rather than the item. Screens
   * drive navigation themselves instead of this reaching for react-router.
   */
  onNavigate?: (id: string) => void;
  /** Sizes the canvas; defaults to a fixed 400px height. */
  className?: string;
}

function GraphCanvas({
  itemId,
  data,
  onNavigate,
  className,
}: {
  itemId: string;
  data: GraphData;
  onNavigate: (id: string) => void;
  className?: string;
}): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const transformRef = useRef<Transform>({ x: 0, y: 0, k: 1 });

  useGraphSimulation({
    rawData: data,
    canvasRef,
    containerRef,
    itemId,
    nodesRef,
    linksRef,
    transformRef,
  });
  useGraphInteraction({
    canvasRef,
    nodesRef,
    linksRef,
    transformRef,
    itemId,
    onNavigate,
  });

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full border rounded-lg bg-muted/20 overflow-hidden',
        className ?? 'h-100'
      )}
    >
      <canvas ref={canvasRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
      <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
        Scroll to zoom, drag to pan, click node to navigate
      </div>
    </div>
  );
}

export function ConnectionGraph({
  itemId,
  status,
  data,
  onNavigate = () => {},
  className,
}: ConnectionGraphProps): React.ReactElement {
  if (status === 'loading') return <Skeleton className="h-100 w-full rounded-lg" />;
  if (status === 'unavailable') {
    return <p className="text-sm text-muted-foreground">Connection graph unavailable.</p>;
  }
  if (status === 'error') {
    return <p className="text-sm text-destructive">Failed to load connection graph.</p>;
  }
  if (!data?.nodes.length || data.nodes.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">Not enough connections to display a graph.</p>
    );
  }

  return <GraphCanvas itemId={itemId} data={data} onNavigate={onNavigate} className={className} />;
}
