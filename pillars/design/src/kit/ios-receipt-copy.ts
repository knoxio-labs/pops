import type { GateFailure, GateFailureKind } from '@/fixtures/receipts';

/** `ReceiptCaptureCopy` / `ReceiptResultCopy`, verbatim. */
export const RECEIPT_COPY = {
  title: 'Receipts',
  subtitle: "Photograph a receipt and it's read into a purchase — merchant, items and total.",
  start: 'Photograph a receipt',
  another: 'Photograph another receipt',
  guidance: 'For a clean read',
  reading: 'Reading your receipt…',
  photographed: 'What you photographed',
  whyReview: 'Why it needs review',
  whatRead: 'What was read',
  unreadableTitle: "Couldn't read this receipt",
  unreadableMessage: 'Retake the photo — a flatter angle or better light usually fixes this.',
  savedTitle: 'Receipt saved',
  savedMessage: 'The purchase has been recorded.',
  alreadyStored: 'This receipt was already on file — nothing new was recorded.',
  reviewTitle: 'Needs a closer look',
  couldNotRead: 'Could not be read',
} as const;

export const CAPTURE_HINTS = [
  'Lay it flat and fill the frame.',
  'Even light, no shadow across the print.',
  'A long receipt is several photos, top to bottom — they’re read as one.',
] as const;

/** The reader-facing sentence for each thing the gate can object to. */
export const GATE_LABEL: Record<GateFailureKind, string> = {
  unreadableTotal: 'The printed total could not be read.',
  unreadableLine: 'A line item could not be read.',
  noLines: 'No line items could be read.',
  negativeLine: 'A line item read as a negative amount.',
  sumMismatch: "The line items don't add up to the printed total.",
  ambiguousTax: "It's unclear whether the prices include tax.",
  damaged: 'The receipt looks damaged or unclear.',
  unrecognised: "Something on this receipt didn't check out.",
};

const CATEGORY: Record<GateFailureKind, 'unreadable' | 'arithmetic' | 'other'> = {
  unreadableTotal: 'unreadable',
  unreadableLine: 'unreadable',
  noLines: 'unreadable',
  damaged: 'unreadable',
  sumMismatch: 'arithmetic',
  negativeLine: 'other',
  ambiguousTax: 'other',
  unrecognised: 'other',
};

const REVIEW_MESSAGE = {
  unreadable:
    'Parts of this receipt could not be read, so nothing was recorded. Retake the photo — flatter and better-lit usually fixes this.',
  arithmetic:
    "The numbers on this receipt don't add up to its printed total, so nothing was recorded. Enter it manually, or retake the photo and try again.",
  other:
    "Something on this receipt didn't check out, so nothing was recorded. Check the details below, then enter it manually or retake the photo.",
  several:
    'This receipt has more than one problem, so nothing was recorded. Check the details below, then enter it manually or retake the photo.',
  none: 'This receipt needs a closer look before it can be recorded. Check the details below, then enter it manually or retake the photo.',
} as const;

/**
 * One sentence for the whole review, chosen by which *kinds* of problem are
 * present rather than by how many there are — two unreadable lines are one
 * problem to the reader, and an unreadable line beside a sum that does not
 * add up is two.
 */
export function reviewMessage(failures: GateFailure[]): string {
  const categories = [...new Set(failures.map((failure) => CATEGORY[failure.kind]))];
  const only = categories[0];
  if (only === undefined) return REVIEW_MESSAGE.none;
  if (categories.length > 1) return REVIEW_MESSAGE.several;
  return REVIEW_MESSAGE[only];
}

/** "2.50 short of the total" — which side of the printed figure the lines fell. */
export function deltaWording(deltaCents: number): string {
  const magnitude = (Math.abs(deltaCents) / 100).toFixed(2);
  return `${magnitude} ${deltaCents < 0 ? 'short of' : 'over'} the total`;
}

/** "12 items" / "1 item", and nothing at all at zero. */
export function itemCountLine(count: number): string | undefined {
  if (count <= 0) return undefined;
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}

/** "From 2 photos." — the caption under a status header. */
export function photoCountLine(count: number): string | undefined {
  if (count <= 0) return undefined;
  return `From ${count} ${count === 1 ? 'photo' : 'photos'}.`;
}

/** `×2`, `$4.90/kg`, or both — never a synthesised `×1`. */
export function lineQualifier(quantity?: number, unitNote?: string): string | undefined {
  const parts = [quantity === undefined ? undefined : `×${quantity}`, unitNote].filter(Boolean);
  return parts.length === 0 ? undefined : parts.join(' ');
}
