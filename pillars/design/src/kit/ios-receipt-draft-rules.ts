import type { ExtractedReceipt, ReceiptLine } from '@/fixtures/receipts';

/**
 * What the draft form and the read-only reading must agree on. Both render
 * the same receipt, and the two disagreeing about whether a value is there —
 * one showing a row the other omits — is the failure mode this module exists
 * to make impossible.
 */

/**
 * Whether the extractor actually read a value. An extractor that read nothing
 * gives a blank string, not an absent field, so every rule and every note in
 * this feature has to ask the question the same way — a note that fires on
 * `undefined` beside a rule that also catches `'   '` blocks a save without
 * saying why.
 */
export const stated = (value: string | undefined): value is string =>
  value !== undefined && value.trim() !== '';

export interface AdjustmentRow {
  label: string;
  value: string;
}

/** Only the adjustments the receipt actually stated — never four empty rows. */
export function adjustmentRows(reading: ExtractedReceipt): AdjustmentRow[] {
  return [
    ...(stated(reading.tax) ? [{ label: 'Tax', value: reading.tax }] : []),
    ...reading.discounts.filter(stated).map((value) => ({ label: 'Discounts', value })),
    ...reading.surcharges.filter(stated).map((value) => ({ label: 'Surcharges', value })),
    ...(stated(reading.shipping) ? [{ label: 'Shipping', value: reading.shipping }] : []),
  ];
}

/**
 * A line somebody has described but not priced. An untouched blank row is not
 * this: a reader who has pressed "Add an item" and not yet typed has done
 * nothing wrong, and flagging them for it turns the button into a trap.
 */
export function lineProblem(line: ReceiptLine): boolean {
  return stated(line.description) && !stated(line.amount);
}

/**
 * A draft can be saved once it has a total and no priced-but-blank line. A
 * gate hint never enters into it — a hint says "look here", and a form that
 * refused to save over one would make the extractor's uncertainty the
 * reader's problem.
 */
export function isSaveable(reading: ExtractedReceipt): boolean {
  return stated(reading.total) && !reading.lines.some(lineProblem);
}
