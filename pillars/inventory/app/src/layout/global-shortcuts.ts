import { undoActiveToast } from '../foundation/feedback/undo-shortcut';
import { isTypingTarget } from '../foundation/shortcuts/shortcuts';

import type { ShortcutHandlers } from '../foundation/shortcuts/shortcut-provider';

/** Global navigation shortcuts that have a destination in the inventory app. */
export type GlobalDestinationId =
  | 'go-overview'
  | 'go-items'
  | 'go-containers'
  | 'go-locations'
  | 'go-in-hand'
  | 'go-activity'
  | 'go-sync'
  | 'go-types'
  | 'new-item'
  | 'bulk-entry';

/** Routes owned by each global inventory navigation shortcut. */
export const GLOBAL_DESTINATIONS: Readonly<Record<GlobalDestinationId, string>> = {
  'go-overview': '/inventory',
  'go-items': '/inventory/items',
  'go-containers': '/inventory/containers',
  'go-locations': '/inventory/locations',
  'go-in-hand': '/inventory/in-hand',
  'go-activity': '/inventory/sync?segment=activity',
  'go-sync': '/inventory/sync',
  'go-types': '/inventory/types',
  'new-item': '/inventory/items/new',
  'bulk-entry': '/inventory/items/bulk-new',
};

const DESTINATION_IDS: readonly GlobalDestinationId[] = [
  'go-overview',
  'go-items',
  'go-containers',
  'go-locations',
  'go-in-hand',
  'go-activity',
  'go-sync',
  'go-types',
  'new-item',
  'bulk-entry',
];

/** Dependencies for the global inventory shortcut handlers. */
export interface GlobalShortcutDeps {
  navigate: (to: string) => void;
  openShortcutSheet: () => void;
  /** Optional command-palette opener supplied by the palette feature. */
  openPalette?: () => void;
  /** Optional search focus supplied by the top-bar search feature. */
  focusSearch?: () => void;
}

/** Builds global handlers while leaving optional features unhandled until mounted. */
export function globalShortcutHandlers(deps: GlobalShortcutDeps): ShortcutHandlers {
  const handlers: ShortcutHandlers = {};
  for (const id of DESTINATION_IDS) {
    handlers[id] = () => {
      deps.navigate(GLOBAL_DESTINATIONS[id]);
      return true;
    };
  }
  handlers.shortcuts = () => {
    deps.openShortcutSheet();
    return true;
  };
  handlers.undo = undoActiveToast;
  handlers.dismiss = () => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !isTypingTarget(active)) return false;
    active.blur();
    return true;
  };
  if (deps.openPalette !== undefined) {
    handlers.palette = () => {
      deps.openPalette?.();
      return true;
    };
  }
  if (deps.focusSearch !== undefined) {
    handlers.search = () => {
      deps.focusSearch?.();
      return true;
    };
  }
  return handlers;
}
