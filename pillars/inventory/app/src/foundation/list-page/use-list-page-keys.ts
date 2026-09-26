import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';

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
}

/** Registers open, edit, copy-code, and dismiss handlers for one list page. */
export function useListPageKeys({ rows, selection, extra }: ListPageKeysInput): void {
  const navigate = useNavigate();
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
      void navigate(`/inventory/items/${id}`);
      return true;
    },
    [navigate, selection.state.focusedId]
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
