/** A column the header can resize. */
export type ColumnId = 'name' | 'type' | 'where' | 'code' | 'updated';

/** The minimum and maximum width allowed for a column, in pixels. */
export interface ColumnLimits {
  min: number;
  max: number;
}

/** The width limits for every resizable item-table column. */
export const COLUMN_LIMITS: Readonly<Record<ColumnId, ColumnLimits>> = {
  name: { min: 160, max: 640 },
  type: { min: 72, max: 320 },
  where: { min: 96, max: 480 },
  code: { min: 64, max: 200 },
  updated: { min: 88, max: 200 },
};

/** The number of pixels moved by one keyboard nudge. */
export const KEYBOARD_STEP = 16;

/** The extra space added when fitting a column to its widest cell. */
export const FIT_SLACK = 12;

/** Widths explicitly set by the user; omitted columns keep their defaults. */
export type ColumnWidths = Readonly<Partial<Record<ColumnId, number>>>;

/** Clamps a proposed width to the column limits and rounds it to a pixel. */
export function clampWidth(id: ColumnId, width: number): number {
  const { min, max } = COLUMN_LIMITS[id];
  return Math.round(Math.min(max, Math.max(min, width)));
}

/** Returns the width produced by moving a column edge by a horizontal delta. */
export function dragWidth(id: ColumnId, startWidth: number, deltaX: number): number {
  return clampWidth(id, startWidth + deltaX);
}

/** Returns the width produced by one left or right keyboard nudge. */
export function nudgeWidth(id: ColumnId, current: number, direction: -1 | 1): number {
  return clampWidth(id, current + direction * KEYBOARD_STEP);
}

/** Fits a column to its widest measured cell, with slack and the column limits. */
export function fitWidth(id: ColumnId, measured: readonly number[]): number {
  const widest = measured.reduce((max, width) => Math.max(max, width), 0);
  if (widest <= 0) return COLUMN_LIMITS[id].min;
  return clampWidth(id, Math.ceil(widest) + FIT_SLACK);
}

/** Returns the CSS custom-property name for a column. */
export function columnVar(id: ColumnId): `--col-${ColumnId}` {
  return `--col-${id}`;
}

/** Builds inline custom properties for the widths that have been set. */
export function columnStyle(widths: ColumnWidths): Record<string, string> {
  const style: Record<string, string> = {};
  for (const [id, width] of Object.entries(widths)) {
    if (width !== undefined) style[`--col-${id}`] = `${width}px`;
  }
  return style;
}
