import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  EMPTY_SELECTION,
  applySelectionKey,
  clear,
  coverageOf,
  extendTo,
  moveFocus,
  reconcile,
  selectAll,
  selectedInOrder,
  toggle,
  useSelection,
} from './use-selection';

import type { SelectionApi, SelectionState } from './use-selection';

const rows = ['a', 'b', 'c', 'd', 'e'];

describe('selection model', () => {
  it('toggles a row on and off and anchors on it', () => {
    const on = toggle(EMPTY_SELECTION, 'b');
    expect([...on.selected]).toEqual(['b']);
    expect(on.anchorId).toBe('b');
    expect(on.focusedId).toBe('b');
    expect(toggle(on, 'b').selected).toEqual(new Set());
  });

  it('extends from the anchor in both directions without removing earlier ticks', () => {
    const anchored = toggle(EMPTY_SELECTION, 'd');
    expect(selectedInOrder(extendTo(anchored, 'b', rows), rows)).toEqual(['b', 'c', 'd']);
    expect(selectedInOrder(extendTo(anchored, 'e', rows), rows)).toEqual(['d', 'e']);

    const twice = extendTo(
      toggle(extendTo(toggle(EMPTY_SELECTION, 'a'), 'b', rows), 'd'),
      'e',
      rows
    );
    expect(selectedInOrder(twice, rows)).toEqual(['a', 'b', 'd', 'e']);
  });

  it('keeps the anchor through an extension so a second extension measures from it', () => {
    const first = extendTo(toggle(EMPTY_SELECTION, 'c'), 'e', rows);
    expect(first.anchorId).toBe('c');
    expect(selectedInOrder(extendTo(first, 'a', rows), rows)).toEqual(rows);
  });

  it('falls back to a plain toggle with no anchor or a filtered-away anchor', () => {
    expect(selectedInOrder(extendTo(EMPTY_SELECTION, 'c', rows), rows)).toEqual(['c']);
    const stale = extendTo({ selected: new Set(['a']), anchorId: 'z', focusedId: 'z' }, 'c', rows);
    expect(selectedInOrder(stale, rows)).toEqual(['a', 'c']);
    expect(stale.anchorId).toBe('c');
    expect(stale.focusedId).toBe('c');
  });

  it('reports none, some and all, and none for an empty list', () => {
    const selected = selectAll({ ...EMPTY_SELECTION, focusedId: 'c' }, rows);
    expect(selectedInOrder(selected, rows)).toEqual(rows);
    expect(selected.focusedId).toBe('c');
    expect(coverageOf(EMPTY_SELECTION, rows)).toBe('none');
    expect(coverageOf(toggle(EMPTY_SELECTION, 'a'), rows)).toBe('some');
    expect(coverageOf(selected, rows)).toBe('all');
    expect(coverageOf(selectAll(EMPTY_SELECTION, []), [])).toBe('none');
  });

  it('clears ticks and anchor but keeps focus', () => {
    const cleared = clear(toggle(EMPTY_SELECTION, 'c'));
    expect(cleared.selected.size).toBe(0);
    expect(cleared.anchorId).toBeNull();
    expect(cleared.focusedId).toBe('c');
  });

  it('moves focus and clamps at both ends', () => {
    expect(moveFocus(EMPTY_SELECTION, 1, rows).focusedId).toBe('a');
    expect(moveFocus({ ...EMPTY_SELECTION, focusedId: 'a' }, -1, rows).focusedId).toBe('a');
    expect(moveFocus({ ...EMPTY_SELECTION, focusedId: 'e' }, 1, rows).focusedId).toBe('e');
    expect(moveFocus({ ...EMPTY_SELECTION, focusedId: 'z' }, -1, rows).focusedId).toBe('a');
    expect(moveFocus({ ...EMPTY_SELECTION, focusedId: 'e' }, 1, []).focusedId).toBeNull();
  });

  it('drops rows that left the list and moves focus to the nearest survivor', () => {
    const state = { selected: new Set(['b', 'c']), anchorId: 'c', focusedId: 'c' };
    const next = reconcile(state, rows, ['a', 'b', 'e']);
    expect([...next.selected]).toEqual(['b']);
    expect(next.anchorId).toBeNull();
    expect(next.focusedId).toBe('e');
    expect(reconcile({ ...state, focusedId: 'e' }, rows, ['a', 'b']).focusedId).toBe('b');
    expect(reconcile({ ...state, focusedId: null }, rows, ['a', 'b']).focusedId).toBeNull();
  });

  it('returns selected ids in row order rather than Set insertion order', () => {
    const state = { ...EMPTY_SELECTION, selected: new Set(['d', 'b']) };
    expect(selectedInOrder(state, rows)).toEqual(['b', 'd']);
  });
});

