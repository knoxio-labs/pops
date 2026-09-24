/**
 * What this browser remembers between label jobs: the custom sheet a person
 * measured, the sheet they last printed on, and where each sheet's free
 * labels begin. All of it is a per-browser convenience, so a missing,
 * blocked or corrupt entry reads as nothing remembered, never as an error.
 */
import { parseSheetGeometry } from '@pops/inventory/labels';

import type { SheetGeometry } from '@pops/inventory/labels';

export const CUSTOM_SHEET_STORAGE_KEY = 'pops.inventory.labels.custom-sheet';
export const SHEET_STORAGE_KEY = 'pops.inventory.labels.sheet';
export const START_STORAGE_PREFIX = 'pops.inventory.labels.start.';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    return;
  }
}

/** The custom sheet this browser remembers, if any. */
export function loadCustomSheet(): SheetGeometry | null {
  return parseSheetGeometry(read(CUSTOM_SHEET_STORAGE_KEY));
}

/** Remembers a custom sheet in this browser. */
export function storeCustomSheet(geometry: SheetGeometry): void {
  write(CUSTOM_SHEET_STORAGE_KEY, JSON.stringify(geometry));
}

/** The sheet this browser last printed on, if any. */
export function loadSheetId(): string | null {
  return read(SHEET_STORAGE_KEY);
}

export function storeSheetId(id: string): void {
  write(SHEET_STORAGE_KEY, id);
}

/** The label a sheet's next job starts on, as this browser last confirmed it; 1 when unknown. */
export function loadStartAt(sheetId: string): number {
  const stored = Number(read(`${START_STORAGE_PREFIX}${sheetId}`));
  return Number.isInteger(stored) && stored >= 1 ? stored : 1;
}

export function storeStartAt(sheetId: string, startAt: number): void {
  write(`${START_STORAGE_PREFIX}${sheetId}`, String(startAt));
}
