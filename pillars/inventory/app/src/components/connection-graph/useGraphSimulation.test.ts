import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';

import { useGraphSimulation } from './useGraphSimulation';

import type { GraphLink, GraphNode, Transform } from './types';

interface RawGraphData {
  nodes: Array<{ id: string; itemName: string; assetId: string | null; type: string | null }>;
  edges: Array<{ source: string; target: string }>;
}

const CONTAINER_WIDTH = 400;
const CONTAINER_HEIGHT = 300;

function rawGraph(ids: string[]): RawGraphData {
  return {
    nodes: ids.map((id) => ({ id, itemName: `item ${id}`, assetId: null, type: null })),
    edges: ids.slice(1).map((id) => ({ source: ids[0] as string, target: id })),
  };
}

function makeContainer(): HTMLDivElement {
  const container = document.createElement('div');
  // jsdom has no layout, so the hook would size the canvas to a 0x0 rect and
  // every transform assertion would collapse to zero.
  container.getBoundingClientRect = () =>
    ({
      width: CONTAINER_WIDTH,
      height: CONTAINER_HEIGHT,
      top: 0,
      left: 0,
      right: CONTAINER_WIDTH,
      bottom: CONTAINER_HEIGHT,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  return container;
}

interface HarnessProps {
  rawData: RawGraphData | null;
  itemId: string;
}

function useHarness(props: HarnessProps, canvas: HTMLCanvasElement, container: HTMLDivElement) {
  const canvasRef = useRef<HTMLCanvasElement | null>(canvas);
  const containerRef = useRef<HTMLDivElement | null>(container);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const transformRef = useRef<Transform>({ x: 0, y: 0, k: 1 });
  useGraphSimulation({
    rawData: props.rawData,
    canvasRef,
    containerRef,
    itemId: props.itemId,
    nodesRef,
    linksRef,
    transformRef,
  });
  return { nodesRef, linksRef, transformRef };
}

function setup(initial: HarnessProps) {
  const canvas = document.createElement('canvas');
  const container = makeContainer();
  const view = renderHook((p: HarnessProps) => useHarness(p, canvas, container), {
    initialProps: initial,
  });
  return { view, canvas, container };
}

describe('useGraphSimulation — effect re-runs', () => {
  it('seeds the refs and centres the transform on the first run', () => {
    const { view, canvas } = setup({ rawData: rawGraph(['a', 'b', 'c']), itemId: 'a' });

    expect(view.result.current.nodesRef.current).toHaveLength(3);
    expect(view.result.current.linksRef.current).toHaveLength(2);
    expect(view.result.current.transformRef.current).toEqual({
      x: CONTAINER_WIDTH / 2,
      y: CONTAINER_HEIGHT / 2,
      k: 1,
    });
    expect(canvas.style.width).toBe(`${CONTAINER_WIDTH}px`);
  });

  it('does not rebuild the graph when the component re-renders with unchanged inputs', () => {
    const props: HarnessProps = { rawData: rawGraph(['a', 'b']), itemId: 'a' };
    const { view } = setup(props);
    const seeded = view.result.current.nodesRef.current[0];

    // Stand in for the layout the running simulation has already produced, plus
    // a pan the user has already applied.
    if (seeded) seeded.x = 123;
    view.result.current.transformRef.current.x = 999;

    view.rerender(props);
    view.rerender(props);

    expect(view.result.current.nodesRef.current[0]).toBe(seeded);
    expect(view.result.current.nodesRef.current[0]?.x).toBe(123);
    expect(view.result.current.transformRef.current.x).toBe(999);
  });

  it('rebuilds the graph when the data changes', () => {
    const props: HarnessProps = { rawData: rawGraph(['a', 'b']), itemId: 'a' };
    const { view } = setup(props);
    const seeded = view.result.current.nodesRef.current[0];
    view.result.current.transformRef.current.x = 999;

    view.rerender({ ...props, rawData: rawGraph(['a', 'b', 'c']) });

    expect(view.result.current.nodesRef.current).toHaveLength(3);
    expect(view.result.current.nodesRef.current[0]).not.toBe(seeded);
    expect(view.result.current.transformRef.current.x).toBe(CONTAINER_WIDTH / 2);
  });

  it('rebuilds the graph when the focused item changes', () => {
    const props: HarnessProps = { rawData: rawGraph(['a', 'b']), itemId: 'a' };
    const { view } = setup(props);
    const seeded = view.result.current.nodesRef.current[0];

    view.rerender({ ...props, itemId: 'b' });

    expect(view.result.current.nodesRef.current[0]).not.toBe(seeded);
  });

  it('leaves the refs untouched while there is no data', () => {
    const { view } = setup({ rawData: null, itemId: 'a' });

    expect(view.result.current.nodesRef.current).toHaveLength(0);
    expect(view.result.current.transformRef.current).toEqual({ x: 0, y: 0, k: 1 });

    view.rerender({ rawData: { nodes: [], edges: [] }, itemId: 'a' });
    expect(view.result.current.nodesRef.current).toHaveLength(0);
    expect(view.result.current.transformRef.current).toEqual({ x: 0, y: 0, k: 1 });
  });
});
