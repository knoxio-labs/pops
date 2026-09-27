import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { listTrailState } from '../../inventory-web/list-trail.js';
import { useShortcutScope } from '../shortcuts/shortcut-provider.js';

import type { ItemRowModel } from '../model/contracts.js';
import type { SelectionApi } from '../selection/use-selection.js';
import type { ShortcutHandlers } from '../shortcuts/shortcut-provider.js';

/** Inputs for the one list shortcut scope owned by a list page. */
export interface ListPageKeysInput {
  rows: readonly ItemRowModel[];
  selection: SelectionApi;
  /** Page-specific handlers are merged after the shared list handlers. */
  extra?: ShortcutHandlers;
  /** Carries the currently loaded rows to item detail when Enter opens a row. */
  trail?: { listName: 'Items' | 'Containers' };
}

/** Registers open, edit, copy-code, and dismiss handlers for one list page. */
export function useListPageKeys({ rows, selection, extra, trail }: ListPageKeysInput): void {
  const location = useLocation();
  const navigate = useNavigate();
  const listName = trail?.listName;
  const openFocused = useCallback(
    (event: KeyboardEvent): boolean => {
      if (
        !(event.target instanceof HTMLElement) ||
        event.target.closest('[role="grid"]') === null
      ) {
        return false;
      }
      const id = selection.state.focusedId;
      if (id === null) return false;
      const state =
        listName === undefined
          ? undefined
          : {
              state: listTrailState({
                listName,
                href: `${location.pathname}${location.search}`,
                ids: rows.map((row) => row.id),
              }),
            };
      void navigate(`/inventory/items/${id}`, state);
      return true;
    },
    [listName, location.pathname, location.search, navigate, rows, selection.state.focusedId]
  );
  const editFocused = useCallback((): boolean => {
    const id = selection.state.focusedId;
    if (id === null) return false;
    void navigate(`/inventory/items/${id}/edit`);
    return true;
  }, [navigate, selection.state.focusedId]);
  const copyFocusedCode = useCallback((): boolean => {
    const id = selection.state.focusedId;
    const code = rows.find((row) => row.id === id)?.code;
    if (id === null || code === null || code === undefined) return false;
    const write = navigator.clipboard?.writeText;
    if (write !== undefined) void write.call(navigator.clipboard, code);
    return true;
  }, [rows, selection.state.focusedId]);
  const dismiss = useCallback((): boolean => {
    if (selection.count === 0) return false;
    selection.clearSelection();
    return true;
  }, [selection]);
  const handlers = useMemo<ShortcutHandlers>(
    () => ({
      'list-open': openFocused,
      'list-edit': editFocused,
      'copy-code': copyFocusedCode,
      dismiss,
      ...extra,
    }),
    [copyFocusedCode, dismiss, editFocused, extra, openFocused]
  );

  useShortcutScope('list', handlers);
}
