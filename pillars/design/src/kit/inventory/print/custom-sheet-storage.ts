/**
 * The custom sheet a person measured, remembered by this browser. It is a
 * per-browser convenience, so a missing, blocked or corrupt entry reads as
 * no custom sheet rather than an error.
 */
import { parseSheetGeometry } from '@pops/inventory/labels';

import type { SheetGeometry } from '@pops/inventory/labels';

export const CUSTOM_SHEET_STORAGE_KEY = 'pops.inventory.labels.custom-sheet';

/** The custom sheet this browser remembers, if any. */
export function loadCustomSheet(): SheetGeometry | null {
  try {
    return parseSheetGeometry(window.localStorage.getItem(CUSTOM_SHEET_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Remembers a custom sheet in this browser; a browser that refuses storage just forgets it. */
export function storeCustomSheet(geometry: SheetGeometry): void {
  try {
    window.localStorage.setItem(CUSTOM_SHEET_STORAGE_KEY, JSON.stringify(geometry));
  } catch {
    return;
  }
}
