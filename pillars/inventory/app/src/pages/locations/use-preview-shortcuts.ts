import { useShortcutScope } from '../../foundation/shortcuts/shortcut-provider.js';

import type { SelectionApi } from '../../foundation/selection/use-selection.js';
import type { ContentsVerbState } from '../location-page/location-page-content-verbs.js';

function isPreviewShortcut(event: globalThis.KeyboardEvent): boolean {
  const target = event.target;
  return target instanceof HTMLElement && target.closest('[data-location-preview]') !== null;
}

/** Binds list shortcuts to the selected-place preview without stealing tree focus. */
export function usePreviewShortcuts({
  selection,
  order,
  itemActions,
  onOpenItem,
}: {
  selection: SelectionApi;
  order: readonly string[];
  itemActions: ContentsVerbState;
  onOpenItem: (id: string, ids: readonly string[]) => void;
}): void {
  useShortcutScope('list', {
    'list-open': (event) => {
      if (!isPreviewShortcut(event)) return false;
      const id = selection.state.focusedId ?? selection.selectedIds[0];
      if (id === undefined) return false;
      onOpenItem(id, order);
      return true;
    },
    'pick-up': (event) => {
      if (!isPreviewShortcut(event) || selection.count === 0) return false;
      itemActions.verbs.pickUp(selection.selectedIds);
      return true;
    },
    move: (event) => {
      if (!isPreviewShortcut(event) || selection.count === 0) return false;
      itemActions.verbs.startMove(selection.selectedIds);
      return true;
    },
    'take-out': (event) => {
      if (!isPreviewShortcut(event) || selection.count === 0) return false;
      itemActions.verbs.takeOut(selection.selectedIds);
      return true;
    },
    dismiss: (event) => {
      if (!isPreviewShortcut(event) || selection.count === 0) return false;
      selection.clearSelection();
      return true;
    },
  });
}
