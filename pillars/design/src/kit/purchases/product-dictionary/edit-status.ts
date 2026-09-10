import type { DictionaryEditKind, EditOutcome } from './types';

/**
 * What each correction says once it lands, read off `products.status.*` in
 * `libs/locales/en-AU/purchases.json`.
 */
const EDIT_STATUS_MESSAGE: Readonly<Record<DictionaryEditKind, string>> = {
  merge:
    'Pointed at that product. Every line printing that wording groups there now, the ones already stored included.',
  split: 'Given a product of its own again.',
  assert: 'Asserted. The proposal pass may no longer touch that wording.',
  retract: 'Retracted. That wording is a proposal again, and a pass may retire it.',
  forgetWording: 'Wording forgotten. Its lines fall back to grouping on the printed name.',
  forgetWordingWithProduct:
    'Wording forgotten, and the product it was the last one reaching. The name somebody typed for that product is gone with it. Its lines fall back to grouping on the printed name.',
  rename:
    "Renamed. The wordings that resolve to it are untouched, and the product is now beyond the proposal pass's reach: a pass will not retire the wordings reaching it, so the name cannot be swept away with them.",
  forgetProduct: 'Product forgotten, and every wording with it.',
};

/**
 * The status line's text for the last correction applied, or the empty
 * string before anything has been done, matching the app's `role="status"`
 * paragraph, which stays present but empty rather than unmounting.
 */
export function editStatusMessage(outcome: EditOutcome | null): string {
  if (outcome === null) return '';
  if (outcome.status === 'error') {
    return `That correction did not stick: ${outcome.message ?? ''}`;
  }
  return EDIT_STATUS_MESSAGE[outcome.kind];
}
