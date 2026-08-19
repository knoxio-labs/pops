import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readAmazonInvoice } from '../invoice-pdf.js';
import {
  INVOICE_BUNDLE_DIRECTORY,
  attachInvoiceDocuments,
  matchAmazonInvoices,
  readAmazonInvoiceBundle,
  summariseRejections,
  type ScannedInvoicePdf,
} from '../invoices.js';
import {
  legacyInvoice,
  modernInvoice,
  pdfWithRuns,
  pdfWithStreams,
} from './__fixtures__/invoice-pdf.js';

import type { CreatePurchaseInput } from '../../../db/services/purchase-input.js';

const RETAIL = '503-1631401-2789435';
const OTHER_RETAIL = '249-4494679-2017412';
const DIGITAL = 'D01-9651602-7705054';
const DOCUMENT = '12484342-INV-AU-2021-26473870';

function scan(path: string, pdf: Buffer): ScannedInvoicePdf {
  return { path, bytes: pdf, read: readAmazonInvoice(pdf) };
}

function invoice(
  path: string,
  sourceOrderId: string,
  documentNumber = DOCUMENT
): ScannedInvoicePdf {
  return scan(path, pdfWithRuns(legacyInvoice(sourceOrderId, documentNumber)));
}

function order(sourceOrderId: string | null): CreatePurchaseInput {
  return {
    source: 'amazon',
    sourceOrderId,
    ingestMethod: 'export',
    orderedAt: '2021-07-23T00:00:00.000Z',
    currency: 'AUD',
    totalCents: 7575,
    checksum: `checksum-${sourceOrderId ?? 'none'}`,
  };
}

describe('matching', () => {
  it('attaches an invoice whose order the parser actually built', () => {
    const { matched, rejected } = matchAmazonInvoices(
      [invoice('a.pdf', RETAIL)],
      new Set([RETAIL])
    );
    expect(rejected).toEqual([]);
    expect(matched).toHaveLength(1);
    expect(matched[0]?.sourceOrderId).toBe(RETAIL);
    expect(matched[0]?.documentKind).toBe('tax_invoice');
  });

  it('reports an order id the parser never produced instead of attaching it', () => {
    const { matched, rejected } = matchAmazonInvoices(
      [invoice('a.pdf', OTHER_RETAIL)],
      new Set([RETAIL])
    );
    expect(matched).toEqual([]);
    expect(rejected[0]?.kind).toBe('unknown-order');
    // The report has to name the order, or nobody can chase it.
    expect(rejected[0]?.detail).toContain(OTHER_RETAIL);
  });

  it('separates a digital order from a retail id that went missing', () => {
    // Both are absent from the order set, and they mean opposite things: a
    // digital order is a known gap in what the adapter reads, a retail one
    // is an order the parser dropped. One kind for both would bury the bug.
    const { rejected } = matchAmazonInvoices(
      [invoice('a.pdf', DIGITAL), invoice('b.pdf', OTHER_RETAIL)],
      new Set([RETAIL])
    );
    expect(rejected.map((one) => one.kind)).toEqual(['digital-order', 'unknown-order']);
  });

  it('keeps one copy when the bundle ships the same invoice twice', () => {
    // Two files, different bytes, same invoice number on the same order. The
    // content-addressed store cannot collapse them, so this must.
    const first = invoice('3.1/1.pdf', RETAIL);
    const second = scan('3.2/1.pdf', pdfWithRuns([...legacyInvoice(RETAIL, DOCUMENT), 'Page 1']));
    expect(first.bytes.equals(second.bytes)).toBe(false);

    const { matched, rejected } = matchAmazonInvoices([first, second], new Set([RETAIL]));
    expect(matched.map((one) => one.path)).toEqual(['3.1/1.pdf']);
    expect(rejected[0]?.kind).toBe('duplicate-document');
  });

  it('keeps both when one order has two genuinely different invoices', () => {
    // Sixteen orders in the reference bundle have more than one shipment
    // invoiced separately. Deduping on the order alone would lose them.
    const { matched } = matchAmazonInvoices(
      [invoice('a.pdf', RETAIL, 'INV-1'), invoice('b.pdf', RETAIL, 'INV-2')],
      new Set([RETAIL])
    );
    expect(matched).toHaveLength(2);
  });

  it('keeps both when two orders were invoiced under the same number', () => {
    const { matched } = matchAmazonInvoices(
      [invoice('a.pdf', RETAIL, DOCUMENT), invoice('b.pdf', OTHER_RETAIL, DOCUMENT)],
      new Set([RETAIL, OTHER_RETAIL])
    );
    expect(matched).toHaveLength(2);
  });

  it('never treats two documents with no number as copies of each other', () => {
    const undated = (path: string) => scan(path, pdfWithRuns(['TAX INVOICE', 'Order no.', RETAIL]));
    const { matched } = matchAmazonInvoices(
      [undated('a.pdf'), undated('b.pdf')],
      new Set([RETAIL])
    );
    expect(matched).toHaveLength(2);
  });

  it('carries an unreadable PDF through as its own refusal', () => {
    const { rejected } = matchAmazonInvoices(
      [scan('a.pdf', pdfWithStreams([{ content: 'scan', compressed: false }]))],
      new Set([RETAIL])
    );
    expect(rejected[0]?.kind).toBe('no-text-layer');
  });

  it('counts refusals by kind', () => {
    const { rejected } = matchAmazonInvoices(
      [invoice('a.pdf', DIGITAL), invoice('b.pdf', DIGITAL), invoice('c.pdf', OTHER_RETAIL)],
      new Set([RETAIL])
    );
    expect(summariseRejections(rejected)).toBe('digital-order=2 unknown-order=1');
  });

  it('summarises nothing as an empty string', () => {
    expect(summariseRejections([])).toBe('');
  });
});

