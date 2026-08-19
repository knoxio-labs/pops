/**
 * What the CLI does with a bundle, from both ends.
 *
 * The key-before-parse ordering is one half: a missing key must fail before
 * the bundle is read, not after. The other is what reaches the wire and the
 * volume — the invoices are attached by a single expression, and every test
 * that stops at `--dry-run` stays green when that expression posts the orders
 * unattached.
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
import { AuthFailureError, INGEST_API_KEY_ENV } from '../backfill.js';

vi.mock('../../src/ingest/amazon/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/ingest/amazon/index.js')>()),
  parseAmazonOrderHistory: vi.fn(() => ({ orders: [], anomalies: [] })),
}));

const { parseAmazonOrderHistory } = await import('../../src/ingest/amazon/index.js');
const { main, planInvoiceDocuments } = await import('../ingest-amazon.js');

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

/** Every stored file under a store root, whichever shard it landed in. */
function storedFiles(root: string): string[] {
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((entry) => entry.endsWith('.pdf'));
}

let requests: { url: string; body: unknown }[];

/**
 * A fetch that answers every purchase with `status` and every other call with
 * a 200, so the source registration succeeds whatever the orders do.
 */
function stubFetch(status: number): void {
  requests = [];
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    requests.push({ url, body: init.body });
    const purchase = url.endsWith('/purchases');
    return Promise.resolve(new Response('{}', { status: purchase ? status : 200 }));
  });
}

/** The bodies of the `POST /purchases` requests, in order. */
function purchaseRequests(): unknown[] {
  return requests.filter(({ url }) => url.endsWith('/purchases')).map(({ body }) => body);
}

beforeEach(() => {
  vi.unstubAllEnvs();
  requests = [];
  parseMock.mockReset();
  parseMock.mockReturnValue({ orders: [], anomalies: [] });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.exitCode = undefined;
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

    expect(warnings()).toContain('found 1 invoice PDF(s); 1 name 1 of the parsed order(s)');
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

describe('planning what to store', () => {
  function matchedInvoice(path: string, sourceOrderId: string, bytes = invoiceFor(sourceOrderId)) {
    return { path, sourceOrderId, bytes, documentKind: 'tax_invoice' as const };
  }

  it('names each invoice without writing a byte', () => {
    // The URI is a function of the bytes, so it can be minted before anyone
    // knows whether the order it belongs to will be created.
    const receipts = temporaryDirectory('amazon-receipts-');
    vi.stubEnv('PURCHASES_RECEIPT_DIR', receipts);

    const planned = planInvoiceDocuments([matchedInvoice('a.pdf', KNOWN_ORDER)]).get(KNOWN_ORDER);

    expect(planned).toHaveLength(1);
    expect(planned?.[0]?.document.documentUri).toMatch(
      /^pops:\/\/purchases\/receipt\/[0-9a-f]{64}$/u
    );
    expect(planned?.[0]?.document.kind).toBe('tax_invoice');
    expect(storedFiles(receipts)).toEqual([]);
  });

  it('names a URI once per order when two files hold identical bytes', () => {
    // Content addressing gives both the same path and therefore the same URI.
    // `uq_purchase_documents` would reject the whole order for the repeat
    // rather than ignore it, so the second has to be dropped here.
    const bytes = invoiceFor(KNOWN_ORDER);

    const plan = planInvoiceDocuments([
      matchedInvoice('a.pdf', KNOWN_ORDER, bytes),
      matchedInvoice('b.pdf', KNOWN_ORDER, Buffer.from(bytes)),
    ]);

    expect(plan.get(KNOWN_ORDER)).toHaveLength(1);
  });

  it('keeps the same bytes on two different orders', () => {
    // The constraint is per order, so one document shared by two orders is
    // not a repeat and dropping it would lose evidence from the second.
    const bytes = invoiceFor(KNOWN_ORDER);

    const plan = planInvoiceDocuments([
      matchedInvoice('a.pdf', KNOWN_ORDER, bytes),
      matchedInvoice('b.pdf', UNKNOWN_ORDER, bytes),
    ]);

    expect(plan.get(KNOWN_ORDER)).toHaveLength(1);
    expect(plan.get(UNKNOWN_ORDER)).toHaveLength(1);
  });
});

describe('the write path', () => {
  let receipts: string;

  beforeEach(() => {
    receipts = temporaryDirectory('amazon-receipts-');
    vi.stubEnv('PURCHASES_RECEIPT_DIR', receipts);
    vi.stubEnv(INGEST_API_KEY_ENV, 'pops_sa_test.secret');
    parseMock.mockReturnValue({ orders: [orderNamed(KNOWN_ORDER)], anomalies: [] });
  });

  it('sends the invoice on the order it belongs to', async () => {
    // The one line that makes an invoice reach the database. Posting the
    // orders as the parser built them would leave every assertion about the
    // reader intact and the evidence in the bundle.
    stubFetch(201);

    await main([bundleWith({ '1.pdf': invoiceFor(KNOWN_ORDER) })]);

    expect(JSON.parse(String(purchaseRequests()[0]))).toMatchObject({
      sourceOrderId: KNOWN_ORDER,
      documents: [
        {
          documentUri: expect.stringMatching(/^pops:\/\/purchases\/receipt\/[0-9a-f]{64}$/u),
          kind: 'tax_invoice',
        },
      ],
    });
  });

  it('leaves the bytes on the volume under the name the created row points at', async () => {
    // The URI is in the database now, so the file it names has to be there —
    // under that name, not merely somewhere in the store.
    stubFetch(201);

    await main([bundleWith({ '1.pdf': invoiceFor(KNOWN_ORDER) })]);

    const posted = String(purchaseRequests()[0]);
    const sha256 = /pops:\/\/purchases\/receipt\/([0-9a-f]{64})/u.exec(posted)?.[1] ?? '';
    expect(sha256).not.toBe('');
    expect(storedFiles(receipts)).toEqual([join(sha256.slice(0, 2), `${sha256}.pdf`)]);
    expect(warnings()).toContain('attached 1 invoice(s)');
  });

  it('leaves nothing on the volume for an order that already existed', async () => {
    // A 409 writes no row, so the bytes reference nothing and there is no
    // route that would ever collect them.
    stubFetch(409);

    await main([bundleWith({ '1.pdf': invoiceFor(KNOWN_ORDER) })]);

    expect(storedFiles(receipts)).toEqual([]);
  });

  it('leaves nothing on the volume for an order the write refused', async () => {
    stubFetch(422);

    await main([bundleWith({ '1.pdf': invoiceFor(KNOWN_ORDER) })]);

    expect(storedFiles(receipts)).toEqual([]);
  });

  it('leaves nothing on the volume when the run is stopped part-way by a 403', async () => {
    // The stop leaves the loop through a throw, so the sweep that takes the
    // bytes back off the volume has to happen on that way out too.
    stubFetch(403);

    await expect(main([bundleWith({ '1.pdf': invoiceFor(KNOWN_ORDER) })])).rejects.toThrow(
      AuthFailureError
    );

    expect(storedFiles(receipts)).toEqual([]);
  });

  it('says the invoices went nowhere rather than letting the match count read as one', async () => {
    stubFetch(409);

    await main([bundleWith({ '1.pdf': invoiceFor(KNOWN_ORDER) })]);

    const output = warnings();
    expect(output).toContain('attached 0 invoice(s)');
    expect(output).toContain('none of the 1 matched invoice(s) were attached');
  });
});
