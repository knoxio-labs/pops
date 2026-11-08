import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';

import { useRouteState } from '../trip-route-editing/canvas-state';
import { initialPerson } from './model';

it('undo restores removed contact points and edited availability together', () => {
  const { result } = renderHook(() => useRouteState(() => initialPerson('default')));
  const original = result.current.state;
  act(() => result.current.change({ ...original, methods: [], availability: [] }));
  expect(result.current.state.methods).toEqual([]);
  expect(result.current.canUndo).toBe(true);
  act(() => result.current.undo());
  expect(result.current.state).toEqual(original);
  expect(result.current.canUndo).toBe(false);
});
