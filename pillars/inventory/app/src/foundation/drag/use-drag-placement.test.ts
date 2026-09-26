import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { coreWorld } from '../fixtures/core';
import { closedBoxTarget, deskTarget, shelvingTarget } from '../fixtures/placements';
import { dragSet, useDragPlacement } from './use-drag-placement';

import type { PlacementTarget } from '../model/model';
import type { DropVerdict } from '../move-plan/move-plan-model';

describe('dragSet', () => {
  it('carries the selected rows when the grabbed row is selected', () => {
    const selected = ['itm-printer', 'itm-lamp'] as const;

    expect(dragSet('itm-lamp', selected)).toEqual(['itm-printer', 'itm-lamp']);
    expect(dragSet('itm-lamp', selected)).not.toBe(selected);
  });

  it('starts a single-row drag when the grabbed row is not selected', () => {
    expect(dragSet('itm-tape', ['itm-printer', 'itm-lamp'])).toEqual(['itm-tape']);
  });
});

describe('useDragPlacement', () => {
  function setup() {
    const onDrop = vi.fn<(ids: readonly string[], target: PlacementTarget) => void>();
    const hook = renderHook(() => useDragPlacement(coreWorld, onDrop));
    return { ...hook, onDrop };
  }

  it('begins with no active target and reports idle targets', () => {
    const { result } = setup();

    expect(result.current.dragging).toEqual([]);
    expect(result.current.over).toBeNull();
    expect(result.current.stateFor(shelvingTarget)).toBe('idle');
  });

  it('uses the selected rows, reports available and hovered states, and exposes the verdict', () => {
    const { result } = setup();

    act(() => result.current.begin('itm-lamp', ['itm-lamp', 'itm-printer']));
    expect(result.current.dragging).toEqual(['itm-lamp', 'itm-printer']);
    expect(result.current.verdictFor(shelvingTarget)).toEqual({ ok: true, count: 2 });
    expect(result.current.stateFor(shelvingTarget)).toBe('available');

    act(() => result.current.hover(shelvingTarget));
    expect(result.current.over).toEqual(shelvingTarget);
    expect(result.current.stateFor(shelvingTarget)).toBe('over');
    expect(result.current.stateFor(closedBoxTarget)).toBe('refused');
    expect(result.current.verdictFor(closedBoxTarget)).toEqual({
      ok: false,
      reason: 'Office 04 is closed. Open it first.',
    });
  });

  it('calls onDrop only for an accepted target and clears the drag', () => {
    const { result, onDrop } = setup();

    act(() => {
      result.current.begin('itm-lamp', []);
      result.current.hover(shelvingTarget);
    });
    let verdict: DropVerdict | undefined;
    act(() => {
      verdict = result.current.drop(shelvingTarget);
    });

    expect(verdict).toEqual({ ok: true, count: 1 });
    expect(onDrop).toHaveBeenCalledOnce();
    expect(onDrop).toHaveBeenCalledWith(['itm-lamp'], shelvingTarget);
    expect(result.current.dragging).toEqual([]);
    expect(result.current.over).toBeNull();
  });

  it('rejects a refused target without applying it, then allows cancellation', () => {
    const { result, onDrop } = setup();

    act(() => result.current.begin('itm-lamp', []));
    let verdict: DropVerdict | undefined;
    act(() => {
      verdict = result.current.drop(closedBoxTarget);
    });

    expect(verdict).toEqual({ ok: false, reason: 'Office 04 is closed. Open it first.' });
    expect(onDrop).not.toHaveBeenCalled();
    expect(result.current.dragging).toEqual([]);

    act(() => {
      result.current.begin('itm-lamp', []);
      result.current.hover(deskTarget);
      result.current.cancel();
    });
    expect(result.current.dragging).toEqual([]);
    expect(result.current.over).toBeNull();
  });
});
