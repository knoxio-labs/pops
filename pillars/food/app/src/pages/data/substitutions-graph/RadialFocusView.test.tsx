/**
 * RadialFocusView renders raw `fill`/`stroke` attributes on SVG elements.
 * SVG can resolve CSS custom properties at paint time, so these must be
 * `var(--…)` references to real design tokens, never a hardcoded hex.
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RadialFocusView } from './RadialFocusView';

import type { SubGraphEdge, SubGraphNode } from './types';

function ingredientNode(id: string): SubGraphNode {
  return {
    id,
    kind: 'ingredient',
    ingredientId: 1,
    variantId: null,
    ingredientSlug: id,
    ingredientName: id,
    variantSlug: null,
    variantName: null,
  };
}

function variantNode(id: string): SubGraphNode {
  return {
    ...ingredientNode(id),
    kind: 'variant',
    variantId: 2,
    variantSlug: 'v',
    variantName: 'v',
  };
}

function edge(id: number, fromNodeId: string, toNodeId: string): SubGraphEdge {
  return {
    id,
    fromNodeId,
    toNodeId,
    ratio: 1,
    contextTags: [],
    scope: 'global',
    recipeId: null,
    recipeSlug: null,
    notes: null,
  };
}

describe('RadialFocusView', () => {
  it('paints every fill/stroke with a var(--…) design token, never a hex literal', () => {
    const focus = ingredientNode('focus');
    const variant = variantNode('variant');
    const plain = ingredientNode('plain');
    const { container } = render(
      <RadialFocusView
        focus={focus}
        nodes={[focus, variant, plain]}
        edges={[edge(1, 'focus', 'variant'), edge(2, 'plain', 'focus')]}
        onNodeClick={vi.fn()}
        onEdgeClick={vi.fn()}
      />
    );

    const filled = Array.from(container.querySelectorAll('[fill]'));
    const stroked = Array.from(container.querySelectorAll('[stroke]'));
    expect(filled.length + stroked.length).toBeGreaterThan(0);

    for (const el of [...filled, ...stroked]) {
      const fill = el.getAttribute('fill');
      const stroke = el.getAttribute('stroke');
      if (fill && fill !== 'white') expect(fill).toMatch(/^var\(--[\w-]+\)$/);
      if (stroke) expect(stroke).toMatch(/^var\(--[\w-]+\)$/);
    }
  });

  it('gives a variant node a different fill token than a plain node', () => {
    const focus = ingredientNode('focus');
    const variant = variantNode('variant');
    const plain = ingredientNode('plain');
    const { container } = render(
      <RadialFocusView
        focus={focus}
        nodes={[focus, variant, plain]}
        edges={[edge(1, 'focus', 'variant'), edge(2, 'plain', 'focus')]}
        onNodeClick={vi.fn()}
        onEdgeClick={vi.fn()}
      />
    );

    // Both "other" nodes render as r=20 circles; the centre focus node is r=28.
    const otherCircles = Array.from(container.querySelectorAll('circle[r="20"]'));
    const fills = otherCircles.map((c) => c.getAttribute('fill'));
    expect(new Set(fills).size).toBe(2);
  });
});
