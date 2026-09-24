/**
 * The standard A4 label sheets the page offers. Geometry is Avery's, by the
 * L71xx laser code on the packet; Avery Australia sells the same sheets
 * under those codes, and Officeworks' own-brand sheets are cut to them.
 * Each grid is centred on the page with Avery's standard gutters, and the
 * three sheets the owner reviewed keep the scale that review settled.
 */
import { deriveScale } from './sheet-layouts.js';

import type { LabelScale, SheetGeometry, SheetLayout } from './sheet-layouts.js';

interface PresetSpec extends SheetGeometry {
  sizeCode: string;
  cornerMm?: number;
  scale?: LabelScale;
}

function preset(spec: PresetSpec): SheetLayout {
  const { sizeCode, cornerMm = 1.5, scale, ...geometry } = spec;
  return {
    ...geometry,
    id: sizeCode,
    sizeCode,
    cornerMm,
    scale: scale ?? deriveScale(geometry.labelWidthMm, geometry.labelHeightMm),
  };
}

const SIDE_2_ACROSS = { marginLeftMm: 4.65, pitchXMm: 101.6 } as const;
const SIDE_3_ACROSS = { marginLeftMm: 7.21, pitchXMm: 66.04 } as const;

/** The standard A4 sheets the page knows the die-cuts of, most labels per sheet first. */
export const SHEET_PRESETS: readonly SheetLayout[] = [
  preset({
    sizeCode: 'L7159',
    columns: 3,
    rows: 8,
    labelWidthMm: 63.5,
    labelHeightMm: 33.9,
    marginTopMm: 12.9,
    pitchYMm: 33.9,
    ...SIDE_3_ACROSS,
  }),
  preset({
    sizeCode: 'L7160',
    columns: 3,
    rows: 7,
    labelWidthMm: 63.5,
    labelHeightMm: 38.1,
    marginTopMm: 15.15,
    pitchYMm: 38.1,
    cornerMm: 3,
    ...SIDE_3_ACROSS,
    scale: { paddingMm: 2, qrMm: 34, namePt: 8, nameLines: 3, codePt: 13, codeMinPt: 6.5 },
  }),
  preset({
    sizeCode: 'L7161',
    columns: 3,
    rows: 6,
    labelWidthMm: 63.5,
    labelHeightMm: 46.6,
    marginTopMm: 8.7,
    pitchYMm: 46.6,
    ...SIDE_3_ACROSS,
  }),
  preset({
    sizeCode: 'L7162',
    columns: 2,
    rows: 8,
    labelWidthMm: 99.1,
    labelHeightMm: 33.9,
    marginTopMm: 12.9,
    pitchYMm: 33.9,
    ...SIDE_2_ACROSS,
  }),
  preset({
    sizeCode: 'L7163',
    columns: 2,
    rows: 7,
    labelWidthMm: 99.1,
    labelHeightMm: 38.1,
    marginTopMm: 15.15,
    pitchYMm: 38.1,
    cornerMm: 3,
    ...SIDE_2_ACROSS,
    scale: { paddingMm: 2, qrMm: 34, namePt: 12, nameLines: 2, codePt: 20, codeMinPt: 9 },
  }),
  preset({
    sizeCode: 'L7173',
    columns: 2,
    rows: 5,
    labelWidthMm: 99.1,
    labelHeightMm: 57,
    marginTopMm: 6,
    pitchYMm: 57,
    ...SIDE_2_ACROSS,
  }),
  preset({
    sizeCode: 'L7165',
    columns: 2,
    rows: 4,
    labelWidthMm: 99.1,
    labelHeightMm: 67.7,
    marginTopMm: 13.1,
    pitchYMm: 67.7,
    cornerMm: 3,
    ...SIDE_2_ACROSS,
    scale: { paddingMm: 3, qrMm: 48, namePt: 22, nameLines: 3, codePt: 36, codeMinPt: 12 },
  }),
  preset({
    sizeCode: 'L7166',
    columns: 2,
    rows: 3,
    labelWidthMm: 99.1,
    labelHeightMm: 93.1,
    marginTopMm: 8.85,
    pitchYMm: 93.1,
    ...SIDE_2_ACROSS,
  }),
  preset({
    sizeCode: 'L7169',
    columns: 2,
    rows: 2,
    labelWidthMm: 99.1,
    labelHeightMm: 139,
    marginTopMm: 9.5,
    pitchYMm: 139,
    ...SIDE_2_ACROSS,
  }),
  preset({
    sizeCode: 'L7168',
    columns: 1,
    rows: 2,
    labelWidthMm: 199.6,
    labelHeightMm: 143.5,
    marginTopMm: 5,
    marginLeftMm: 5.2,
    pitchXMm: 199.6,
    pitchYMm: 143.5,
  }),
  preset({
    sizeCode: 'L7167',
    columns: 1,
    rows: 1,
    labelWidthMm: 199.6,
    labelHeightMm: 289.1,
    marginTopMm: 3.95,
    marginLeftMm: 5.2,
    pitchXMm: 199.6,
    pitchYMm: 289.1,
  }),
];

/** What the page opens on when nothing else chose a sheet: the everyday 21-up sheet. */
export const DEFAULT_SHEET_ID = 'L7160';

/** A preset by id, or null for an id the page does not know. */
export function findPreset(id: string): SheetLayout | null {
  return SHEET_PRESETS.find((candidate) => candidate.id === id) ?? null;
}

/** A preset by id; throws on an id the page does not know. */
export function sheetLayout(id: string): SheetLayout {
  const layout = findPreset(id);
  if (!layout) throw new RangeError(`unknown sheet layout: ${id}`);
  return layout;
}