describe('attaching', () => {
  const documents = new Map([[RETAIL, [{ documentUri: 'pops://purchases/receipt/abc' }]]]);

  it('hangs the documents on the order that names them', () => {
    const [attached] = attachInvoiceDocuments([order(RETAIL)], documents);
    expect(attached?.documents).toEqual([{ documentUri: 'pops://purchases/receipt/abc' }]);
  });

  it('returns every order, including the ones with no invoice', () => {
    // 498 of the reference bundle's 748 orders have no invoice at all.
    // Filtering here would drop them from the backfill entirely.
    const attached = attachInvoiceDocuments([order(RETAIL), order(OTHER_RETAIL)], documents);
    expect(attached).toHaveLength(2);
    expect(attached[1]?.documents).toBeUndefined();
  });

  it('leaves an order the parser could not name alone', () => {
    expect(attachInvoiceDocuments([order(null)], documents)[0]?.documents).toBeUndefined();
  });

  it('appends to documents the order already carried', () => {
    const existing: CreatePurchaseInput = {
      ...order(RETAIL),
      documents: [{ documentUri: 'pops://purchases/receipt/existing' }],
    };
    expect(attachInvoiceDocuments([existing], documents)[0]?.documents).toEqual([
      { documentUri: 'pops://purchases/receipt/existing' },
      { documentUri: 'pops://purchases/receipt/abc' },
    ]);
  });

  it('does not mutate the orders it was given', () => {
    const original = order(RETAIL);
    attachInvoiceDocuments([original], documents);
    expect(original.documents).toBeUndefined();
  });
});

describe('reading the bundle', () => {
  function bundleWith(files: Readonly<Record<string, Buffer>>): string {
    const root = mkdtempSync(join(tmpdir(), 'amazon-bundle-'));
    for (const [relative, bytes] of Object.entries(files)) {
      const path = join(root, INVOICE_BUNDLE_DIRECTORY, relative);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, bytes);
    }
    return root;
  }

  it('reads invoices from every one of the sibling directories', () => {
    const root = bundleWith({
      'Retail.TransactionalInvoicing.1/Retail.TransactionalInvoicing.pdf': pdfWithRuns(
        legacyInvoice(RETAIL, 'INV-1')
      ),
      'Retail.TransactionalInvoicing.3.1/Retail.TransactionalInvoicing.1.pdf': pdfWithRuns(
        modernInvoice(OTHER_RETAIL, 'INV-2')
      ),
    });
    const scanned = readAmazonInvoiceBundle(root);
    expect(scanned).toHaveLength(2);
    expect(scanned.every((one) => one.read.ok)).toBe(true);
  });

  it('keeps two invoices that share a filename in different directories', () => {
    // `.3.2` restarts the numbering `.3.1` already used, so the same filename
    // names two different invoices for two different orders. Keying anything
    // on the filename collapses them into one.
    const root = bundleWith({
      'Retail.TransactionalInvoicing.3.1/Retail.TransactionalInvoicing.1.pdf': pdfWithRuns(
        legacyInvoice(RETAIL, 'INV-1')
      ),
      'Retail.TransactionalInvoicing.3.2/Retail.TransactionalInvoicing.1.pdf': pdfWithRuns(
        legacyInvoice(OTHER_RETAIL, 'INV-2')
      ),
    });

    const scanned = readAmazonInvoiceBundle(root);
    expect(new Set(scanned.map((one) => one.path)).size).toBe(2);
    const { matched } = matchAmazonInvoices(scanned, new Set([RETAIL, OTHER_RETAIL]));
    expect(matched.map((one) => one.sourceOrderId).toSorted()).toEqual(
      [RETAIL, OTHER_RETAIL].toSorted()
    );
  });

  it('reads them in a stable order, so which duplicate wins never moves', () => {
    const files = {
      'Retail.TransactionalInvoicing.3.2/Retail.TransactionalInvoicing.1.pdf': pdfWithRuns(
        legacyInvoice(RETAIL, 'INV-2')
      ),
      'Retail.TransactionalInvoicing.3.1/Retail.TransactionalInvoicing.2.pdf': pdfWithRuns(
        legacyInvoice(RETAIL, 'INV-1')
      ),
    };
    expect(readAmazonInvoiceBundle(bundleWith(files)).map((one) => one.path)).toEqual([
      join(
        INVOICE_BUNDLE_DIRECTORY,
        'Retail.TransactionalInvoicing.3.1',
        'Retail.TransactionalInvoicing.2.pdf'
      ),
      join(
        INVOICE_BUNDLE_DIRECTORY,
        'Retail.TransactionalInvoicing.3.2',
        'Retail.TransactionalInvoicing.1.pdf'
      ),
    ]);
  });

  it('ignores the bundle files that are not invoices', () => {
    const root = bundleWith({
      'Retail.TransactionalInvoicing.3.1/Retail.TransactionalInvoicing.1.pdf': pdfWithRuns(
        legacyInvoice(RETAIL, 'INV-1')
      ),
      'Retail.TransactionalInvoicing.3.1/README.txt': Buffer.from('not an invoice'),
      'Sustainability.Value.Metrics.3/Sustainability.Value.Metrics.3.csv': Buffer.from('a,b\n1,2'),
    });
    expect(readAmazonInvoiceBundle(root)).toHaveLength(1);
  });

  it('treats a bundle with no invoices as empty rather than failing', () => {
    // An account that was never sent a tax invoice simply has no such
    // directory, the same way one that never returned anything has no
    // `Refund Details.csv`.
    expect(readAmazonInvoiceBundle(mkdtempSync(join(tmpdir(), 'empty-bundle-')))).toEqual([]);
  });
});
