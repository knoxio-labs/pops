/**
 * Every inventory keyboard shortcut, as data (spec section 2.5). The sheet,
 * the button hints and the palette read this one list, so a shortcut that is
 * not here does not exist and one that is here cannot go unadvertised.
 */

/** Where a binding is live. `palette` is modal: global bindings do not reach it. */
export type ShortcutScope = 'global' | 'list' | 'detail' | 'form' | 'palette';

/** One binding: a sequence of combos (`['g', 'i']`) or a single combo (`['Mod+k']`). */
export interface ShortcutBinding {
  id: string;
  scope: ShortcutScope;
  sequence: readonly string[];
  label: string;
  /** The global binding this one deliberately replaces inside its scope. */
  shadows?: string;
}

const b = (id: string, scope: ShortcutScope, sequence: string, label: string): ShortcutBinding => ({
  id,
  scope,
  sequence: sequence.split(' '),
  label,
});

const GLOBAL: readonly ShortcutBinding[] = [
  b('palette', 'global', 'Mod+k', 'Open the command palette'),
  b('search', 'global', '/', 'Search inventory'),
  b('new-item', 'global', 'n', 'New item'),
  b('bulk-entry', 'global', 'Shift+n', 'Bulk entry'),
  b('go-overview', 'global', 'g o', 'Go to Overview'),
  b('go-items', 'global', 'g i', 'Go to Items'),
  b('go-containers', 'global', 'g c', 'Go to Containers'),
  b('go-locations', 'global', 'g l', 'Go to Locations'),
  b('go-in-hand', 'global', 'g h', 'Go to In hand'),
  b('go-activity', 'global', 'g a', 'Go to Activity'),
  b('go-sync', 'global', 'g s', 'Go to Sync'),
  b('go-types', 'global', 'g t', 'Go to Types'),
  b('shortcuts', 'global', '?', 'Show keyboard shortcuts'),
  b('undo', 'global', 'Mod+z', 'Undo, while its toast shows'),
  b('dismiss', 'global', 'Escape', 'Close, clear selection or leave the field'),
];

const LIST: readonly ShortcutBinding[] = [
  b('list-down', 'list', 'j', 'Next row'),
  b('list-up', 'list', 'k', 'Previous row'),
  b('list-toggle', 'list', 'x', 'Select or unselect row'),
  b('list-extend', 'list', 'Shift+x', 'Extend selection to row'),
  b('list-all', 'list', 'Mod+a', 'Select all loaded rows'),
  b('list-open', 'list', 'Enter', 'Open'),
  b('list-peek', 'list', 'Space', 'Peek'),
  b('pick-up', 'list', 'p', 'Pick up'),
  b('put-back', 'list', 'b', 'Put back where it came from'),
  b('move', 'list', 'm', 'Move'),
  b('take-out', 'list', 't', 'Take out of this container'),
  b('label', 'list', 'l', 'Print labels'),
  b('list-edit', 'list', 'e', 'Edit'),
  b('row-menu', 'list', '.', 'Row menu'),
  b('copy-code', 'list', 'Mod+Shift+c', 'Copy code'),
];

const DETAIL: readonly ShortcutBinding[] = [
  b('detail-edit', 'detail', 'e', 'Edit'),
  b('detail-place', 'detail', 'p', 'Pick up or put back'),
  b('detail-move', 'detail', 'm', 'Move'),
  b('detail-open-close', 'detail', 'o', 'Open or close container'),
  b('detail-copy-code', 'detail', 'c', 'Copy code'),
  b('detail-history', 'detail', 'h', 'History'),
  b('detail-previous', 'detail', '[', 'Previous item'),
  b('detail-next', 'detail', ']', 'Next item'),
  b('detail-tab-1', 'detail', '1', 'First tab'),
  b('detail-tab-2', 'detail', '2', 'Second tab'),
  b('detail-tab-3', 'detail', '3', 'Third tab'),
];

const FORM: readonly ShortcutBinding[] = [
  b('form-save', 'form', 'Mod+Enter', 'Save'),
  b('form-save-new', 'form', 'Mod+Shift+Enter', 'Save and start another'),
  { ...b('form-cancel', 'form', 'Escape', 'Cancel, asking only if changed'), shadows: 'dismiss' },
  b('form-accept-code', 'form', 'Enter', 'Accept the suggested code'),
];

const PALETTE: readonly ShortcutBinding[] = [
  b('palette-down', 'palette', 'ArrowDown', 'Next result'),
  b('palette-up', 'palette', 'ArrowUp', 'Previous result'),
  b('palette-run', 'palette', 'Enter', 'Run or open'),
  b('palette-beside', 'palette', 'Mod+Enter', 'Open in the preview pane'),
  b('palette-scope', 'palette', 'Tab', 'Switch Inventory and Purchases'),
  b('palette-back', 'palette', 'Backspace', 'Back one step from an empty query'),
  b('palette-close', 'palette', 'Escape', 'Close'),
];

/** The registry. Order within a scope is the order the sheet lists them. */
export const SHORTCUTS: readonly ShortcutBinding[] = [
  ...GLOBAL,
  ...LIST,
  ...DETAIL,
  ...FORM,
  ...PALETTE,
];

/** Headings the shortcut sheet groups scopes under. */
export const SCOPE_TITLES: Readonly<Record<ShortcutScope, string>> = {
  global: 'Anywhere in Inventory',
  list: 'Lists',
  detail: 'Item page',
  form: 'Item form',
  palette: 'Command palette',
};
