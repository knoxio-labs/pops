/**
 * How one label's parts share its die-cut. Three arrangements: the QR alone,
 * filling the label; the QR beside a text column (the approved box and item
 * labels); and text alone across the whole label. A part shown alone is set
 * as large as the label allows; parts sharing it use the sheet's own scale,
 * and a list that runs out of room ends in "+N more" instead of overflowing.
 *
 * Sizes are estimates from average glyph widths, the same approach the code
 * sizing in `@pops/inventory/labels` takes; the renderer clips as a last
 * guard, so an estimate that runs long loses a line, never the next label.
 */
import { fitCodePt } from './code-fit.js';
import { MIN_QR_MM, templateFits, textWidthMm } from './sheet-layouts.js';

import type { LabelFieldValue, ResolvedLabel } from './label-content.js';
import type { PrintSubject } from './label-subject.js';
import type { SheetLayout } from './sheet-layouts.js';

const MM_PER_PT = 25.4 / 72;
const AVERAGE_ADVANCE_EM = 0.62;
const NAME_LEADING = 1.15;
const LIST_LEADING = 1.3;
const BLOCK_GAP_MM = 1;
const HERO_NAME_MAX_PT = 60;
const HERO_NAME_MAX_LINES = 4;
const HERO_CODE_MAX_PT = 96;
const TEXT_ONLY_BOOST = 1.25;
/** Share of the label a part shown alone may take, so it never touches the die-cut. */
const HERO_SHARE = 0.85;

/** How the label is divided. */
export type LabelArrangement = 'qr-fill' | 'qr-beside' | 'text';

/** A list cut to the lines it has room for. */
export interface FittedList<T> {
  pt: number;
  shown: T[];
  more: number;
}

/** One label, measured: where the QR goes and how big each text part is set. */
export interface LabelPlan {
  arrangement: LabelArrangement;
  /** The QR's side in millimetres, or null when the label has no QR. */
  qrMm: number | null;
  /** The name's size and the most lines it may take before it ends in an ellipsis. */
  name: { pt: number; lines: number } | null;
  code: { pt: number } | null;
  fields: FittedList<LabelFieldValue> | null;
  contents: FittedList<string> | null;
}

function floorToHalf(value: number): number {
  return Math.floor(value * 2) / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lineMm(pt: number, leading: number): number {
  return pt * MM_PER_PT * leading;
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
    if (lines <= limits.maxLines && lines * lineMm(pt, NAME_LEADING) <= box.heightMm) {
      return { pt, lines };
    }
  }
  const lines = Math.min(limits.maxLines, estimateLines(name, limits.minPt, box.widthMm));
  return { pt: limits.minPt, lines };
}

/** A list cut to `lines`, keeping the last line for "+N more" when some are left out. */
export function fitList<T>(items: readonly T[], lines: number, pt: number): FittedList<T> {
  const room = Math.max(0, lines);
  if (items.length <= room) return { pt, shown: [...items], more: 0 };
  const shown = items.slice(0, Math.max(0, room - 1));
  return { pt, shown, more: items.length - shown.length };
}

function innerBox(layout: SheetLayout): { widthMm: number; heightMm: number } {
  const pad = layout.scale.paddingMm * 2;
  return { widthMm: layout.labelWidthMm - pad, heightMm: layout.labelHeightMm - pad };
}

/** The side of a QR that fills the label on its own. */
export function fillQrMm(layout: SheetLayout): number {
  const inner = innerBox(layout);
  return floorToHalf(Math.min(inner.widthMm, inner.heightMm));
}

function hasText(label: ResolvedLabel): boolean {
  return label.parts.some((part) => part !== 'qr') || label.fields.length > 0;
}

function needsRoom(label: ResolvedLabel): boolean {
  return (
    label.parts.includes('name') || label.parts.includes('contents') || label.fields.length > 0
  );
}

/**
 * The parts a label keeps on this sheet. A QR beside text that the sheet
 * cannot fit steps down to the item label (QR and code), as the approved
 * box label did; null when the label wants a QR and no QR that scans fits.
 */
export function fitToSheet(label: ResolvedLabel, layout: SheetLayout): ResolvedLabel | null {
  if (!label.parts.includes('qr')) return label;
  if (!hasText(label)) return fillQrMm(layout) >= MIN_QR_MM ? label : null;
  if (templateFits(layout, needsRoom(label) ? 'container' : 'item')) return label;
  if (templateFits(layout, 'item')) {
    return { parts: ['qr', 'code'], fields: [], contents: [], fallback: label.fallback };
  }
  return null;
}

