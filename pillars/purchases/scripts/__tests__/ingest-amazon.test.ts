/**
 * The key-before-parse ordering: a missing key must fail before the bundle
 * is read, not after.
 *
 * Nothing here mocks `node:fs`. The bundles are real directories in a temp
 * dir, so the invoice walk, the content-addressed store and the ordering
 * guarantee are all exercised against a real filesystem — and the ordering
 * test needs no mock at all: it points the CLI at a path that does not
 * exist, so a regression to parse-then-check surfaces as `ENOENT` instead
 * of the message about the key.
 */
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  legacyInvoice,
  pdfWithRuns,
} from '../../src/ingest/amazon/__tests__/__fixtures__/invoice-pdf.js';
import { INGEST_API_KEY_ENV } from '../backfill.js';

vi.mock('../../src/ingest/amazon/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/ingest/amazon/index.js')>()),
  parseAmazonOrderHistory: vi.fn(() => ({ orders: [], anomalies: [] })),
}));

const { parseAmazonOrderHistory } = await import('../../src/ingest/amazon/index.js');
const { main, storeInvoices } = await import('../ingest-amazon.js');

const parseMock = vi.mocked(parseAmazonOrderHistory);

const KNOWN_ORDER = '503-1631401-2789435';
const UNKNOWN_ORDER = '249-4494679-2017412';
const DOCUMENT = '12484342-INV-AU-2021-26473870';

function temporaryDirectory(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** A bundle root holding an `Order History.csv` and the given invoices. */
function bundleWith(invoices: Readonly<Record<string, Buffer>> = {}): string {
  const root = temporaryDirectory('amazon-cli-');
  mkdirSync(join(root, 'Your Amazon Orders'), { recursive: true });
  writeFileSync(join(root, 'Your Amazon Orders', 'Order History.csv'), 'order id,order date\n');

  for (const [relative, bytes] of Object.entries(invoices)) {
    const path = join(root, 'Additional Data', 'Retail.TransactionalInvoicing.3.1', relative);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, bytes);
  }
  return root;
}

function invoiceFor(sourceOrderId: string, documentNumber = DOCUMENT): Buffer {
  return pdfWithRuns(legacyInvoice(sourceOrderId, documentNumber));
}

function orderNamed(sourceOrderId: string) {
  return {
    source: 'amazon' as const,
    sourceOrderId,
    ingestMethod: 'export' as const,
    orderedAt: '2021-07-23T00:00:00.000Z',
    currency: 'AUD',
    totalCents: 7575,
    checksum: 'checksum',
  };
}

/** Everything the CLI printed, as one string. */
function warnings(): string {
  return vi.mocked(console.warn).mock.calls.flat().join('\n');
}

