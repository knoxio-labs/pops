/**
 * Hand-built PDF files, for exercising the extractor against real bytes.
 *
 * These are written out object by object rather than produced by a library, so
 * a test can state exactly which structural property it is testing: an
 * `/Encrypt` entry in the trailer, a page whose content stream draws no text, a
 * file that is not a PDF at all.
 *
 * READ THIS BEFORE TRUSTING A GREEN TEST THAT USES THEM. The text-carrying
 * builders lay glyphs out on a grid this file chooses. A test that puts text in
 * at coordinates of its own choosing and reads the same text back out has
 * proven that the extractor is self-consistent with this generator — nothing
 * more. It has NOT shown that a real ANZ statement's columns land where the
 * statement parser expects them, because no real statement was available to
 * build these from. Whether the reconstructed column offsets match ANZ's is an
 * open question, tracked separately, and answerable only against a real file.
 *
 * No fixture here contains real account data. Card digits, merchant names,
 * amounts and dates are invented.
 */

/** Courier's advance width, in thousandths of the font size, from the PDF core-font metrics. */
const COURIER_ADVANCE = 0.6;

function toBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}

/**
 * Assemble numbered objects into a PDF with a correct cross-reference table.
 *
 * The offsets have to be real: pdf.js falls back to scanning the whole file
 * when the table is wrong, which would quietly turn a malformed-file test into
 * a well-formed one.
 */
function assemble(objects: readonly string[], trailerExtra = ''): Uint8Array {
  const header = '%PDF-1.4\n';
  let body = '';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(header.length + body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const startXref = header.length + body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  const trailer =
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailerExtra}>>\n` +
    `startxref\n${startXref}\n%%EOF\n`;
  return toBytes(header + body + xref + trailer);
}

function stream(operators: string): string {
  return `<< /Length ${operators.length} >>\nstream\n${operators}\nendstream`;
}

const CATALOG = '<< /Type /Catalog /Pages 2 0 R >>';
const COURIER = '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>';

function pagesObject(count: number): string {
  const kids = Array.from({ length: count }, (_unused, i) => `${3 + i} 0 R`).join(' ');
  return `<< /Type /Pages /Kids [${kids}] /Count ${count} >>`;
}

/** One page positioned text run: a column index, a row index, and what to print. */
export interface PlacedText {
  /** Column measured in character cells from the left margin. */
  column: number;
  /** Row measured in lines from the top of the text area, growing downward. */
  row: number;
  text: string;
}

const FONT_SIZE = 10;
const LEFT_MARGIN = 40;
const TOP_BASELINE = 740;
const LINE_HEIGHT = 12;
const CELL = FONT_SIZE * COURIER_ADVANCE;

function operatorsFor(placements: readonly PlacedText[]): string {
  return placements
    .map(({ column, row, text }) => {
      const x = LEFT_MARGIN + column * CELL;
      const y = TOP_BASELINE - row * LINE_HEIGHT;
      const escaped = text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
      return `BT /F1 ${FONT_SIZE} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escaped}) Tj ET`;
    })
    .join('\n');
}

/**
 * A PDF whose pages print the given runs at whole character-cell columns in a
 * monospaced font.
 *
 * Each page is a separate list of placements, so a test can span content across
 * pages the way a statement does.
 */
export function monospacedTextPdf(pages: readonly (readonly PlacedText[])[]): Uint8Array {
  const pageObjects = pages.map(
    (_unused, index) =>
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 ${3 + pages.length} 0 R >> >> ` +
      `/Contents ${4 + pages.length + index} 0 R >>`
  );
  return assemble([
    CATALOG,
    pagesObject(pages.length),
    ...pageObjects,
    COURIER,
    ...pages.map((placements) => stream(`${operatorsFor(placements)}\n`)),
  ]);
}

/**
 * A structurally valid one-page PDF that draws a filled rectangle and no text —
 * what a scan of a paper statement looks like to a text extractor.
 */
export function imageOnlyPdf(): Uint8Array {
  return assemble([
    CATALOG,
    pagesObject(1),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>',
    stream('0.2 0.2 0.2 rg 72 500 468 200 re f\n'),
  ]);
}

/**
 * A PDF whose trailer names the standard security handler.
 *
 * The owner and user password hashes are filler, which is the point: pdf.js
 * asks for a password before it can tell whether they are valid, and no
 * password is supplied.
 */
export function passwordProtectedPdf(): Uint8Array {
  const owner = `<${'61'.repeat(32)}>`;
  const user = `<${'62'.repeat(32)}>`;
  const id = '<0102030405060708090a0b0c0d0e0f10>';
  return assemble(
    [
      CATALOG,
      pagesObject(1),
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
        '/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      COURIER,
      stream('BT /F1 10 Tf 40 700 Td (locked) Tj ET\n'),
      `<< /Filter /Standard /V 1 /R 2 /O ${owner} /U ${user} /P -1 >>`,
    ],
    `/Encrypt 6 0 R /ID [${id} ${id}] `
  );
}

/** Bytes that are not a PDF: a CSV export, which is what the wizard's other path takes. */
export function csvBytes(): Uint8Array {
  return toBytes('Date,Amount,Description\n01/03/2024,-42.10,GROCER\n');
}
