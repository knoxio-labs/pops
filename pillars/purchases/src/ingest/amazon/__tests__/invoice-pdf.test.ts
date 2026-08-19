import { deflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { extractPdfText, readAmazonInvoice } from '../invoice-pdf.js';
import {
  adjustmentNote,
  contentFor,
  legacyInvoice,
  modernInvoice,
  pdfWithRuns,
  pdfWithStreams,
} from './__fixtures__/invoice-pdf.js';

const ORDER = '503-1631401-2789435';
const DIGITAL_ORDER = 'D01-9651602-7705054';
const DOCUMENT = '12484342-INV-AU-2021-26473870';

function fieldsOf(pdf: Buffer) {
  const read = readAmazonInvoice(pdf);
  if (!read.ok) throw new Error(`expected a readable invoice, got ${read.failure}`);
  return read.fields;
}

function failureOf(pdf: Buffer): string {
  const read = readAmazonInvoice(pdf);
  if (read.ok) throw new Error(`expected a refusal, got ${read.fields.sourceOrderId}`);
  return read.failure;
}

describe('text extraction', () => {
  it('joins the drawn runs so a label and its value read as one string', () => {
    // The two are separate `Tj` operators at two positions on the page.
    // Concatenating them without a separator would produce
    // `Order Number:503-…`, which the field patterns would still match — the
    // point of the space is that a run boundary is not a word boundary.
    expect(extractPdfText(pdfWithRuns(['Order Number: ', ` ${ORDER}`]))).toBe(
      `Order Number:   ${ORDER}`
    );
  });

  it('keeps a parenthesis that the generator escaped', () => {
    expect(extractPdfText(pdfWithRuns(['Unit Price (excl. GST)']))).toBe('Unit Price (excl. GST)');
  });

  it('reads a nested parenthesis to its own closing one', () => {
    // Balanced parentheses are legal unescaped inside a literal. Stopping at
    // the first `)` would end this run at "GST" and leave `) Tj` as content
    // to be misread as the start of the next.
    const raw = 'BT (Unit Price (excl. GST) each) Tj ET\n';
    expect(extractPdfText(pdfWithStreams([{ content: raw }]))).toBe('Unit Price (excl. GST) each');
  });

  it('decodes an octal escape', () => {
    expect(extractPdfText(pdfWithStreams([{ content: String.raw`BT (Jo\343o) Tj ET` }]))).toBe(
      'João'
    );
  });

  it('drops the backslash-newline a generator uses to wrap a long literal', () => {
    const raw = 'BT (Amazon Commercial \\\nServices) Tj ET\n';
    expect(extractPdfText(pdfWithStreams([{ content: raw }]))).toBe('Amazon Commercial Services');
  });

  it('ignores a stream it cannot decompress', () => {
    // The embedded logo is DCTDecode, not Flate. Treating an inflate failure
    // as fatal would make every real invoice unreadable.
    const pdf = pdfWithStreams([
      { content: 'ÿØÿà not zlib at all', compressed: false },
      { content: contentFor(['Order Number: ', ORDER]) },
    ]);
    expect(extractPdfText(pdf)).toContain(ORDER);
  });

  it('ignores literals in a stream that draws no text', () => {
    // A font program is a compressed stream full of arbitrary bytes. Reading
    // its literals would let it inject text between a label and its value —
    // here, an order id that belongs to no order at all.
    const pdf = pdfWithStreams([
      { content: '/FontFile2 (Order Number: 999-9999999-9999999) def' },
      { content: contentFor(['Order Number: ', ORDER]) },
    ]);
    const text = extractPdfText(pdf);
    expect(text).not.toContain('999-9999999-9999999');
    expect(text).toContain(ORDER);
  });

  it('returns nothing for a PDF with no text layer at all', () => {
    expect(extractPdfText(pdfWithStreams([{ content: 'scanned', compressed: false }]))).toBe('');
  });

  it('reads a stream whose data is not the first object in the file', () => {
    const pdf = pdfWithStreams([
      { content: deflateSync(Buffer.from('decoy')).toString('latin1'), compressed: false },
      { content: contentFor([`Order no. ${ORDER}`]) },
    ]);
    expect(extractPdfText(pdf)).toContain(ORDER);
  });
});

describe('field reading', () => {
  it('reads the legacy template, which labels the field "Order Number:"', () => {
    expect(fieldsOf(pdfWithRuns(legacyInvoice(ORDER, DOCUMENT)))).toEqual({
      sourceOrderId: ORDER,
      documentNumber: DOCUMENT,
      documentType: 'TAX INVOICE',
      kind: 'tax_invoice',
    });
  });

  it('reads the current template, which labels the same field "Order no."', () => {
    const fields = fieldsOf(pdfWithRuns(modernInvoice(ORDER, 'AU61BN8BZACSI')));
    expect(fields.sourceOrderId).toBe(ORDER);
    expect(fields.documentNumber).toBe('AU61BN8BZACSI');
    expect(fields.kind).toBe('tax_invoice');
  });

  it('reads the notification template, which labels it "Order #"', () => {
    const fields = fieldsOf(
      pdfWithRuns(['Notification', 'Order # ', ORDER, 'Document # ', 'AU61BN8BZACSI'])
    );
    expect(fields.sourceOrderId).toBe(ORDER);
    // Not a tax invoice, so it is not filed as one.
    expect(fields.kind).toBe('other');
  });

  it('reads a digital order id, whose first group is not numeric', () => {
    expect(fieldsOf(pdfWithRuns(legacyInvoice(DIGITAL_ORDER, DOCUMENT))).sourceOrderId).toBe(
      DIGITAL_ORDER
    );
  });

  it('files a credit note as "other" rather than as the invoice it reverses', () => {
    const fields = fieldsOf(pdfWithRuns(adjustmentNote(ORDER, '12484342-CN-AU-2025-3210487')));
    expect(fields.kind).toBe('other');
    // The note's own number, not the original document it names further down.
    expect(fields.documentNumber).toBe('12484342-CN-AU-2025-3210487');
  });

  it('takes the kind from the heading, not from the document the note adjusts', () => {
    // A credit note names the invoice it unwinds, in those words. A kind read
    // from the whole page files the note as the invoice it reverses.
    const fields = fieldsOf(
      pdfWithRuns([
        'Tax Adjustment Note',
        'Order no.',
        ORDER,
        'This adjusts TAX INVOICE 12484342-INV-AU-2021-26473870',
      ])
    );
    expect(fields.kind).toBe('other');
    expect(fields.documentType).toBe('Tax Adjustment Note');
  });

  it('reports a PDF with no text layer rather than reading it as empty', () => {
    expect(failureOf(pdfWithStreams([{ content: 'scan', compressed: false }]))).toBe(
      'no-text-layer'
    );
  });

  it('reports a document that names no order', () => {
    expect(failureOf(pdfWithRuns(['TAX INVOICE', 'Total payable', '69.99 AUD']))).toBe(
      'no-order-id'
    );
  });

  it('refuses an unlabelled id sitting loose in the body', () => {
    // A bare id could be a tracking number, a related order, or the id of the
    // invoice this one replaces. Attaching on a bare pattern match would put
    // evidence on an order the document may not describe.
    expect(failureOf(pdfWithRuns(['TAX INVOICE', `see ${ORDER} for details`]))).toBe('no-order-id');
  });

  it('refuses a document that names two different orders', () => {
    expect(
      failureOf(
        pdfWithRuns(['TAX INVOICE', 'Order no.', ORDER, 'Order no.', '249-1111111-2222222'])
      )
    ).toBe('ambiguous-order-id');
  });

  it('accepts a document that names one order twice', () => {
    // The current template prints the number in the summary and again in the
    // detail block. Two mentions of one order is not an ambiguity.
    expect(
      fieldsOf(pdfWithRuns(['TAX INVOICE', 'Order no.', ORDER, 'Order no.', ORDER])).sourceOrderId
    ).toBe(ORDER);
  });

  it('leaves the document number null when the template states none', () => {
    expect(fieldsOf(pdfWithRuns(['TAX INVOICE', 'Order no.', ORDER])).documentNumber).toBeNull();
  });

  it('refuses to read a document number out of a label printed with no value', () => {
    // This capture is what decides two invoices on one order are the same
    // document, and drops the second. Taking whatever word follows the label
    // would make two unrelated invoices collide on it.
    expect(
      fieldsOf(pdfWithRuns(['TAX INVOICE', 'Order no.', ORDER, 'Invoice Number: ', 'Page 1 of 2']))
        .documentNumber
    ).toBeNull();
  });

  it('refuses a token too short to be a document number', () => {
    expect(
      fieldsOf(pdfWithRuns(['TAX INVOICE', 'Order no.', ORDER, 'Document # ', 'AU1']))
        .documentNumber
    ).toBeNull();
  });
});