beforeEach(() => {
  vi.unstubAllEnvs();
  parseMock.mockReset();
  parseMock.mockReturnValue({ orders: [], anomalies: [] });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('main', () => {
  it('fails on the key before reading the bundle', async () => {
    vi.stubEnv(INGEST_API_KEY_ENV, '');

    // A path that does not exist: reading first would fail with ENOENT.
    await expect(main([join(tmpdir(), 'no-such-bundle-at-all')])).rejects.toThrow(
      new RegExp(INGEST_API_KEY_ENV)
    );
  });

  it('still requires the bundle path argument before touching the key', async () => {
    vi.stubEnv(INGEST_API_KEY_ENV, '');

    await expect(main([])).rejects.toThrow(/usage: pnpm ingest:amazon/);
  });

  it('--dry-run parses the bundle without a key', async () => {
    vi.stubEnv(INGEST_API_KEY_ENV, '');

    await expect(main([bundleWith(), '--dry-run'])).resolves.toBeUndefined();

    expect(warnings()).toContain('--dry-run: nothing was written');
  });

  it('treats a bundle with no invoice directory as having none', async () => {
    vi.stubEnv(INGEST_API_KEY_ENV, '');

    await main([bundleWith(), '--dry-run']);

    expect(warnings()).toContain('found 0 invoice PDF(s)');
  });
});

describe('invoice reporting', () => {
  beforeEach(() => {
    vi.stubEnv(INGEST_API_KEY_ENV, '');
  });

  it('says how many invoices attach and to how many orders', async () => {
    parseMock.mockReturnValue({ orders: [orderNamed(KNOWN_ORDER)], anomalies: [] });

    await main([bundleWith({ '1.pdf': invoiceFor(KNOWN_ORDER) }), '--dry-run']);

    expect(warnings()).toContain('found 1 invoice PDF(s), attaching 1 to 1 order(s)');
  });

  it('names every invoice it could not attach rather than dropping it quietly', async () => {
    parseMock.mockReturnValue({ orders: [orderNamed(KNOWN_ORDER)], anomalies: [] });

    await main([bundleWith({ '1.pdf': invoiceFor(UNKNOWN_ORDER) }), '--dry-run']);

    const output = warnings();
    expect(output).toContain('invoices not attached: unknown-order=1');
    // The path and the order id, or the report cannot be acted on.
    expect(output).toContain('1.pdf');
    expect(output).toContain(UNKNOWN_ORDER);
  });

  it('writes no evidence to the store on a dry run', async () => {
    const receipts = temporaryDirectory('amazon-receipts-');
    vi.stubEnv('PURCHASES_RECEIPT_DIR', receipts);
    parseMock.mockReturnValue({ orders: [orderNamed(KNOWN_ORDER)], anomalies: [] });

    await main([bundleWith({ '1.pdf': invoiceFor(KNOWN_ORDER) }), '--dry-run']);

    expect(readdirSync(receipts)).toEqual([]);
  });
});

describe('storing what matched', () => {
  it('writes each invoice once and hands back its URI', () => {
    const receipts = temporaryDirectory('amazon-receipts-');
    vi.stubEnv('PURCHASES_RECEIPT_DIR', receipts);

    const stored = storeInvoices([
      {
        path: 'a.pdf',
        sourceOrderId: KNOWN_ORDER,
        bytes: invoiceFor(KNOWN_ORDER),
        documentKind: 'tax_invoice',
      },
    ]);

    const documents = stored.get(KNOWN_ORDER) ?? [];
    expect(documents).toHaveLength(1);
    expect(documents[0]?.documentUri).toMatch(/^pops:\/\/purchases\/receipt\/[0-9a-f]{64}$/u);
    expect(documents[0]?.kind).toBe('tax_invoice');
    expect(readdirSync(receipts)).toHaveLength(1);
  });

  it('adds a URI once per order when two files hold identical bytes', () => {
    // Content addressing gives both the same path and therefore the same URI.
    // `uq_purchase_documents` would reject the whole order for the repeat
    // rather than ignore it, so the second has to be dropped here.
    vi.stubEnv('PURCHASES_RECEIPT_DIR', temporaryDirectory('amazon-receipts-'));
    const bytes = invoiceFor(KNOWN_ORDER);

    const stored = storeInvoices([
      { path: 'a.pdf', sourceOrderId: KNOWN_ORDER, bytes, documentKind: 'tax_invoice' },
      {
        path: 'b.pdf',
        sourceOrderId: KNOWN_ORDER,
        bytes: Buffer.from(bytes),
        documentKind: 'tax_invoice',
      },
    ]);

    expect(stored.get(KNOWN_ORDER)).toHaveLength(1);
  });

  it('keeps the same bytes on two different orders', () => {
    // The constraint is per order, so one document shared by two orders is
    // not a repeat and dropping it would lose evidence from the second.
    vi.stubEnv('PURCHASES_RECEIPT_DIR', temporaryDirectory('amazon-receipts-'));
    const bytes = invoiceFor(KNOWN_ORDER);

    const stored = storeInvoices([
      { path: 'a.pdf', sourceOrderId: KNOWN_ORDER, bytes, documentKind: 'tax_invoice' },
      { path: 'b.pdf', sourceOrderId: UNKNOWN_ORDER, bytes, documentKind: 'other' },
    ]);

    expect(stored.get(KNOWN_ORDER)).toHaveLength(1);
    expect(stored.get(UNKNOWN_ORDER)).toHaveLength(1);
  });
});
