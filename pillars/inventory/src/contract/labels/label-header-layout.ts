import { fitCodePt } from './code-fit.js';
import { estimateLines, fitList } from './label-fitting.js';
import { LABEL_GAP_MM, MIN_QR_MM, MIN_TEXT_MM } from './sheet-layouts.js';

import type { ResolvedLabel } from './label-content.js';
import type { LabelPlan } from './label-plan.js';
import type { PrintSubject } from './label-subject.js';
import type { SheetLayout } from './sheet-layouts.js';

const MM_PER_PT = 25.4 / 72;
const BLOCK_GAP_MM = 1;
const BODY_GAP_MM = 3;
const COLUMN_GAP_MM = 3;
const MIN_COLUMN_MM = 40;

function measureHeader(
  label: ResolvedLabel,
  subject: PrintSubject,
  layout: SheetLayout,
  space: { textWidth: number; availableHeight: number; pt: number }
): (Pick<LabelPlan, 'name' | 'code' | 'fields'> & { heightMm: number }) | null {
  const { scale } = layout;
  const { textWidth, availableHeight, pt } = space;
  const fieldRowMm = pt * MM_PER_PT * 1.3;
  let textHeightMm = 0;
  let blocks = 0;
  const reserve = (height: number): void => {
    textHeightMm += height + (blocks > 0 ? BLOCK_GAP_MM : 0);
    blocks += 1;
  };
  let name: LabelPlan['name'] = null;
  if (label.parts.includes('name')) {
    name = {
      pt: scale.namePt,
      lines: Math.min(scale.nameLines, estimateLines(subject.name, scale.namePt, textWidth)),
    };
    reserve(name.lines * name.pt * MM_PER_PT * 1.25);
  }
  let code: LabelPlan['code'] = null;
  if (label.parts.includes('code')) {
    code = { pt: fitCodePt(subject.code ?? '', textWidth, scale.codePt, scale.codeMinPt) };
    reserve(code.pt * MM_PER_PT * 1.1);
  }
  let fields: LabelPlan['fields'] = null;
  if (label.fields.length) {
    const fieldRows = Math.floor(
      (availableHeight - textHeightMm - (blocks ? BLOCK_GAP_MM : 0)) / fieldRowMm
    );
    if (fieldRows < 1) return null;
    fields = fitList(label.fields, fieldRows, pt);
    reserve((fields.shown.length + (fields.more > 0 ? 1 : 0)) * fieldRowMm);
  }
  return { name, code, fields, heightMm: textHeightMm };
}

function contentColumns(count: number, rows: number, widthMm: number): 1 | 2 | 3 {
  if (count > rows * 2 && (widthMm - COLUMN_GAP_MM * 2) / 3 >= MIN_COLUMN_MM) return 3;
  if (count > rows && (widthMm - COLUMN_GAP_MM) / 2 >= MIN_COLUMN_MM) return 2;
  return 1;
}

/** Fits a QR header above contents, or declines when a readable body cannot fit. */
export function headerPlan(
  label: ResolvedLabel,
  subject: PrintSubject,
  layout: SheetLayout
): LabelPlan | null {
  if (!label.parts.includes('qr') || !label.parts.includes('contents') || !label.contents.length) {
    return null;
  }
  const { scale } = layout;
  const widthMm = layout.labelWidthMm - scale.paddingMm * 2;
  const heightMm = layout.labelHeightMm - scale.paddingMm * 2;
  const qrMm = Math.min(scale.qrMm, 32);
  const textWidth = widthMm - qrMm - LABEL_GAP_MM;
  if (qrMm < MIN_QR_MM || textWidth < MIN_TEXT_MM.container) return null;
  const pt = Math.min(12, Math.max(6, Math.floor(scale.namePt * 0.8 * 2) / 2));
  const contentsPt = Math.min(pt, 9);
  const rowMm = contentsPt * MM_PER_PT * 1.3;
  const headingHeightMm = rowMm + BLOCK_GAP_MM;
  const bodyHeightMm = heightMm - BODY_GAP_MM - headingHeightMm;
  const measured = measureHeader(label, subject, layout, {
    textWidth,
    availableHeight: bodyHeightMm - rowMm,
    pt,
  });
  if (!measured) return null;
  const headerHeightMm = Math.max(qrMm, measured.heightMm);
  const rows = Math.floor((bodyHeightMm - headerHeightMm) / rowMm);
  if (rows < 1) return null;
  const columns = contentColumns(label.contents.length, rows, widthMm);
  return {
    arrangement: 'qr-header',
    qrMm,
    name: measured.name,
    code: measured.code,
    fields: measured.fields,
    contents: fitList(label.contents, rows * columns, contentsPt),
    header: {
      heightMm: headerHeightMm,
      columns,
      columnGapMm: COLUMN_GAP_MM,
      bodyGapMm: BODY_GAP_MM,
      headingHeightMm,
      rows,
    },
  };
}
