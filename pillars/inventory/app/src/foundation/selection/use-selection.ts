/**
 * The shared selection model for inventory lists: checkbox toggles, Shift
 * ranges, keyboard focus, and the selection keys used by every list.
 */
import { useCallback, useMemo, useState } from 'react';

/** The selected rows, Shift range anchor, and keyboard-focused row. */
export interface SelectionState {
  selected: ReadonlySet<string>;
  anchorId: string | null;
  focusedId: string | null;
}

/** An empty selection with no keyboard focus. */
export const EMPTY_SELECTION: SelectionState = {
  selected: new Set(),
  anchorId: null,
  focusedId: null,
};

/** Toggles one row and makes it the range anchor and focused row. */
export function toggle(state: SelectionState, id: string): SelectionState {
  const selected = new Set(state.selected);
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  return { selected, anchorId: id, focusedId: id };
}

/** Adds the current row-order range between the anchor and the target row. */
export function extendTo(
  state: SelectionState,
  id: string,
  order: readonly string[]
): SelectionState {
  const from = state.anchorId === null ? -1 : order.indexOf(state.anchorId);
  const to = order.indexOf(id);
  if (from === -1 || to === -1) return toggle(state, id);
  const selected = new Set(state.selected);
  for (const rowId of order.slice(Math.min(from, to), Math.max(from, to) + 1)) {
    selected.add(rowId);
  }
  return { selected, anchorId: state.anchorId, focusedId: id };
}

/** Selects every row in the current order while preserving valid focus. */
export function selectAll(state: SelectionState, order: readonly string[]): SelectionState {
  const focusedId =
    state.focusedId !== null && order.includes(state.focusedId)
      ? state.focusedId
      : (order[0] ?? null);
  return {
    selected: new Set(order),
    anchorId: order[0] ?? null,
    focusedId,
  };
}

/** Clears selected rows and the range anchor without moving keyboard focus. */
export function clear(state: SelectionState): SelectionState {
  return { selected: new Set(), anchorId: null, focusedId: state.focusedId };
}

/** Moves focus by a clamped row offset, starting at the first row if needed. */
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

/** Reconciles selected rows and focus after a refetch or filter changes order. */
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

/** The relationship between selected rows and the current loaded rows. */
export type SelectionCoverage = 'none' | 'some' | 'all';

/** Reports whether none, some, or all current rows are selected. */
export function coverageOf(state: SelectionState, order: readonly string[]): SelectionCoverage {
  const ticked = order.filter((id) => state.selected.has(id)).length;
  if (ticked === 0) return 'none';
  return ticked === order.length ? 'all' : 'some';
}

/** Returns selected ids in current row order, never click or Set insertion order. */
export function selectedInOrder(state: SelectionState, order: readonly string[]): string[] {
  return order.filter((id) => state.selected.has(id));
}

/** Keyboard input understood by the selection model. */
export interface SelectionKey {
  key: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
}

const FOCUS_STEPS: Readonly<Record<string, number>> = {
  j: 1,
  arrowdown: 1,
  k: -1,
  arrowup: -1,
};

function tickFocused(
  state: SelectionState,
  shift: boolean,
  order: readonly string[]
): SelectionState | null {
  if (state.focusedId === null) return null;
  return shift ? extendTo(state, state.focusedId, order) : toggle(state, state.focusedId);
}

/** Applies one selection key, or returns null so the event can fall through. */
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
  return key === 'x' ? tickFocused(state, event.shiftKey === true, order) : null;
}

/** The selection operations bound to one list's current order. */
export interface SelectionApi {
  state: SelectionState;
  count: number;
  coverage: SelectionCoverage;
  selectedIds: string[];
  isSelected: (id: string) => boolean;
  onRowToggle: (id: string, shiftKey: boolean) => void;
  onHeaderToggle: () => void;
  clearSelection: () => void;
  /** Wire to a list's onKeyDown; true means the caller should preventDefault. */
  onKey: (event: SelectionKey) => boolean;
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function sameState(left: SelectionState, right: SelectionState): boolean {
  if (left.anchorId !== right.anchorId || left.focusedId !== right.focusedId) return false;
  if (left.selected.size !== right.selected.size) return false;
  return [...left.selected].every((id) => right.selected.has(id));
}

/** Binds the pure selection rules to React state and reconciles order changes during render. */
export function useSelection(
  order: readonly string[],
  initial: SelectionState = EMPTY_SELECTION
): SelectionApi {
  const [state, setState] = useState(() => reconcile(initial, order, order));
  const [previousOrder, setPreviousOrder] = useState<readonly string[]>(() => [...order]);
  const changed = !sameOrder(previousOrder, order);
  const current = changed ? reconcile(state, previousOrder, order) : state;

  if (changed) {
    setPreviousOrder([...order]);
    if (!sameState(state, current)) setState(current);
  }

  const onRowToggle = useCallback(
    (id: string, shiftKey: boolean) =>
      setState((previous) => (shiftKey ? extendTo(previous, id, order) : toggle(previous, id))),
    [order]
  );
  const onHeaderToggle = useCallback(
    () =>
      setState((previous) =>
        coverageOf(previous, order) === 'all' ? clear(previous) : selectAll(previous, order)
      ),
    [order]
  );
  const clearSelection = useCallback(() => setState((previous) => clear(previous)), []);
  const onKey = useCallback(
    (event: SelectionKey) => {
      const next = applySelectionKey(current, event, order);
      if (next === null) return false;
      setState(next);
      return true;
    },
    [current, order]
  );
  const isSelected = useCallback((id: string) => current.selected.has(id), [current]);
  const selectedIds = selectedInOrder(current, order);
  return useMemo(
    () => ({
      state: current,
      count: selectedIds.length,
      coverage: coverageOf(current, order),
      selectedIds,
      isSelected,
      onRowToggle,
      onHeaderToggle,
      clearSelection,
      onKey,
    }),
    [current, selectedIds, order, isSelected, onRowToggle, onHeaderToggle, clearSelection, onKey]
  );
}
