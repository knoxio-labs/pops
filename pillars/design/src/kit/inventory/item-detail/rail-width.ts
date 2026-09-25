/** Narrowest the facts rail may go, in pixels: a photo and a fact row still fit. */
export const RAIL_MIN = 240;
/** Widest the facts rail may go before the tabs lose their room. */
export const RAIL_MAX = 480;
/** The rail's width until someone drags it, and what double-click restores. */
export const RAIL_DEFAULT = 288;
/** Pixels one arrow-key press moves the split. */
export const RAIL_STEP = 16;

/** Clamps a proposed rail width into range, whole pixels only. */
export function clampRail(width: number): number {
  return Math.round(Math.min(RAIL_MAX, Math.max(RAIL_MIN, width)));
}

/** The rail width a drag or arrow key asks for, from where it started. */
export function moveRail(startWidth: number, deltaX: number): number {
  return clampRail(startWidth + deltaX);
}
