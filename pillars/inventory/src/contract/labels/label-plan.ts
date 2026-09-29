import type { LabelFieldValue } from './label-content.js';
import type { FittedList } from './label-fitting.js';

/** How the label is divided. */
export type LabelArrangement = 'qr-fill' | 'qr-beside' | 'qr-header' | 'text';

/** One label, measured: where the QR goes and how big each text part is set. */
export interface LabelPlan {
  arrangement: LabelArrangement;
  /** Geometry of a top header and the full-width contents below it, when they fit. */
  header?: {
    heightMm: number;
    columns: 1 | 2 | 3;
    columnGapMm: number;
    bodyGapMm: number;
    headingHeightMm: number;
    rows: number;
  };
  /** The QR's side in millimetres, or null when the label has no QR. */
  qrMm: number | null;
  /** The name's size and the most lines it may take before it ends in an ellipsis. */
  name: { pt: number; lines: number } | null;
  code: { pt: number } | null;
  fields: FittedList<LabelFieldValue> | null;
  contents: FittedList<string> | null;
}