describe('selection keys', () => {
  const focusedOnB = { ...EMPTY_SELECTION, focusedId: 'b' };

  it('maps j, k and arrows to focus, x to toggle and Shift-x to extend', () => {
    expect(applySelectionKey(focusedOnB, { key: 'j' }, rows)?.focusedId).toBe('c');
    expect(applySelectionKey(focusedOnB, { key: 'ArrowUp' }, rows)?.focusedId).toBe('a');
    expect(applySelectionKey(focusedOnB, { key: 'K' }, rows)?.focusedId).toBe('a');
    expect([...(applySelectionKey(focusedOnB, { key: 'x' }, rows)?.selected ?? new Set())]).toEqual(
      ['b']
    );

    const anchored = toggle(EMPTY_SELECTION, 'a');
    const extended = applySelectionKey(
      { ...anchored, focusedId: 'c' },
      { key: 'X', shiftKey: true },
      rows
    );
    expect(selectedInOrder(extended ?? EMPTY_SELECTION, rows)).toEqual(['a', 'b', 'c']);
  });

  it('selects all on Cmd-A or Ctrl-A and ignores other modified keys', () => {
    expect(applySelectionKey(focusedOnB, { key: 'a', metaKey: true }, rows)?.selected.size).toBe(5);
    expect(applySelectionKey(focusedOnB, { key: 'a', ctrlKey: true }, rows)?.selected.size).toBe(5);
    expect(applySelectionKey(focusedOnB, { key: 'a' }, rows)).toBeNull();
    expect(applySelectionKey(focusedOnB, { key: 'j', metaKey: true }, rows)).toBeNull();
  });

  it('clears on Esc only when something is ticked, so Esc can fall through otherwise', () => {
    const cleared = applySelectionKey(toggle(EMPTY_SELECTION, 'a'), { key: 'Escape' }, rows);
    expect(cleared?.selected.size).toBe(0);
    expect(cleared?.focusedId).toBe('a');
    expect(applySelectionKey(focusedOnB, { key: 'Escape' }, rows)).toBeNull();
  });

  it('does nothing for x with no focused row, or an unrelated key', () => {
    expect(applySelectionKey(EMPTY_SELECTION, { key: 'x' }, rows)).toBeNull();
    expect(applySelectionKey(focusedOnB, { key: 'q' }, rows)).toBeNull();
  });
});

describe('useSelection', () => {
  it('ticks with the row toggle, extends with Shift and flips all from the header', () => {
    const { result } = renderHook(() => useSelection(rows));
    act(() => result.current.onRowToggle('b', false));
    act(() => result.current.onRowToggle('d', true));
    expect(result.current.selectedIds).toEqual(['b', 'c', 'd']);
    expect(result.current.coverage).toBe('some');
    act(() => result.current.onHeaderToggle());
    expect(result.current.count).toBe(5);
    act(() => result.current.onHeaderToggle());
    expect(result.current.count).toBe(0);
  });

  it('keeps selectedIds in current order after out-of-order toggles', () => {
    const { result } = renderHook(() => useSelection(rows));
    act(() => result.current.onRowToggle('d', false));
    act(() => result.current.onRowToggle('b', false));
    expect(result.current.selectedIds).toEqual(['b', 'd']);
  });

  it('reports whether it handled a key', () => {
    const { result } = renderHook(() => useSelection(rows));
    let handled = false;
    act(() => {
      handled = result.current.onKey({ key: 'j' });
    });
    expect(handled).toBe(true);
    expect(result.current.state.focusedId).toBe('a');
    act(() => {
      handled = result.current.onKey({ key: 'x' });
    });
    expect(handled).toBe(true);
    act(() => {
      handled = result.current.onKey({ key: 'Escape' });
    });
    expect(handled).toBe(true);
    act(() => {
      handled = result.current.onKey({ key: 'Escape' });
    });
    expect(handled).toBe(false);
  });

  it('the hook drops selected ids that leave the order after a refetch and keeps focus nearby', () => {
    const { result, rerender } = renderHook(
      ({ order }: { order: readonly string[] }) => useSelection(order),
      { initialProps: { order: rows } }
    );
    act(() => result.current.onRowToggle('c', false));
    act(() => result.current.onRowToggle('d', true));

    rerender({ order: ['a', 'c', 'e'] });
    expect(result.current.selectedIds).toEqual(['c']);
    expect(result.current.state.anchorId).toBe('c');
    expect(result.current.state.focusedId).toBe('e');

    rerender({ order: ['a', 'c'] });
    expect(result.current.selectedIds).toEqual(['c']);
    expect(result.current.state.focusedId).toBe('c');
  });

  it('Shift-range across a filtered-out row selects only rows in the current order', () => {
    const { result } = renderHook(() => useSelection(['a', 'c', 'e']));
    act(() => result.current.onRowToggle('a', false));
    act(() => result.current.onRowToggle('e', true));
    expect(result.current.selectedIds).toEqual(['a', 'c', 'e']);
  });

  it('reconciles invalid initial state and handles an empty refetch', () => {
    const initial: SelectionState = {
      selected: new Set(['a', 'z']),
      anchorId: 'z',
      focusedId: 'z',
    };
    type SelectionProps = { order: readonly string[]; initial: SelectionState };
    const props: SelectionProps = { order: ['a'], initial };
    const { result, rerender } = renderHook<SelectionApi, SelectionProps>(
      ({ order, initial }: { order: readonly string[]; initial: SelectionState }) =>
        useSelection(order, initial),
      { initialProps: props }
    );
    expect(result.current.selectedIds).toEqual(['a']);
    expect(result.current.state.anchorId).toBeNull();
    expect(result.current.state.focusedId).toBe('a');

    rerender({ order: [], initial: EMPTY_SELECTION });
    expect(result.current.count).toBe(0);
    expect(result.current.state.focusedId).toBeNull();
  });
});
