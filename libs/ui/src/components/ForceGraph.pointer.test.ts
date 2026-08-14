import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  usePointerHandlers,
  usePointerRefs,
  type Transform,
  type UsePointerArgs,
} from './ForceGraph.pointer';

import type { InternalNode } from './ForceGraph.utils';

function node(id: string, x: number, y: number): InternalNode {
  return { id, x, y, vx: 0, vy: 0, fx: 0, fy: 0, radius: 10 };
}

interface HarnessProps {
  canvas: HTMLCanvasElement;
  nodes: Map<string, InternalNode>;
  transform: Transform;
  onNodeHover?: (id: string | null) => void;
}

/**
 * Mirrors how `ForceGraph` calls the hook: the refs are owned by the caller and
 * keep their identity across renders, only their `current` moves.
 */
function useHarness(props: HarnessProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(props.canvas);
  canvasRef.current = props.canvas;
  const nodesRef = useRef<Map<string, InternalNode>>(props.nodes);
  nodesRef.current = props.nodes;
  const state = usePointerRefs();
  const args: UsePointerArgs = {
    canvasRef,
    nodesRef,
    state,
    transform: props.transform,
    setTransform: () => {},
    enableZoom: true,
    onNodeHover: props.onNodeHover,
  };
  return usePointerHandlers(args);
}

// jsdom reports an all-zero DOMRect, so under the identity transform screen
// coordinates map 1:1 onto world coordinates.
const IDENTITY: Transform = { x: 0, y: 0, k: 1 };

function setup(overrides: Partial<HarnessProps> = {}) {
  const canvas = document.createElement('canvas');
  const props: HarnessProps = {
    canvas,
    nodes: new Map([['a', node('a', 0, 0)]]),
    transform: IDENTITY,
    ...overrides,
  };
  const view = renderHook((p: HarnessProps) => useHarness(p), { initialProps: props });
  return { canvas, view, props };
}

describe('useHoverHandlers — cursor side effect', () => {
  it('sets the canvas cursor to pointer on a node and back to default off it', () => {
    const { canvas, view } = setup();

    view.result.current.updateHoverFromPointer(0, 0);
    expect(canvas.style.cursor).toBe('pointer');

    view.result.current.updateHoverFromPointer(500, 500);
    expect(canvas.style.cursor).toBe('default');
  });

  it('resets the cursor when the hover is cleared', () => {
    const { canvas, view } = setup();

    view.result.current.updateHoverFromPointer(0, 0);
    expect(canvas.style.cursor).toBe('pointer');

    view.result.current.clearHover();
    expect(canvas.style.cursor).toBe('default');
  });

  it('writes to whatever canvas the ref points at when invoked, not the one seen at memo time', () => {
    const { canvas, view, props } = setup();
    view.result.current.updateHoverFromPointer(0, 0);
    expect(canvas.style.cursor).toBe('pointer');

    const replacement = document.createElement('canvas');
    view.rerender({ ...props, canvas: replacement });
    view.result.current.clearHover();

    expect(replacement.style.cursor).toBe('default');
    expect(canvas.style.cursor).toBe('pointer');
  });
});

describe('useHoverHandlers — callback identity', () => {
  it('keeps the hover callbacks stable across re-renders with unchanged inputs', () => {
    const { view, props } = setup({ onNodeHover: vi.fn() });
    const first = view.result.current;

    view.rerender(props);
    view.rerender(props);

    expect(view.result.current.updateHoverFromPointer).toBe(first.updateHoverFromPointer);
    expect(view.result.current.clearHover).toBe(first.clearHover);
  });

  it('rebuilds the hover callbacks when the hover consumer changes', () => {
    const { view, props } = setup({ onNodeHover: vi.fn() });
    const first = view.result.current;

    const nextHover = vi.fn();
    view.rerender({ ...props, onNodeHover: nextHover });

    expect(view.result.current.clearHover).not.toBe(first.clearHover);
    view.result.current.updateHoverFromPointer(0, 0);
    expect(nextHover).toHaveBeenCalledWith('a');
  });
});

describe('useHoverHandlers — hover notifications', () => {
  it('notifies only on transitions, not on every pointer sample', () => {
    const onNodeHover = vi.fn();
    const { view } = setup({ onNodeHover });

    view.result.current.updateHoverFromPointer(0, 0);
    view.result.current.updateHoverFromPointer(1, 1);
    view.result.current.updateHoverFromPointer(2, 2);

    expect(onNodeHover).toHaveBeenCalledTimes(1);
    expect(onNodeHover).toHaveBeenCalledWith('a');
  });
});
