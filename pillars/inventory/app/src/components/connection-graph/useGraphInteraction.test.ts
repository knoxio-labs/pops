import { fireEvent, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useGraphInteraction } from './useGraphInteraction';

import type { GraphLink, GraphNode, Transform } from './types';

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () =>
    ({
      width: 200,
      height: 200,
      top: 0,
      left: 0,
      right: 200,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  return canvas;
}

function useHarness(
  canvas: HTMLCanvasElement,
  nodes: GraphNode[],
  onNavigate: (id: string) => void
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(canvas);
  const nodesRef = useRef<GraphNode[]>(nodes);
  const linksRef = useRef<GraphLink[]>([]);
  const transformRef = useRef<Transform>({ x: 0, y: 0, k: 1 });
  useGraphInteraction({
    canvasRef,
    nodesRef,
    linksRef,
    transformRef,
    itemId: 'item-1',
    onNavigate,
  });
}

function node(id: string, x: number, isFixture = false): GraphNode {
  return { id, itemName: id, assetId: null, type: null, isFixture, x, y: 20 };
}

describe('useGraphInteraction', () => {
  it('does not navigate when a fixture node is clicked', () => {
    const canvas = makeCanvas();
    const onNavigate = vi.fn();
    renderHook(() => useHarness(canvas, [node('fixture-1', 20, true)], onNavigate));

    fireEvent.mouseDown(canvas, { clientX: 20, clientY: 20 });
    fireEvent.mouseUp(canvas, { clientX: 20, clientY: 20 });

    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('navigates when an item node is clicked', () => {
    const canvas = makeCanvas();
    const onNavigate = vi.fn();
    renderHook(() => useHarness(canvas, [node('item-2', 20)], onNavigate));

    fireEvent.mouseDown(canvas, { clientX: 20, clientY: 20 });
    fireEvent.mouseUp(canvas, { clientX: 20, clientY: 20 });

    expect(onNavigate).toHaveBeenCalledWith('item-2');
  });
});
