/**
 * A hand-built PDF that prints ANZ credit-card statement rows in a monospaced
 * font, for driving the wizard's PDF path in a real browser.
 *
 * This is a deliberate copy of the layout in
 * `pillars/finance/app/src/components/imports/pdf/synthetic-pdf.test-helpers.ts`
 * rather than an import of it: ISO-R2 (`shell-no-cross-internal`) lets the
 * shell reach a pillar app only through its `index.ts` entrypoint, and a test
 * helper is not part of that surface. The column offsets are the same
 * invented ones; see that file's header for why a green run proves the
 * extractor self-consistent with this generator and nothing about a real
 * statement's layout.
 *
 * No real account data: card digits, merchants, amounts and dates are made up.
 */

const COURIER_ADVANCE = 0.6;
const FONT_SIZE = 10;
const LEFT_MARGIN = 40;
const TOP_BASELINE = 740;
const LINE_HEIGHT = 12;
const CELL = FONT_SIZE * COURIER_ADVANCE;

const PROCESSED = 0;
const TRANSACTED = 12;
const CARD = 24;
const MERCHANT = 30;
const DETAIL = 56;
const AMOUNT = 76;
const BALANCE = 88;

interface PlacedText {
  column: number;
  row: number;
  text: string;
}

export interface StatementRow {
  /** dd/mm/yyyy, the date the bank processed it. */
  processed: string;
  /** dd/mm/yyyy, the date of the transaction — the one the import keeps. */
  transacted: string;
  merchant: string;
  detail?: string;
  /** Unsigned, two decimals, as the statement prints it. */
  amount: string;
  credit?: boolean;
  balance: string;
}

function assemble(objects: readonly string[]): Buffer {
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
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
  return Buffer.from(header + body + xref + trailer, 'latin1');
}

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

function placeRow(row: StatementRow, line: number): PlacedText[] {
  const placed: PlacedText[] = [
    { row: line, column: PROCESSED, text: row.processed },
    { row: line, column: TRANSACTED, text: row.transacted },
    { row: line, column: CARD, text: '4321' },
    { row: line, column: MERCHANT, text: row.merchant },
    { row: line, column: AMOUNT, text: row.credit ? `${row.amount} CR` : row.amount },
    { row: line, column: BALANCE, text: row.balance },
  ];
  if (row.detail) placed.push({ row: line, column: DETAIL, text: row.detail });
  return placed;
}

/** A one-page statement printing `rows`, as bytes Playwright can hand to a file input. */
export function statementPdf(rows: readonly StatementRow[]): Buffer {
  const operators = rows.flatMap((row, i) => placeRow(row, i + 2));
  const content = `${operatorsFor(operators)}\n`;
  return assemble([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
      '/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]);
}
