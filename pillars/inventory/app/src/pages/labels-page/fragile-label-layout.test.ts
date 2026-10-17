import { describe, expect, it } from 'vitest';

import {
  customLayout,
  fitToSheet,
  LABEL_GAP_MM,
  MIN_QR_MM,
  planLabel,
  sheetLayout,
} from '@pops/inventory/labels';

import { fitPrintedLabel, planPrintedLabel } from './fragile-label-layout';

import type { PrintSubject, ResolvedLabel, SheetLayout } from '@pops/inventory/labels';

const subject: PrintSubject = {
  id: 'item-1',
  name: 'Glass vase',
  code: 'GLS-001',
  suggestedCode: null,
  kind: 'item',
  place: null,
  quantity: 1,
};

const boxLabel: ResolvedLabel = {
  parts: ['qr', 'name', 'code'],
  fields: [],
  contents: [],
  fallback: false,
};

const qrLabel: ResolvedLabel = { ...boxLabel, parts: ['qr'] };
const textLabel: ResolvedLabel = { ...boxLabel, parts: ['code'] };

function smallLayout(widthMm: number, heightMm: number): SheetLayout {
  return customLayout({
    columns: 1,
    rows: 1,
    labelWidthMm: widthMm,
    labelHeightMm: heightMm,
    marginTopMm: 0,
    marginLeftMm: 0,
    pitchXMm: widthMm,
    pitchYMm: heightMm,
  });
}

describe('fragile label fitting', () => {
  it('delegates normal fitting and planning without changing their results', () => {
    const layout = sheetLayout('L7160');
    const fitted = fitPrintedLabel(boxLabel, layout, false);
    expect(fitted).toEqual(fitToSheet(boxLabel, layout));
    expect(fitted).not.toBeNull();
    if (fitted === null) return;
    expect(planPrintedLabel(fitted, subject, layout, false)).toEqual({
      plan: planLabel(fitted, subject, layout),
      fragileMm: null,
    });
  });

  it('caps the QR and warning at matching 24 mm sides on a large sheet', () => {
    const layout = sheetLayout('L7169');
    const fitted = fitPrintedLabel(boxLabel, layout, true);
    expect(fitted).toEqual(boxLabel);
    if (fitted === null) return;
    const { plan, fragileMm } = planPrintedLabel(fitted, subject, layout, true);
    expect(fragileMm).toBe(24);
    expect(plan.qrMm).toBe(fragileMm);
    expect(plan.name).not.toBeNull();
    expect(plan.code).not.toBeNull();
  });

  it('falls back to QR and code while keeping the warning on compact stock', () => {
    const layout = sheetLayout('L7160');
    const fitted = fitPrintedLabel(boxLabel, layout, true);
    expect(fitted?.parts).toEqual(['qr', 'code']);
    if (fitted === null) return;
    const { plan, fragileMm } = planPrintedLabel(fitted, subject, layout, true);
    expect(fragileMm).toBeGreaterThanOrEqual(MIN_QR_MM);
    expect(plan.qrMm).toBe(fragileMm);
    expect(plan.code).not.toBeNull();
    expect(2 * (fragileMm ?? 0) + 2 * LABEL_GAP_MM + 12).toBeLessThanOrEqual(
      layout.labelWidthMm - 2 * layout.scale.paddingMm
    );
  });

  it('rejects width and height that cannot hold both scannable symbols', () => {
    expect(fitPrintedLabel(qrLabel, smallLayout(43, 38), true)).toBeNull();
    expect(fitPrintedLabel(qrLabel, smallLayout(64, 22), true)).toBeNull();
    expect(() => planPrintedLabel(qrLabel, subject, smallLayout(43, 38), true)).toThrow(RangeError);
  });

  it('sizes a QR-only pair equally without overflowing the die-cut', () => {
    const layout = sheetLayout('L7160');
    const fitted = fitPrintedLabel(qrLabel, layout, true);
    expect(fitted).toEqual(qrLabel);
    if (fitted === null) return;
    const { plan, fragileMm } = planPrintedLabel(fitted, subject, layout, true);
    expect(plan.arrangement).toBe('qr-fill');
    expect(plan.qrMm).toBe(fragileMm);
    expect(fragileMm).toBeGreaterThanOrEqual(MIN_QR_MM);
    expect(2 * (fragileMm ?? 0) + LABEL_GAP_MM).toBeLessThanOrEqual(
      layout.labelWidthMm - 2 * layout.scale.paddingMm
    );
  });

  it('reserves one warning square beside a text-only label', () => {
    const layout = sheetLayout('L7160');
    const fitted = fitPrintedLabel(textLabel, layout, true);
    expect(fitted).toEqual(textLabel);
    if (fitted === null) return;
    const { plan, fragileMm } = planPrintedLabel(fitted, subject, layout, true);
    expect(plan.arrangement).toBe('text');
    expect(plan.qrMm).toBeNull();
    expect(plan.code).not.toBeNull();
    expect(fragileMm).toBe(24);
    expect(fitPrintedLabel(textLabel, smallLayout(25, 30), true)).toBeNull();
  });

  it('keeps full-width contents below the reserved header space', () => {
    const layout = smallLayout(90, 80);
    const contents = Array.from({ length: 12 }, (_, index) => `Item ${index + 1}`);
    const label: ResolvedLabel = {
      ...boxLabel,
      parts: ['qr', 'name', 'code', 'contents'],
      contents,
    };
    const fitted = fitPrintedLabel(label, layout, true);
    expect(fitted).toEqual(label);
    if (fitted === null) return;
    const { plan, fragileMm } = planPrintedLabel(fitted, subject, layout, true);
    expect(fragileMm).toBe(24);
    expect(plan.arrangement).toBe('qr-header');
    expect(plan.header?.columns).toBe(2);
    expect(plan.contents?.shown).toEqual(contents);
  });
});
