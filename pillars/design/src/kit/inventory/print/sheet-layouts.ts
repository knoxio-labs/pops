/**
 * Adhesive A4 label sheets and the arithmetic that places labels on them.
 *
 * Every dimension is in millimetres and comes from the sheet manufacturer's
 * template (Avery L7165, L7163 and L7160, and the compatible sheets sold
 * under the same sizes), because a label printed 1 mm off the die-cut is a
 * label cut in half. Labels are numbered the way the sheets are: left to
 * right across a row, then down.
 */

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

/**
 * The smallest printed QR module this page will produce. Phone cameras read
 * 0.5 mm modules reliably at arm's length from office laser and inkjet
 * output; below that, toner spread and a slightly curved box side start to
 * cost reads. Every layout's QR is sized so the densest POPS item URI stays
 * above it.
 */
export const MIN_QR_MODULE_MM = 0.5;

/** Type sizes and QR size for one label size, in points and millimetres. */
export interface LabelScale {
  paddingMm: number;
  qrMm: number;
  namePt: number;
  /** Lines the name may take before it ends in an ellipsis. */
  nameLines: number;
  codePt: number;
  /** The smallest the code may shrink to; it never truncates. */
  codeMinPt: number;
  placePt: number;
}

/** One adhesive A4 sheet: its grid, die-cut geometry and label type scale. */
export interface SheetLayout {
  id: SheetLayoutId;
  /** The manufacturer's size code printed on the sheet's packaging. */
  sizeCode: string;
  columns: number;
  rows: number;
  labelWidthMm: number;
  labelHeightMm: number;
  marginTopMm: number;
  marginLeftMm: number;
  /** Distance from one label's left edge to the next one's. */
  pitchXMm: number;
  /** Distance from one label's top edge to the next one's. */
  pitchYMm: number;
  cornerMm: number;
  scale: LabelScale;
}

/** The three sheets the page offers, named by labels per sheet. */
export type SheetLayoutId = 'a4-8' | 'a4-14' | 'a4-21';

/** 8, 14 and 21 labels per A4 sheet, largest first. */
export const SHEET_LAYOUTS: readonly SheetLayout[] = [
  {
    id: 'a4-8',
    sizeCode: 'L7165',
    columns: 2,
    rows: 4,
    labelWidthMm: 99.1,
    labelHeightMm: 67.7,
    marginTopMm: 13.1,
    marginLeftMm: 4.65,
    pitchXMm: 101.6,
    pitchYMm: 67.7,
    cornerMm: 3,
    scale: {
      paddingMm: 3,
      qrMm: 48,
      namePt: 22,
      nameLines: 3,
      codePt: 36,
      codeMinPt: 12,
      placePt: 12,
    },
  },
  {
    id: 'a4-14',
    sizeCode: 'L7163',
    columns: 2,
    rows: 7,
    labelWidthMm: 99.1,
    labelHeightMm: 38.1,
    marginTopMm: 15.15,
    marginLeftMm: 4.65,
    pitchXMm: 101.6,
    pitchYMm: 38.1,
    cornerMm: 3,
    scale: {
      paddingMm: 2,
      qrMm: 34,
      namePt: 12,
      nameLines: 2,
      codePt: 20,
      codeMinPt: 9,
      placePt: 8,
    },
  },
  {
    id: 'a4-21',
    sizeCode: 'L7160',
    columns: 3,
    rows: 7,
    labelWidthMm: 63.5,
    labelHeightMm: 38.1,
    marginTopMm: 15.15,
    marginLeftMm: 7.21,
    pitchXMm: 66.04,
    pitchYMm: 38.1,
    cornerMm: 3,
    scale: {
      paddingMm: 2,
      qrMm: 34,
      namePt: 8,
      nameLines: 3,
      codePt: 13,
      codeMinPt: 6.5,
      placePt: 6.5,
    },
  },
];

/** The layout for an id; throws on an id the page does not know. */
export function sheetLayout(id: SheetLayoutId): SheetLayout {
  const layout = SHEET_LAYOUTS.find((candidate) => candidate.id === id);
  if (!layout) throw new RangeError(`unknown sheet layout: ${id}`);
  return layout;
}

/** Labels on one sheet. */
export function labelsPerSheet(layout: SheetLayout): number {
  return layout.columns * layout.rows;
}

/** "8 per sheet, 99.1 × 67.7 mm": how the sheet is named everywhere it is offered. */
export function describeLayout(layout: SheetLayout): string {
  return `${labelsPerSheet(layout)} per sheet, ${layout.labelWidthMm} × ${layout.labelHeightMm} mm`;
}

/**
 * Where a label's top-left corner sits on the page, for a 0-based slot index
 * in reading order.
 */
export function slotOrigin(layout: SheetLayout, slot: number): { xMm: number; yMm: number } {
  if (!Number.isInteger(slot) || slot < 0 || slot >= labelsPerSheet(layout)) {
    throw new RangeError(`slot ${slot} is not on a ${layout.sizeCode} sheet`);
  }
  const row = Math.floor(slot / layout.columns);
  const column = slot % layout.columns;
  return {
    xMm: layout.marginLeftMm + column * layout.pitchXMm,
    yMm: layout.marginTopMm + row * layout.pitchYMm,
  };
}

/** Pulls a start position back onto the sheet, for when the layout changes under it. */
export function clampStartAt(startAt: number, layout: SheetLayout): number {
  if (!Number.isFinite(startAt)) return 1;
  return Math.min(Math.max(Math.trunc(startAt), 1), labelsPerSheet(layout));
}
