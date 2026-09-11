import { describe, expect, it, vi } from 'vitest';

import { drawNodes, type InternalNode, type NodeDrawingContext } from './ForceGraph.utils';

const { SENTINEL_BORDER_COLOR } = vi.hoisted(() => ({
  SENTINEL_BORDER_COLOR: '#sentinel-current-border',
}));

vi.mock('../theme/graph-colors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../theme/graph-colors')>();
  return {
    GRAPH_COLORS: {
      ...actual.GRAPH_COLORS,
      node: { ...actual.GRAPH_COLORS.node, currentBorder: SENTINEL_BORDER_COLOR },
    },
  };
});

function fakeCtx(): NodeDrawingContext {
  return {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
  };
}

function node(id: string): InternalNode {
  return { id, x: 0, y: 0, vx: 0, vy: 0, fx: 0, fy: 0 };
}

describe('drawNodes hover border', () => {
  it('paints the hovered node border with the mocked GRAPH_COLORS.node.currentBorder token', () => {
    const ctx = fakeCtx();
    drawNodes(ctx, [node('n1')], {
      defaultNodeColor: '#000',
      labelColor: '#000',
      hoveredId: 'n1',
    });

    expect(ctx.strokeStyle).toBe(SENTINEL_BORDER_COLOR);
  });

  it('leaves strokeStyle untouched for a non-hovered node', () => {
    const ctx = fakeCtx();
    drawNodes(ctx, [node('n1')], {
      defaultNodeColor: '#000',
      labelColor: '#000',
      hoveredId: null,
    });

    expect(ctx.strokeStyle).toBe('');
  });
});
