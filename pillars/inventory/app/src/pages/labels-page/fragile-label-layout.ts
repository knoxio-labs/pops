import { fitToSheet, LABEL_GAP_MM, MIN_QR_MM, planLabel } from '@pops/inventory/labels';

import type { LabelPlan, PrintSubject, ResolvedLabel, SheetLayout } from '@pops/inventory/labels';

const MAX_SYMBOL_MM = 24;
const MIN_TEXT_MM = 12;

function hasText(label: ResolvedLabel): boolean {
  return label.parts.some((part) => part !== 'qr') || label.fields.length > 0;
}

function symbolMm(label: ResolvedLabel, layout: SheetLayout): number | null {
  const { paddingMm } = layout.scale;
  const innerWidthMm = layout.labelWidthMm - paddingMm * 2;
  const innerHeightMm = layout.labelHeightMm - paddingMm * 2;
  const withQr = label.parts.includes('qr');
  const withText = hasText(label);
  const count = withQr ? 2 : 1;
  const gapsMm = LABEL_GAP_MM * (count - 1 + Number(withText));
  const availableMm = (innerWidthMm - gapsMm - (withText ? MIN_TEXT_MM : 0)) / count;
  const sizeMm = Math.min(MAX_SYMBOL_MM, innerHeightMm, availableMm);
  const minimumMm = withQr ? MIN_QR_MM : MIN_TEXT_MM;
  return sizeMm >= minimumMm ? sizeMm : null;
}

function contentLayout(layout: SheetLayout, sizeMm: number): SheetLayout {
  return {
    ...layout,
    labelWidthMm: layout.labelWidthMm - sizeMm - LABEL_GAP_MM,
    scale: { ...layout.scale, qrMm: sizeMm },
  };
}

/** Fits a label beside an inline fragile symbol, preserving a scannable QR when present. */
export function fitPrintedLabel(
  label: ResolvedLabel,
  layout: SheetLayout,
  fragile: boolean
): ResolvedLabel | null {
  if (!fragile) return fitToSheet(label, layout);
  const sizeMm = symbolMm(label, layout);
  return sizeMm === null ? null : fitToSheet(label, contentLayout(layout, sizeMm));
}

/** Plans a previously fitted label and returns the fragile symbol's printed side in millimetres. */
export function planPrintedLabel(
  label: ResolvedLabel,
  subject: PrintSubject,
  layout: SheetLayout,
  fragile: boolean
): { plan: LabelPlan; fragileMm: number | null } {
  if (!fragile) return { plan: planLabel(label, subject, layout), fragileMm: null };
  const sizeMm = symbolMm(label, layout);
  if (sizeMm === null) throw new RangeError('fragile symbol does not fit on this label');
  const plan = planLabel(
    label,
    subject,
    { ...layout, scale: { ...layout.scale, qrMm: sizeMm } },
    sizeMm + LABEL_GAP_MM
  );
  return {
    plan: plan.arrangement === 'qr-fill' ? { ...plan, qrMm: sizeMm } : plan,
    fragileMm: sizeMm,
  };
}
