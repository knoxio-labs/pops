/**
 * What the label page needs to know about one item to print it. A container
 * is an item with the containment capability (ADR-001), so boxes and the
 * things in them share this shape and differ only in `kind`.
 */
import { templateFits } from './sheet-layouts';

import type { LabelTemplateId, SheetLayout } from './sheet-layouts';

export type { LabelTemplateId } from './sheet-layouts';

export interface PrintSubject {
  /** The item's immutable id; the QR encodes it, never the code. */
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

/** The QR payload for an item, per ADR-002 D13: `pops://inventory/item/<id>`. */
export function itemUri(id: string): string {
  return `pops://inventory/item/${id}`;
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
