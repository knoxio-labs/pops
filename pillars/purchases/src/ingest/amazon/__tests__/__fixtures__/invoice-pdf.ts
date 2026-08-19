/**
 * PDFs built to order, so the reader is exercised against real Flate streams.
 *
 * Only the parts `invoice-pdf.ts` looks at are built here: objects holding
 * compressed streams, and a trailer. There is no byte-accurate cross-reference
 * table, because nothing in the reader consults one — it scans for
 * `stream`/`endstream` pairs.
 *
 * Generated rather than checked in as binaries so the escape cases below are
 * legible. A committed PDF that happens to contain a nested parenthesis proves
 * nothing to a reader of the test.
 */
import { deflateSync } from 'node:zlib';

/** Escape a string the way a PDF generator must before drawing it. */
function literal(text: string): string {
  return text
    .replaceAll('\\', String.raw`\\`)
    .replaceAll('(', String.raw`\(`)
    .replaceAll(')', String.raw`\)`);
}

/** A content stream that draws each run at its own position. */
export function contentFor(runs: readonly string[]): string {
  return runs
    .map(
      (run, index) =>
        `BT /F1 9 Tf 1 0 0 1 40 ${String(700 - index * 12)} Tm (${literal(run)}) Tj ET\n`
    )
    .join('');
}

export interface PdfStream {
  /** The stream's uncompressed body. */
  readonly content: string;
  /** When false the bytes are stored raw, so inflating them fails. */
  readonly compressed?: boolean;
}

/** Assemble a PDF whose objects carry exactly the given streams, in order. */
export function pdfWithStreams(streams: readonly PdfStream[]): Buffer {
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];

  for (const [index, { content, compressed = true }] of streams.entries()) {
    const body = compressed
      ? deflateSync(Buffer.from(content, 'latin1'))
      : Buffer.from(content, 'latin1');
    const filter = compressed ? '/Filter /FlateDecode ' : '';
    parts.push(
      Buffer.from(
        `${String(index + 1)} 0 obj <<${filter}/Length ${String(body.length)}>>\nstream\n`,
        'latin1'
      ),
      body,
      Buffer.from('\nendstream\nendobj\n', 'latin1')
    );
  }

  parts.push(Buffer.from('trailer <</Root 1 0 R>>\n%%EOF\n', 'latin1'));
  return Buffer.concat(parts);
}

/** A one-page PDF drawing the given runs, which is the ordinary case. */
export function pdfWithRuns(runs: readonly string[]): Buffer {
  return pdfWithStreams([{ content: contentFor(runs) }]);
}

/** The legacy template, which labels the field `Order Number:`. */
export function legacyInvoice(sourceOrderId: string, documentNumber: string): readonly string[] {
  return [
    'TAX INVOICE ',
    'Page ',
    '1',
    'Order Number: ',
    ` ${sourceOrderId}`,
    'Invoice Number: ',
    ` ${documentNumber}`,
    'Order Date: ',
    ' 23.07.2021',
    'Unit Price (excl. GST)',
    'AUD68.86',
    'TOTAL:',
    'AUD75.75',
  ];
}

/** The current template, which labels the same field `Order no.`. */
export function modernInvoice(sourceOrderId: string, documentNumber: string): readonly string[] {
  return [
    'TAX INVOICE',
    'Document details',
    'Order Date',
    '16 July 2026',
    'Order no.',
    sourceOrderId,
    'Document date',
    '17 July 2026',
    'Document # ',
    documentNumber,
    'Total payable',
    '69.99 AUD',
  ];
}

/** A credit note, which unwinds an invoice rather than being one. */
export function adjustmentNote(sourceOrderId: string, documentNumber: string): readonly string[] {
  return [
    'Tax Adjustment Note',
    'Document details',
    'Order no.',
    sourceOrderId,
    'Document # ',
    documentNumber,
    'Original document no.',
    '12484342-INV-AU-2025-56213632',
    'Total payable',
    '-AUD282.51',
  ];
}
