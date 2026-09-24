/**
 * Adhesive A4 label sheets and the arithmetic that places labels on them.
 *
 * Every preset dimension is in millimetres and comes from the sheet
 * manufacturer's template (Avery's A4 L71xx laser codes, which Avery
 * Australia and the compatible sheets at Officeworks share), because a label
 * printed 1 mm off the die-cut is a label cut in half. A sheet the presets do
 * not cover is described by hand as a custom sheet. Labels are numbered the
 * way the sheets are: left to right across a row, then down.
 */

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

/**
 * The smallest printed QR module this page will produce. Phone cameras read
 * 0.5 mm modules reliably at arm's length from office laser and inkjet
 * output; below that, toner spread and a slightly curved box side start to
 * cost reads.
 */
export const MIN_QR_MODULE_MM = 0.5;

/**
 * Modules across a label's QR, quiet zone included: `pops://inventory/item/`
 * and a UUID is 58 bytes, which is a version 4 symbol (33 modules) at
 * error-correction level M, plus the 4-module quiet zone on each side.
 */
export const QR_EXTENT_MODULES = 41;

/** The smallest QR, in millimetres, that keeps every module at {@link MIN_QR_MODULE_MM}. */
export const MIN_QR_MM = QR_EXTENT_MODULES * MIN_QR_MODULE_MM;

const MAX_QR_MM = 48;

/** Space between the QR and the text beside it. */
export const LABEL_GAP_MM = 1.5;

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
}

/** Where the labels sit on an A4 sheet: the grid and its die-cut geometry. */
export interface SheetGeometry {
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
}

/** One adhesive A4 sheet: its geometry, what it is called, and its label type scale. */
export interface SheetLayout extends SheetGeometry {
  /** The manufacturer's size code for a preset (also its id), or `custom`. */
  id: string;
  /** The code printed on the sheet's packaging; null for a custom sheet. */
  sizeCode: string | null;
  cornerMm: number;
  scale: LabelScale;
}

/** The id the page gives the sheet a person described by hand. */
export const CUSTOM_SHEET_ID = 'custom';

/** The two label templates: a box's (QR, name, code) and a thing's (QR, code). */
export type LabelTemplateId = 'container' | 'item';

/** Text width each template needs beside its QR before it stops being legible. */
export const MIN_TEXT_MM: Readonly<Record<LabelTemplateId, number>> = { item: 12, container: 20 };

function floorToHalf(value: number): number {
  return Math.floor(value * 2) / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function paddingFor(labelHeightMm: number): number {
  if (labelHeightMm >= 60) return 3;
  return labelHeightMm >= 30 ? 2 : 1.5;
}

/**
 * The type scale for a label of this size: the largest QR that leaves the
 * box label its text column, or, on a label too narrow for that, the item
 * label its code; the name and code are sized to what is left. Presets the
 * owner has reviewed carry their own scale instead.
 */
export function deriveScale(labelWidthMm: number, labelHeightMm: number): LabelScale {
  const paddingMm = paddingFor(labelHeightMm);
  const qrBeside = (text: number) =>
    Math.max(
      0,
      floorToHalf(
        Math.min(
          MAX_QR_MM,
          labelHeightMm - paddingMm * 2,
          labelWidthMm - paddingMm * 2 - LABEL_GAP_MM - text
        )
      )
    );
  const roomy = qrBeside(MIN_TEXT_MM.container);
  const qrMm = roomy >= MIN_QR_MM ? roomy : qrBeside(MIN_TEXT_MM.item);
  const textMm = labelWidthMm - paddingMm * 2 - qrMm - LABEL_GAP_MM;
  const codePt = clamp(floorToHalf(Math.min(labelHeightMm * 0.53, textMm * 0.83)), 8, 36);
  return {
    paddingMm,
    qrMm,
    namePt: clamp(floorToHalf(Math.min(labelHeightMm * 0.32, textMm * 0.5)), 6, 22),
    nameLines: labelHeightMm >= 45 || textMm < 30 ? 3 : 2,
    codePt,
    codeMinPt: Math.max(6, floorToHalf(codePt * 0.45)),
  };
}

/** The layout for a sheet a person measured, scaled by {@link deriveScale}. */
export function customLayout(geometry: SheetGeometry): SheetLayout {
  return {
    ...geometry,
    id: CUSTOM_SHEET_ID,
    sizeCode: null,
    cornerMm: 1.5,
    scale: deriveScale(geometry.labelWidthMm, geometry.labelHeightMm),
  };
}

const EPSILON_MM = 0.01;

/** Labels on one sheet. */
export function labelsPerSheet(layout: SheetGeometry): number {
  return layout.columns * layout.rows;
}

/** "L7160 · 21 per sheet, 63.5 × 38.1 mm": how a sheet is named everywhere it is offered. */
export function describeLayout(layout: SheetLayout): string {
  const name = layout.sizeCode ?? 'Custom';
  return `${name} · ${labelsPerSheet(layout)} per sheet, ${layout.labelWidthMm} × ${layout.labelHeightMm} mm`;
}

/** The width of the text column beside a label's QR. */
export function textWidthMm(layout: SheetLayout): number {
  const { paddingMm, qrMm } = layout.scale;
  return layout.labelWidthMm - paddingMm * 2 - qrMm - LABEL_GAP_MM;
}

/**
 * Whether a template prints on this sheet: its QR keeps every module at
 * the printable minimum and the text beside it has room to be read.
 */
export function templateFits(layout: SheetLayout, template: LabelTemplateId): boolean {
  const { paddingMm, qrMm } = layout.scale;
  return (
    qrMm >= MIN_QR_MM &&
    qrMm <= layout.labelHeightMm - paddingMm * 2 + EPSILON_MM &&
    textWidthMm(layout) + EPSILON_MM >= MIN_TEXT_MM[template]
  );
}

/**
 * Where a label's top-left corner sits on the page, for a 0-based slot index
 * in reading order.
 */
export function slotOrigin(layout: SheetGeometry, slot: number): { xMm: number; yMm: number } {
  if (!Number.isInteger(slot) || slot < 0 || slot >= labelsPerSheet(layout)) {
    throw new RangeError(`slot ${slot} is not on this sheet`);
  }
  const row = Math.floor(slot / layout.columns);
  const column = slot % layout.columns;
  return {
    xMm: layout.marginLeftMm + column * layout.pitchXMm,
    yMm: layout.marginTopMm + row * layout.pitchYMm,
  };
}

/** Pulls a start position back onto the sheet, for when the layout changes under it. */
export function clampStartAt(startAt: number, layout: SheetGeometry): number {
  if (!Number.isFinite(startAt)) return 1;
  return Math.min(Math.max(Math.trunc(startAt), 1), labelsPerSheet(layout));
}
