/**
 * What the label page needs to know about one item to print it. A container
 * is an item with the containment capability (ADR-001), so boxes and the
 * things in them share this shape and differ only in `kind`.
 */
import QRCode from 'qrcode';

import { MIN_QR_MODULE_MM, QR_EXTENT_MODULES, templateFits } from './sheet-layouts.js';

import type { LabelTemplateId, SheetLayout } from './sheet-layouts.js';

export interface PrintSubject {
  /** The item's immutable id, used by QR labels when no inventory code exists. */
  id: string;
  name: string;
  /** The inventory code, or null when the item has never been labelled. */
  code: string | null;
  /**
   * What `POST /codes/suggest` offers for an item with no code: the stem of
   * similar items plus the next free number. Null when the item has a code.
   */
  suggestedCode: string | null;
  kind: 'container' | 'item';
  /** Where it is, for telling items apart in the picker; labels never print it. */
  place: string | null;
  /** The number of things the record stands for; a group still gets one label. */
  quantity: number;
}

/** The stable item reference URI: `pops://inventory/item/<id>`. */
export function itemUri(id: string): string {
  return `pops://inventory/item/${id}`;
}

/** A code-based inventory deep link; percent-encodes the assigned code as one URI component. */
export function inventoryCodeUri(code: string): string {
  return `pops-i://${encodeURIComponent(code)}`;
}

/** The assigned-code deep link, falling back to the item reference when no code exists. */
export function labelQrUri(subject: Pick<PrintSubject, 'id' | 'code'>): string {
  return subject.code ? inventoryCodeUri(subject.code) : itemUri(subject.id);
}

/** Printed QR extent, including the required four-module quiet zone on each side. */
export function labelQrExtent(subject: Pick<PrintSubject, 'id' | 'code'>): number {
  return QRCode.create(labelQrUri(subject), { errorCorrectionLevel: 'M' }).modules.size + 8;
}

/** Smallest printable side for this payload at the existing physical module minimum. */
export function labelQrMinimumMm(subject: Pick<PrintSubject, 'id' | 'code'>): number {
  return labelQrExtent(subject) * MIN_QR_MODULE_MM;
}

/** Preserves the sheet's module scale while sizing its QR to the actual encoded payload. */
export function labelQrLayout(
  subject: Pick<PrintSubject, 'id' | 'code'>,
  layout: SheetLayout
): SheetLayout {
  const extent = labelQrExtent(subject);
  return {
    ...layout,
    scale: {
      ...layout.scale,
      qrMm: Math.max(extent * MIN_QR_MODULE_MM, (layout.scale.qrMm * extent) / QR_EXTENT_MODULES),
    },
  };
}

/**
 * The template the job asks for: `auto` gives a box the container label and
 * everything else the item label, so a box printed with its contents comes
 * out right without a choice.
 */
export type LabelTemplateChoice = 'auto' | LabelTemplateId;

/**
 * The template one subject prints with on this sheet, or null when the
 * sheet's labels are too small for any QR that scans. A template the sheet
 * cannot fit falls back to the item label, which needs the least room.
 */
export function resolveTemplate(
  subject: Pick<PrintSubject, 'kind'>,
  choice: LabelTemplateChoice,
  layout: SheetLayout
): LabelTemplateId | null {
  const wanted = choice === 'auto' ? subject.kind : choice;
  if (templateFits(layout, wanted)) return wanted;
  return templateFits(layout, 'item') ? 'item' : null;
}

/** Copies of each label by kind: a box is labelled on two sides, a thing once. */
export interface CopiesByKind {
  container: number;
  item: number;
}

export const DEFAULT_COPIES: Readonly<CopiesByKind> = { container: 2, item: 1 };
