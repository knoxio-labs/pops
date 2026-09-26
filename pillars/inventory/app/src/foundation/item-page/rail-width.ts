/** The narrowest width that keeps the facts rail readable. */
export const RAIL_MIN = 240;

/** The widest width before the tab pane loses useful room. */
export const RAIL_MAX = 480;

/** The initial width and the width restored by reset gestures. */
export const RAIL_DEFAULT = 288;

/** The number of pixels moved by one keyboard step. */
export const RAIL_STEP = 16;

/** Clamps a proposed rail width to the supported whole-pixel range. */
export function clampRail(width: number): number {
  return Math.round(Math.min(RAIL_MAX, Math.max(RAIL_MIN, width)));
}

/** Applies a horizontal drag or keyboard delta to a starting rail width. */
export function moveRail(startWidth: number, deltaX: number): number {
  return clampRail(startWidth + deltaX);
}
