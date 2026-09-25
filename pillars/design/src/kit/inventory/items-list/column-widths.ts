/**
 * The item table's resizable columns: which exist, how narrow and wide each
 * may go, and how a drag, an arrow key or a double-click turns into a width.
 * Widths are pixels; a column with no width set keeps its default layout.
 */

/** A column the header can resize. Name fills what is left until resized. */
export type ColumnId = 'name' | 'type' | 'where' | 'code' | 'updated';

/** A column's allowed width range, in pixels. */
export interface ColumnLimits {
  min: number;
  max: number;
}

/** Every resizable column's limits, left to right. */
export const COLUMN_LIMITS: Readonly<Record<ColumnId, ColumnLimits>> = {
  name: { min: 160, max: 640 },
  type: { min: 72, max: 320 },
  where: { min: 96, max: 480 },
  code: { min: 64, max: 200 },
  updated: { min: 88, max: 200 },
};

/** Pixels one arrow-key press moves a column edge. */
export const KEYBOARD_STEP = 16;

/** Breathing room a fitted column keeps past its widest content. */
export const FIT_SLACK = 12;

/** User-set widths; a missing key means the column's default layout. */
export type ColumnWidths = Readonly<Partial<Record<ColumnId, number>>>;

/** Clamps a proposed width into the column's limits, whole pixels only. */
export function clampWidth(id: ColumnId, width: number): number {
  const { min, max } = COLUMN_LIMITS[id];
  return Math.round(Math.min(max, Math.max(min, width)));
}

/** The width a drag gives: where the edge started plus how far it moved. */
export function dragWidth(id: ColumnId, startWidth: number, deltaX: number): number {
  return clampWidth(id, startWidth + deltaX);
}

/** The width after one arrow-key press on a column edge. */
export function nudgeWidth(id: ColumnId, current: number, direction: -1 | 1): number {
  return clampWidth(id, current + direction * KEYBOARD_STEP);
}

/**
 * The width that shows the widest measured cell whole (header included).
 * With nothing measured the column goes back to its minimum rather than
 * guessing.
 */
export function fitWidth(id: ColumnId, measured: readonly number[]): number {
  const widest = measured.reduce((max, width) => Math.max(max, width), 0);
  if (widest <= 0) return COLUMN_LIMITS[id].min;
  return clampWidth(id, Math.ceil(widest) + FIT_SLACK);
}

/** The CSS custom property a column's cells read their width from. */
export function columnVar(id: ColumnId): `--col-${ColumnId}` {
  return `--col-${id}`;
}

/** Inline custom properties for the set widths, applied on the table. */
export function columnStyle(widths: ColumnWidths): Record<string, string> {
  const style: Record<string, string> = {};
  for (const [id, width] of Object.entries(widths)) {
    if (width !== undefined) style[`--col-${id}`] = `${width}px`;
  }
  return style;
}
