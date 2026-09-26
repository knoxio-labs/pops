/**
 * Text measurements used by label layout. They estimate wrapping without a
 * renderer so print planning can stay deterministic and browser-independent.
 */
const MM_PER_PT = 25.4 / 72;
const AVERAGE_ADVANCE_EM = 0.62;
const NAME_LEADING = 1.15;

function lineMm(pt: number, leading: number): number {
  return pt * MM_PER_PT * leading;
}

/** The line height used when reserving space for a label name. */
export function nameLineHeight(pt: number): number {
  return lineMm(pt, NAME_LEADING);
}

/** Lines `text` wraps to at `pt` in a column `widthMm` wide, breaking between words. */
export function estimateLines(text: string, pt: number, widthMm: number): number {
  const perLine = Math.max(1, Math.floor(widthMm / (AVERAGE_ADVANCE_EM * pt * MM_PER_PT)));
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/u).filter(Boolean)) {
    const wanted = used === 0 ? word.length : used + 1 + word.length;
    if (wanted <= perLine) {
      used = wanted;
      continue;
    }
    lines += used === 0 ? 0 : 1;
    const overflow = Math.ceil(word.length / perLine) - 1;
    lines += overflow;
    used = word.length - overflow * perLine;
  }
  return lines;
}

/** The largest size, down to `minPt`, at which a name fits the box in `maxLines` lines. */
export function fitNamePt(
  name: string,
  box: { widthMm: number; heightMm: number },
  limits: { minPt: number; maxPt: number; maxLines: number }
): { pt: number; lines: number } {
  for (let pt = limits.maxPt; pt >= limits.minPt; pt -= 0.5) {
    const lines = estimateLines(name, pt, box.widthMm);
    if (lines <= limits.maxLines && lines * nameLineHeight(pt) <= box.heightMm) {
      return { pt, lines };
    }
  }
  const lines = Math.min(limits.maxLines, estimateLines(name, limits.minPt, box.widthMm));
  return { pt: limits.minPt, lines };
}

/** A list cut to the lines it has room for. */
export interface FittedList<T> {
  pt: number;
  shown: T[];
  more: number;
}

/** A list cut to `lines`, keeping the last line for "+N more" when some are left out. */
export function fitList<T>(items: readonly T[], lines: number, pt: number): FittedList<T> {
  const room = Math.max(0, lines);
  if (items.length <= room) return { pt, shown: [...items], more: 0 };
  const shown = items.slice(0, Math.max(0, room - 1));
  return { pt, shown, more: items.length - shown.length };
}
