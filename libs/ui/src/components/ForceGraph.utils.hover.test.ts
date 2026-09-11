import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { GRAPH_COLORS } from '../theme/graph-colors';
import { drawNodes, type InternalNode } from './ForceGraph.utils';

function fakeCtx() {
  return {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function node(id: string): InternalNode {
  return { id, x: 0, y: 0, vx: 0, vy: 0, fx: 0, fy: 0 };
}

describe('drawNodes hover border', () => {
  it('paints the hovered node border with GRAPH_COLORS.node.currentBorder', () => {
    const ctx = fakeCtx();
    drawNodes(ctx, [node('n1')], {
      defaultNodeColor: '#000',
      labelColor: '#000',
      hoveredId: 'n1',
    });

    expect(ctx.strokeStyle).toBe(GRAPH_COLORS.node.currentBorder);
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

  it('references GRAPH_COLORS.node.currentBorder in source rather than a coincidentally-equal hex literal', () => {
    // GRAPH_COLORS.node.currentBorder happens to equal '#1d4ed8' today, so a
    // runtime-value assertion alone can't tell "imports the token" apart from
    // "still hardcodes the same hex" — check the source text directly.
    const path = join(process.cwd(), 'src/components/ForceGraph.utils.ts');
    const source = readFileSync(path, 'utf8');
    expect(source).not.toMatch(/#1d4ed8/i);
    expect(source).toMatch(/GRAPH_COLORS\.node\.currentBorder/);
  });
});
