/**
 * Every inventory keyboard shortcut, as data. The provider, hints, sheet and
 * future command surfaces all read this registry, so one key has one meaning.
 */

/** Where a binding is live. `palette` is modal: global bindings do not reach it. */
export type ShortcutScope = 'global' | 'list' | 'detail' | 'form' | 'palette';

/** One registered shortcut, including the key sequence shown to users. */
export interface ShortcutBinding {
  id: string;
  scope: ShortcutScope;
  sequence: readonly string[];
  label: string;
  /** The global binding this one deliberately replaces inside its scope. */
  shadows?: string;
}

const binding = (
  id: string,
  scope: ShortcutScope,
  sequence: string,
  label: string
): ShortcutBinding => ({
  id,
  scope,
  sequence: sequence.split(' '),
  label,
});

const GLOBAL: readonly ShortcutBinding[] = [
  binding('palette', 'global', 'Mod+k', 'Open the command palette'),
  binding('search', 'global', '/', 'Search inventory'),
  binding('new-item', 'global', 'n', 'New item'),
  binding('bulk-entry', 'global', 'Shift+n', 'Bulk entry'),
  binding('go-overview', 'global', 'g o', 'Go to Overview'),
  binding('go-items', 'global', 'g i', 'Go to Items'),
  binding('go-containers', 'global', 'g c', 'Go to Containers'),
  binding('go-locations', 'global', 'g l', 'Go to Locations'),
  binding('go-in-hand', 'global', 'g h', 'Go to In hand'),
  binding('go-activity', 'global', 'g a', 'Go to Activity'),
  binding('go-sync', 'global', 'g s', 'Go to Sync'),
  binding('go-types', 'global', 'g t', 'Go to Types'),
  binding('shortcuts', 'global', '?', 'Show keyboard shortcuts'),
  binding('undo', 'global', 'Mod+z', 'Undo, while its toast shows'),
  binding('dismiss', 'global', 'Escape', 'Close, clear selection or leave the field'),
];

const LIST: readonly ShortcutBinding[] = [
  binding('list-down', 'list', 'j', 'Next row'),
  binding('list-up', 'list', 'k', 'Previous row'),
  binding('list-toggle', 'list', 'x', 'Select or unselect row'),
  binding('list-extend', 'list', 'Shift+x', 'Extend selection to row'),
  binding('list-all', 'list', 'Mod+a', 'Select all loaded rows'),
  binding('list-open', 'list', 'Enter', 'Open'),
  binding('list-peek', 'list', 'Space', 'Peek'),
  binding('pick-up', 'list', 'p', 'Pick up'),
  binding('put-back', 'list', 'b', 'Put back where it came from'),
  binding('move', 'list', 'm', 'Move'),
  binding('take-out', 'list', 't', 'Take out of this container'),
  binding('label', 'list', 'l', 'Print labels'),
  binding('list-edit', 'list', 'e', 'Edit'),
  binding('row-menu', 'list', '.', 'Row menu'),
  binding('copy-code', 'list', 'Mod+Shift+c', 'Copy code'),
];

const DETAIL: readonly ShortcutBinding[] = [
  binding('detail-edit', 'detail', 'e', 'Edit'),
  binding('detail-place', 'detail', 'p', 'Pick up or put back'),
  binding('detail-move', 'detail', 'm', 'Move'),
  binding('detail-open-close', 'detail', 'o', 'Open or close container'),
  binding('detail-copy-code', 'detail', 'c', 'Copy code'),
  binding('detail-history', 'detail', 'h', 'History'),
  binding('detail-previous', 'detail', '[', 'Previous item'),
  binding('detail-next', 'detail', ']', 'Next item'),
  binding('detail-tab-1', 'detail', '1', 'First tab'),
  binding('detail-tab-2', 'detail', '2', 'Second tab'),
  binding('detail-tab-3', 'detail', '3', 'Third tab'),
];

const FORM: readonly ShortcutBinding[] = [
  binding('form-save', 'form', 'Mod+Enter', 'Save'),
  binding('form-save-new', 'form', 'Mod+Shift+Enter', 'Save and start another'),
  {
    ...binding('form-cancel', 'form', 'Escape', 'Cancel, asking only if changed'),
    shadows: 'dismiss',
  },
  binding('form-accept-code', 'form', 'Enter', 'Accept the suggested code'),
];

const PALETTE: readonly ShortcutBinding[] = [
  binding('palette-down', 'palette', 'ArrowDown', 'Next result'),
  binding('palette-up', 'palette', 'ArrowUp', 'Previous result'),
  binding('palette-run', 'palette', 'Enter', 'Run or open'),
  binding('palette-beside', 'palette', 'Mod+Enter', 'Open in the preview pane'),
  binding('palette-scope', 'palette', 'Tab', 'Switch Inventory and Purchases'),
  binding('palette-back', 'palette', 'Backspace', 'Back one step from an empty query'),
  binding('palette-close', 'palette', 'Escape', 'Close'),
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
