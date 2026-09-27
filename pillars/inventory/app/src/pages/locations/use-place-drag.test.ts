import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model.js';
import { usePlaceDrag, positionFromPointer } from './use-place-drag.js';

const world = buildWorld(
  [],
  [
    { id: 'home', name: 'Home', parentId: null, kind: 'property' },
    { id: 'garage', name: 'Garage', parentId: 'home', kind: 'room' },
    { id: 'toolbox', name: 'Red toolbox', parentId: 'garage', kind: 'storage' },
    { id: 'shelf', name: 'Shelf', parentId: 'home', kind: 'storage' },
  ]
);

describe('usePlaceDrag', () => {
  it('uses the top quarter, bottom quarter, and middle for before, after, inside', () => {
    expect(positionFromPointer(9, 40)).toBe('before');
    expect(positionFromPointer(31, 40)).toBe('after');
    expect(positionFromPointer(20, 40)).toBe('inside');
    expect(positionFromPointer(0, 0)).toBe('inside');
  });

  it('refuses a drop into its own subtree and does not call onDrop', () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => usePlaceDrag(world, onDrop));
    act(() => result.current.begin('garage'));
    act(() => result.current.hover('toolbox', 'inside'));
    expect(result.current.verdict()).toEqual({
      ok: false,
      reason: 'Red toolbox is inside Garage.',
    });
    act(() => result.current.drop());
    expect(onDrop).not.toHaveBeenCalled();
    expect(result.current.state).toBeNull();
  });

  it('calls onDrop for an allowed position and ends the drag', () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => usePlaceDrag(world, onDrop));
    act(() => result.current.begin('garage'));
    act(() => result.current.hover('shelf', 'after'));
    act(() => result.current.drop());
    expect(onDrop).toHaveBeenCalledWith('garage', 'shelf', 'after');
    expect(result.current.state).toBeNull();
  });
});
