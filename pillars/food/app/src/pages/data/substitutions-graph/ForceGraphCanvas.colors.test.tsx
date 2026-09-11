import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * ForceGraphCanvas's node/link colours must come from `GRAPH_COLORS`
 * (`@pops/ui/theme/graph-colors`), not hardcoded hex. `react-force-graph-2d`
 * is mocked so the props passed to it (nodeColor/linkColor/graphData) can be
 * inspected without a real `HTMLCanvasElement`.
 */
import { GRAPH_COLORS } from '@pops/ui/theme/graph-colors';

import { ForceGraphCanvas } from './ForceGraphCanvas';

import type { SubGraphEdge, SubGraphNode } from './types';

const forceGraph2DPropsSpy = vi.fn();

vi.mock('react-force-graph-2d', () => ({
  default: (props: unknown) => {
    forceGraph2DPropsSpy(props);
    return null;
  },
}));

function node(id: string, kind: SubGraphNode['kind']): SubGraphNode {
  return {
    id,
    kind,
    ingredientId: 1,
    variantId: kind === 'variant' ? 2 : null,
    ingredientSlug: id,
    ingredientName: id,
    variantSlug: kind === 'variant' ? 'v' : null,
    variantName: kind === 'variant' ? 'v' : null,
  };
}

const edges: SubGraphEdge[] = [];

interface ForceGraph2DProps {
  graphData: { nodes: { id: string; color: string }[] };
  nodeColor: (n: { color?: string }) => string;
  linkColor: () => string;
}

describe('ForceGraphCanvas colours', () => {
  it('colours a variant node with GRAPH_COLORS.node.current and a plain node with GRAPH_COLORS.node.default', () => {
    render(
      <ForceGraphCanvas
        nodes={[node('variant', 'variant'), node('plain', 'ingredient')]}
        edges={edges}
        width={400}
        height={300}
        onNodeClick={vi.fn()}
        onEdgeClick={vi.fn()}
      />
    );

    const props = forceGraph2DPropsSpy.mock.calls[0]?.[0] as ForceGraph2DProps;
    const byId = new Map(props.graphData.nodes.map((n) => [n.id, n.color]));
    expect(byId.get('variant')).toBe(GRAPH_COLORS.node.current);
    expect(byId.get('plain')).toBe(GRAPH_COLORS.node.default);
  });

  it('falls back nodeColor and linkColor to GRAPH_COLORS entries', () => {
    render(
      <ForceGraphCanvas
        nodes={[node('plain', 'ingredient')]}
        edges={edges}
        width={400}
        height={300}
        onNodeClick={vi.fn()}
        onEdgeClick={vi.fn()}
      />
    );

    const props = forceGraph2DPropsSpy.mock.calls.at(-1)?.[0] as ForceGraph2DProps;
    expect(props.nodeColor({})).toBe(GRAPH_COLORS.node.default);
    expect(props.linkColor()).toBe(GRAPH_COLORS.fallbacks.edge);
  });
});
