/**
 * The one selection model every inventory list uses: checkbox toggle,
 * Shift-extend from an anchor, `x`, Cmd-A, `j`/`k` focus, Esc to clear.
 * Pure functions over ids first, a hook on top, so the rules are testable
 * without a DOM and identical on every list.
 */
import { useCallback, useMemo, useState } from 'react';

/** Which rows are ticked, where a Shift-extend measures from, and which row has focus. */
export interface SelectionState {
  selected: ReadonlySet<string>;
  anchorId: string | null;
  focusedId: string | null;
}

/** Nothing ticked, nothing focused. */
export const EMPTY_SELECTION: SelectionState = {
  selected: new Set(),
  anchorId: null,
  focusedId: null,
};

/** Flips one row and makes it the anchor and the focus. */
export function toggle(state: SelectionState, id: string): SelectionState {
  const selected = new Set(state.selected);
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  return { selected, anchorId: id, focusedId: id };
}

/** Adds everything between the anchor and `id`; an extension never removes rows. */
export function extendTo(
  state: SelectionState,
  id: string,
  order: readonly string[]
): SelectionState {
  const from = state.anchorId === null ? -1 : order.indexOf(state.anchorId);
  const to = order.indexOf(id);
  if (from === -1 || to === -1) return toggle(state, id);
  const selected = new Set(state.selected);
  for (const rowId of order.slice(Math.min(from, to), Math.max(from, to) + 1)) selected.add(rowId);
  return { selected, anchorId: state.anchorId, focusedId: id };
}

/** Ticks every loaded row. */
export function selectAll(state: SelectionState, order: readonly string[]): SelectionState {
  return {
    selected: new Set(order),
    anchorId: order[0] ?? null,
    focusedId: state.focusedId ?? order[0] ?? null,
  };
}

/** Unticks everything; focus stays where it was. */
export function clear(state: SelectionState): SelectionState {
  return { selected: new Set(), anchorId: null, focusedId: state.focusedId };
}

/** Moves focus by `delta` rows, clamped to the list. Focus lands on the first row when there is none. */
export function moveFocus(
  state: SelectionState,
  delta: number,
  order: readonly string[]
): SelectionState {
  if (order.length === 0) return { ...state, focusedId: null };
  const current = state.focusedId === null ? -1 : order.indexOf(state.focusedId);
  const next = current === -1 ? 0 : Math.min(order.length - 1, Math.max(0, current + delta));
  return { ...state, focusedId: order[next] ?? null };
}

/**
 * Keeps the state honest after a refetch or a filter: rows that left the
 * list leave the selection, and focus moves to the nearest surviving row
 * rather than jumping to the top.
 */
export function reconcile(
  state: SelectionState,
  previousOrder: readonly string[],
  order: readonly string[]
): SelectionState {
  const present = new Set(order);
  const selected = new Set([...state.selected].filter((id) => present.has(id)));
  const anchorId = state.anchorId !== null && present.has(state.anchorId) ? state.anchorId : null;
  if (state.focusedId === null || present.has(state.focusedId)) {
    return { selected, anchorId, focusedId: state.focusedId };
  }
  const was = previousOrder.indexOf(state.focusedId);
  const survivor = previousOrder.slice(was + 1).find((id) => present.has(id));
  const before = previousOrder.slice(0, Math.max(0, was)).findLast((id) => present.has(id));
  return { selected, anchorId, focusedId: survivor ?? before ?? null };
}

/** Whether none, some or all of the loaded rows are ticked, for the header checkbox. */
export type SelectionCoverage = 'none' | 'some' | 'all';

/** Coverage of the loaded rows. */
export function coverageOf(state: SelectionState, order: readonly string[]): SelectionCoverage {
  const ticked = order.filter((id) => state.selected.has(id)).length;
  if (ticked === 0) return 'none';
  return ticked === order.length ? 'all' : 'some';
}

/** Ticked ids in list order, not click order. */
export function selectedInOrder(state: SelectionState, order: readonly string[]): string[] {
  return order.filter((id) => state.selected.has(id));
}

/** The subset of a keyboard event the model reads. */
export interface SelectionKey {
  key: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
}

const FOCUS_STEPS: Readonly<Record<string, number>> = { j: 1, arrowdown: 1, k: -1, arrowup: -1 };

function applyTickKey(
  state: SelectionState,
  shift: boolean,
  order: readonly string[]
): SelectionState | null {
  if (state.focusedId === null) return null;
  return shift ? extendTo(state, state.focusedId, order) : toggle(state, state.focusedId);
}

/** Applies one list key; returns null when the key is not a selection key. */
export function applySelectionKey(
  state: SelectionState,
  event: SelectionKey,
  order: readonly string[]
): SelectionState | null {
  const key = event.key.toLowerCase();
  if (event.metaKey === true || event.ctrlKey === true) {
    return key === 'a' ? selectAll(state, order) : null;
  }
  const step = FOCUS_STEPS[key];
  if (step !== undefined) return moveFocus(state, step, order);
  if (key === 'escape') return state.selected.size > 0 ? clear(state) : null;
  return key === 'x' ? applyTickKey(state, event.shiftKey === true, order) : null;
}

/** What {@link useSelection} hands a list. */
export interface SelectionApi {
  state: SelectionState;
  count: number;
  coverage: SelectionCoverage;
  selectedIds: string[];
  isSelected: (id: string) => boolean;
  /** A row's checkbox or click; Shift extends from the anchor. */
  onRowToggle: (id: string, shiftKey: boolean) => void;
  onHeaderToggle: () => void;
  clearSelection: () => void;
  /** Wire to the list's `onKeyDown`; returns true when the key was handled. */
  onKey: (event: SelectionKey) => boolean;
}

/** The selection model bound to one list's current row order. */
export function useSelection(
  order: readonly string[],
  initial: SelectionState = EMPTY_SELECTION
): SelectionApi {
  const [state, setState] = useState(initial);
  const onRowToggle = useCallback(
    (id: string, shiftKey: boolean) =>
      setState((current) => (shiftKey ? extendTo(current, id, order) : toggle(current, id))),
    [order]
  );
  const onHeaderToggle = useCallback(
    () =>
      setState((current) =>
        coverageOf(current, order) === 'all' ? clear(current) : selectAll(current, order)
      ),
    [order]
  );
  const onKey = useCallback(
    (event: SelectionKey) => {
      const next = applySelectionKey(state, event, order);
      if (next === null) return false;
      setState(next);
      return true;
    },
    [state, order]
  );
  return useMemo(
    () => ({
      state,
      count: state.selected.size,
      coverage: coverageOf(state, order),
      selectedIds: selectedInOrder(state, order),
      isSelected: (id: string) => state.selected.has(id),
      onRowToggle,
      onHeaderToggle,
      clearSelection: () => setState(clear),
      onKey,
    }),
    [state, order, onRowToggle, onHeaderToggle, onKey]
  );
}
