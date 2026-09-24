/**
 * The custom sheet a person measured, remembered by this browser. It is a
 * per-browser convenience, so a missing, blocked or corrupt entry reads as
 * no custom sheet rather than an error.
 */
import { z } from 'zod';

import { sheetGeometryProblems } from './sheet-geometry';

import type { SheetGeometry } from './sheet-layouts';

export const CUSTOM_SHEET_STORAGE_KEY = 'pops.inventory.labels.custom-sheet';

const StoredSheet = z.object({
  columns: z.number(),
  rows: z.number(),
  labelWidthMm: z.number(),
  labelHeightMm: z.number(),
  marginTopMm: z.number(),
  marginLeftMm: z.number(),
  pitchXMm: z.number(),
  pitchYMm: z.number(),
}) satisfies z.ZodType<SheetGeometry>;

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Reads a stored sheet back, or null when it is absent or no longer printable. */
export function parseCustomSheet(raw: string | null): SheetGeometry | null {
  if (raw === null) return null;
  const parsed = StoredSheet.safeParse(parseJson(raw));
  if (!parsed.success) return null;
  return sheetGeometryProblems(parsed.data).length === 0 ? parsed.data : null;
}

/** The custom sheet this browser remembers, if any. */
export function loadCustomSheet(): SheetGeometry | null {
  try {
    return parseCustomSheet(window.localStorage.getItem(CUSTOM_SHEET_STORAGE_KEY));
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
