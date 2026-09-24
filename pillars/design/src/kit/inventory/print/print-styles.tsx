/**
 * The print stylesheet for a label job, and the class names it keys on.
 *
 * `@page` fixes A4 with no margin, because the sheet's own margins are part
 * of the layout: a browser margin on top would shift every label off its
 * die-cut. Everything that is not a sheet or an ancestor of one is removed
 * from layout (not merely hidden), and the ancestors lose their padding, so
 * the first sheet starts at the paper's top-left corner whatever chrome the
 * page is mounted in.
 */

export const PRINT_ROOT_CLASS = 'pops-print-root';
export const PRINT_SHEET_CLASS = 'pops-print-sheet';

const PRINT_CSS = `
@page { size: A4 portrait; margin: 0; }
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: none !important; }
  body *:not(:has(.${PRINT_ROOT_CLASS})):not(.${PRINT_ROOT_CLASS}):not(.${PRINT_ROOT_CLASS} *) {
    display: none !important;
  }
  :has(.${PRINT_ROOT_CLASS}) {
    margin: 0 !important; padding: 0 !important; border: 0 !important; gap: 0 !important;
    min-height: 0 !important; height: auto !important; max-width: none !important;
    position: static !important; overflow: visible !important; zoom: 1 !important;
    transform: none !important; box-shadow: none !important;
  }
  .${PRINT_ROOT_CLASS} { zoom: 1 !important; gap: 0 !important; padding: 0 !important; }
  .${PRINT_SHEET_CLASS} { break-after: page; box-shadow: none !important; outline: 0 !important; }
  .${PRINT_SHEET_CLASS}:last-child { break-after: auto; }
}
`;

/** Mount once on a page that prints labels. */
export function LabelPrintStyles() {
  return <style>{PRINT_CSS}</style>;
}
