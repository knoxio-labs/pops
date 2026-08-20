/**
 * Rebuilding lines of text from the positioned glyph runs a PDF is made of.
 *
 * A PDF stores no lines and no spaces between columns — it stores runs of
 * glyphs, each with an origin. "The suburb column" is a horizontal offset, not
 * a delimiter. Every PDF-to-text step therefore invents the whitespace, and the
 * ANZ statement parser it feeds reads meaning out of that invented whitespace:
 * `parseAnzDescription` splits the description on a fixed character offset and
 * requires a space there. Collapse the gaps to one space each and the split can
 * never fire, so a PDF-imported charge would silently lose its suburb, its
 * country and its foreign-currency detail while still looking correct.
 *
 * ## What this reconstruction assumes
 *
 * That the statement's transaction table is set in a monospaced font, so a
 * horizontal gap divided by one character's advance width is the number of
 * spaces that gap stands for.
 *
 * The character advance is not hardcoded: it is measured per line from that
 * line's own runs, as total run width over total character count
 * ({@link measureCharacterCell}). A monospaced line yields its exact cell; a
 * proportional one yields its mean glyph width, which spaces gaps roughly and
 * columns nothing.
 *
 * ## What would falsify it
 *
 * A statement whose transaction table is proportionally set. Then the measured
 * cell is an average, the reconstructed column offsets drift from the real ones
 * by the accumulated difference, and the fixed-offset split lands somewhere
 * other than the column boundary. The usual result is a boundary character that
 * is not a space, which `parseAnzDescription` reads as "this row has no detail
 * field" and degrades to description-only. The damaging result is a boundary
 * that lands on a space *inside* the merchant name, which truncates the
 * merchant with nothing to show for it.
 *
 * Nothing here can tell those apart, and no synthetic fixture can: a fixture
 * built from this module's own assumptions confirms them by construction. Only
 * a real statement settles it.
 */

/**
 * The subset of pdf.js's `TextItem` this module reads.
 *
 * Declared structurally rather than imported so the reconstruction carries no
 * dependency on the PDF library and can be exercised without loading it.
 */
export interface PdfTextItem {
  /** Text of the run. pdf.js also emits standalone all-space runs to mark gaps. */
  str: string;
  /** Advance width of the run, in the same space as `transform`'s translation. */
  width: number;
  /** `[a, b, c, d, x, y]` — only the translation is read. */
  transform: readonly number[];
  /** Set by pdf.js on the last run of a line it believes ends there. */
  hasEOL: boolean;
}

/** Vertical distance, in text-space units, within which two runs are one line. */
const SAME_LINE_TOLERANCE = 2;

/** A gap narrower than this fraction of a character cell stands for no space at all. */
const GAP_SPACE_THRESHOLD = 0.5;

/** Fallback cell width for a line whose runs carry no measurable width. */
const FALLBACK_CELL = 1;

function xOf(item: PdfTextItem): number {
  return item.transform[4] ?? 0;
}

function yOf(item: PdfTextItem): number {
  return item.transform[5] ?? 0;
}

function isGapRun(item: PdfTextItem): boolean {
  return item.str.length > 0 && item.str.trim().length === 0;
}

/**
 * Mean advance width of one character on this line.
 *
 * Gap runs are excluded from the measurement: their width is the size of the
 * hole they stand for, not the width of the single space character pdf.js gave
 * them, so including them would inflate the cell and swallow the very gaps this
 * exists to expand.
 */
export function measureCharacterCell(line: readonly PdfTextItem[]): number {
  let width = 0;
  let characters = 0;
  for (const item of line) {
    if (isGapRun(item)) continue;
    width += item.width;
    characters += item.str.length;
  }
  return characters > 0 && width > 0 ? width / characters : FALLBACK_CELL;
}

function spacesForWidth(width: number, cell: number): number {
  if (width < cell * GAP_SPACE_THRESHOLD) return 0;
  return Math.max(1, Math.round(width / cell));
}

/**
 * Split runs into lines by vertical position, honouring pdf.js's own end-of-line
 * marks as a forced break.
 *
 * Runs are taken in the order the page emits them; only their grouping is
 * decided here. Within a line they are then sorted by horizontal origin, so a
 * page that emits a column out of order still reconstructs left to right.
 */
function groupIntoLines(items: readonly PdfTextItem[]): PdfTextItem[][] {
  const lines: PdfTextItem[][] = [];
  let current: PdfTextItem[] = [];
  let lineY: number | undefined;
  let forceBreak = false;

  for (const item of items) {
    const y = yOf(item);
    const startsLine =
      current.length === 0 || forceBreak || Math.abs(y - (lineY ?? y)) > SAME_LINE_TOLERANCE;
    if (startsLine && current.length > 0) {
      lines.push(current);
      current = [];
    }
    if (current.length === 0) lineY = y;
    current.push(item);
    forceBreak = item.hasEOL;
  }
  if (current.length > 0) lines.push(current);
  return lines.map((line) => [...line].sort((a, b) => xOf(a) - xOf(b)));
}

function renderLine(line: readonly PdfTextItem[]): string {
  const cell = measureCharacterCell(line);
  let text = '';
  let penX: number | undefined;

  for (const item of line) {
    const x = xOf(item);
    if (penX !== undefined) text += ' '.repeat(spacesForWidth(x - penX, cell));
    text += isGapRun(item) ? ' '.repeat(Math.max(1, Math.round(item.width / cell))) : item.str;
    penX = x + item.width;
  }
  return text.trimEnd();
}

/**
 * Turn one page's positioned runs into lines of text.
 *
 * Empty lines are dropped: they carry no statement row and would only dilute
 * what the row parser reports as unrecognised.
 */
export function linesFromTextItems(items: readonly PdfTextItem[]): string[] {
  return groupIntoLines(items.filter((item) => item.str.length > 0))
    .map(renderLine)
    .filter((line) => line.trim().length > 0);
}
