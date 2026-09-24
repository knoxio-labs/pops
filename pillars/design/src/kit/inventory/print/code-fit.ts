/**
 * Sizing for the printed inventory code. The code is what a person types when
 * the QR will not scan, so it is never truncated: it shrinks to fit its line
 * and only wraps below the layout's minimum size.
 */

const MM_PER_PT = 25.4 / 72;

/** Advance width of one monospace character, as a fraction of its point size. */
const MONO_ADVANCE_EM = 0.6;

/** Point size that fits `code` on one line `widthMm` wide, capped at `maxPt` and floored at `minPt`. */
export function fitCodePt(code: string, widthMm: number, maxPt: number, minPt: number): number {
  if (minPt > maxPt) throw new RangeError(`minimum ${minPt}pt is above maximum ${maxPt}pt`);
  if (code.length === 0) return maxPt;
  const fitting = widthMm / (code.length * MONO_ADVANCE_EM * MM_PER_PT);
  return Math.min(maxPt, Math.max(minPt, Math.floor(fitting * 2) / 2));
}

/** Whether `code` fits on one line at `pt` within `widthMm`. */
export function codeFitsOneLine(code: string, widthMm: number, pt: number): boolean {
  return code.length * MONO_ADVANCE_EM * pt * MM_PER_PT <= widthMm;
}
