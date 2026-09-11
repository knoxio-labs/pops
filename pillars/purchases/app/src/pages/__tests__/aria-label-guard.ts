/**
 * i18next echoes back a key it cannot resolve rather than throwing, so a typo
 * in a translation key renders the raw catalog key (e.g. `receipts.parts.moveDown`)
 * on screen instead of failing loudly. `document.body.textContent` catches that
 * for visible copy, but an `aria-label` (or other attribute a screen reader
 * reads) carries no text node of its own and is invisible to `textContent` —
 * POPS-1978 found this blind spot on `ReceiptDropZonePage`, and POPS-2001
 * extends the same guard to every page that sets `aria-label` from the catalog.
 */

/** Matches an unresolved key from any of the given catalog namespaces, e.g. `receipts.parts.moveDown`. */
export function rawCatalogKeyPattern(...namespaces: readonly string[]): RegExp {
  return new RegExp(`(?:${namespaces.join('|')})\\.[a-zA-Z]`);
}

/** Every `aria-label` in the rendered DOM whose value looks like an unresolved catalog key. */
export function leakedAriaLabels(pattern: RegExp): string[] {
  return Array.from(document.body.querySelectorAll('[aria-label]'))
    .map((element) => element.getAttribute('aria-label') ?? '')
    .filter((label) => pattern.test(label));
}