function soloPlan(label: ResolvedLabel, subject: PrintSubject, layout: SheetLayout): LabelPlan {
  const box = innerBox(layout);
  const base: LabelPlan = {
    arrangement: 'text',
    qrMm: null,
    name: null,
    code: null,
    fields: null,
    contents: null,
  };
  const listPt = clamp(floorToHalf(layout.scale.namePt), 7, 14);
  const listLines = Math.floor(box.heightMm / lineMm(listPt, LIST_LEADING));
  const [part] = label.parts;
  if (part === 'code') {
    const maxPt = Math.min(HERO_CODE_MAX_PT, floorToHalf((box.heightMm * 0.62) / MM_PER_PT));
    const widthMm = box.widthMm * HERO_SHARE;
    const pt = fitCodePt(subject.code ?? '', widthMm, maxPt, layout.scale.codeMinPt);
    return { ...base, code: { pt } };
  }
  if (part === 'name') {
    const hero = { widthMm: box.widthMm * HERO_SHARE, heightMm: box.heightMm * HERO_SHARE };
    const name = fitNamePt(subject.name, hero, {
      minPt: layout.scale.namePt,
      maxPt: HERO_NAME_MAX_PT,
      maxLines: HERO_NAME_MAX_LINES,
    });
    return { ...base, name };
  }
  if (part === 'contents') return { ...base, contents: fitList(label.contents, listLines, listPt) };
  return { ...base, fields: fitList(label.fields, listLines, listPt) };
}

function isSolo(label: ResolvedLabel): boolean {
  const textParts = label.parts.filter((part) => part !== 'qr').length;
  const blocks = textParts + (label.fields.length > 0 ? 1 : 0);
  return blocks === 1 && !label.parts.includes('qr');
}

function sharedPlan(label: ResolvedLabel, subject: PrintSubject, layout: SheetLayout): LabelPlan {
  const { scale } = layout;
  const withQr = label.parts.includes('qr');
  const boost = withQr ? 1 : TEXT_ONLY_BOOST;
  const box = innerBox(layout);
  const widthMm = withQr ? textWidthMm(layout) : box.widthMm;
  let heightMm = box.heightMm;
  let blocks = 0;
  const reserve = (mm: number): void => {
    heightMm -= mm + (blocks > 0 ? BLOCK_GAP_MM : 0);
    blocks += 1;
  };
  let name: LabelPlan['name'] = null;
  if (label.parts.includes('name')) {
    const pt = floorToHalf(scale.namePt * boost);
    const lines = Math.min(scale.nameLines, estimateLines(subject.name, pt, widthMm));
    name = { pt, lines: scale.nameLines };
    reserve(lines * lineMm(pt, NAME_LEADING));
  }
  let code: LabelPlan['code'] = null;
  if (label.parts.includes('code')) {
    const maxPt = floorToHalf(scale.codePt * boost);
    const pt = fitCodePt(subject.code ?? '', widthMm, maxPt, scale.codeMinPt);
    code = { pt };
    reserve(lineMm(pt, 1.1));
  }
  const listPt = clamp(floorToHalf(scale.namePt * 0.8 * boost), 6, 12);
  const gap = blocks > 0 ? BLOCK_GAP_MM : 0;
  let lines = Math.floor((heightMm - gap) / lineMm(listPt, LIST_LEADING));
  let fields: LabelPlan['fields'] = null;
  if (label.fields.length > 0) {
    fields = fitList(label.fields, lines, listPt);
    lines -= fields.shown.length + (fields.more > 0 ? 1 : 0);
  }
  const contents = label.parts.includes('contents') ? fitList(label.contents, lines, listPt) : null;
  return {
    arrangement: withQr ? 'qr-beside' : 'text',
    qrMm: withQr ? scale.qrMm : null,
    name,
    code,
    fields,
    contents,
  };
}

/** The measured label for one item on this sheet; call {@link fitToSheet} first. */
export function planLabel(
  label: ResolvedLabel,
  subject: PrintSubject,
  layout: SheetLayout
): LabelPlan {
  if (label.parts.includes('qr') && !hasText(label)) {
    return {
      arrangement: 'qr-fill',
      qrMm: fillQrMm(layout),
      name: null,
      code: null,
      fields: null,
      contents: null,
    };
  }
  return isSolo(label) ? soloPlan(label, subject, layout) : sharedPlan(label, subject, layout);
}
