/**
 * Backfill an Amazon DSAR bundle through `POST /purchases`.
 *
 * Deliberately a CLI rather than a route: the bundle is a multi-hundred-
 * megabyte directory the user downloads and unzips, and the upload surface
 * that would accept it belongs with the receipt drop-zone (POPS-240).
 *
 *   POPS_INTERNAL_API_KEY=<key> pnpm ingest:amazon -- "<bundle-root>" [--dry-run]
 *
 * `<bundle-root>` is the directory CONTAINING `Your Amazon Orders/`, not
 * that folder itself. Amazon names it `Your Orders`, so the path usually
 * ends in it — which reads as if the inner folder were meant.
 *
 * The key is required for a real run and checked before the bundle is
 * parsed, so a missing one fails fast rather than after minutes of CSV work.
 * `--dry-run` needs no key; it parses and prints without making a request.
 *
 * The bundle's tax invoices are read here too, and attached to the orders they
 * name. `--dry-run` reports which of them would attach and which would not
 * without storing a byte, which is the cheap way to see what a bundle holds.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AMAZON_SOURCE_ID,
  REFUND_DETAILS_BUNDLE_PATH,
  attachInvoiceDocuments,
  matchAmazonInvoices,
  parseAmazonOrderHistory,
  readAmazonInvoiceBundle,
  summariseRejections,
  type MatchedInvoice,
} from '../src/ingest/amazon/index.js';
import { storeReceiptPart } from '../src/ingest/receipt/store.js';
import {
  createIngestClient,
  isCliEntrypoint,
  postPurchases,
  readBundlePath,
  reportOutcome,
  runCli,
  summariseAnomalies,
  upsertSource,
} from './backfill.js';

import type { CreateDocumentInput } from '../src/db/services/purchase-input.js';

const ORDER_HISTORY_PATH = join('Your Amazon Orders', 'Order History.csv');
const REFUND_DETAILS_PATH = join(...REFUND_DETAILS_BUNDLE_PATH);

/**
 * Read `Refund Details.csv`, which a bundle from an account that never
 * returned anything simply does not carry.
 *
 * Only a missing file is tolerated. A file that exists and cannot be read
 * is reported, because proceeding would land every refunded order at its
 * full total — which is indistinguishable from an account with no returns.
 */
function readRefundDetails(bundlePath: string): string | undefined {
  try {
    return readFileSync(join(bundlePath, REFUND_DETAILS_PATH), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    console.warn(`no ${REFUND_DETAILS_PATH} in this bundle; no refunds will be recorded`);
    return undefined;
  }
}

/**
 * Store each matched invoice and return what to hang on each order.
 *
 * The bytes land in this pillar's own content-addressed store, not the
 * documents pillar: `documents` is a read-only bridge over Paperless-ngx with
 * no write route at all, and blocking 325 invoices on building one is the
 * wrong order. ADR-042 wants them under `pops://documents/...` eventually and
 * POPS-1528 moves every stored file there at once; these travel with the rest.
 *
 * **The store is a local directory.** It resolves beside this pillar's SQLite
 * file, or to `PURCHASES_RECEIPT_DIR`. Run against a remote `PURCHASES_BASE_URL`
 * from a machine that cannot see the server's volume and the URIs will resolve
 * to bytes that are not there — the write succeeds and the evidence is on the
 * wrong host. Run this where the volume is mounted.
 *
 * A URI is added at most once per order. Two byte-identical files hash to one
 * path, and `uq_purchase_documents` would reject the order outright rather
 * than ignore the repeat.
 */
export function storeInvoices(
  matched: readonly MatchedInvoice[]
): ReadonlyMap<string, readonly CreateDocumentInput[]> {
  const byOrderId = new Map<string, CreateDocumentInput[]>();
  const seenUris = new Set<string>();

  for (const invoice of matched) {
    const stored = storeReceiptPart({
      mediaType: 'application/pdf',
      dataBase64: invoice.bytes.toString('base64'),
    });
    const key = `${invoice.sourceOrderId} ${stored.uri}`;
    if (seenUris.has(key)) continue;
    seenUris.add(key);

    const documents = byOrderId.get(invoice.sourceOrderId) ?? [];
    documents.push({ documentUri: stored.uri, kind: invoice.documentKind });
    byOrderId.set(invoice.sourceOrderId, documents);
  }

  return byOrderId;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const bundlePath = readBundlePath(argv, 'ingest:amazon');
  const dryRun = argv.includes('--dry-run');

  // Resolved before the bundle is read: a multi-hundred-megabyte DSAR parse
  // is real wall-clock time, and a missing key should fail before any of it
  // rather than after.
  const client = dryRun ? undefined : createIngestClient();

  const csvPath = join(bundlePath, ORDER_HISTORY_PATH);
  const { orders, anomalies } = parseAmazonOrderHistory(
    readFileSync(csvPath, 'utf8'),
    readRefundDetails(bundlePath)
  );

  const lines = orders.reduce((count, order) => count + (order.items?.length ?? 0), 0);
  const shipments = orders.reduce((count, order) => count + (order.shipments?.length ?? 0), 0);
  const refunds = orders.reduce((count, order) => count + (order.charges?.length ?? 0), 0);
  console.warn(
    `parsed ${String(orders.length)} orders, ${String(shipments)} shipments, ${String(lines)} lines`
  );
  console.warn(
    `attached ${String(refunds)} refund(s) across ` +
      `${String(orders.filter((order) => (order.charges?.length ?? 0) > 0).length)} order(s)`
  );
  if (anomalies.length > 0) console.warn(`anomalies: ${summariseAnomalies(anomalies)}`);

  const knownOrderIds = new Set<string>();
  for (const order of orders) {
    if (order.sourceOrderId !== null && order.sourceOrderId !== undefined) {
      knownOrderIds.add(order.sourceOrderId);
    }
  }

  const scanned = readAmazonInvoiceBundle(bundlePath);
  const { matched, rejected } = matchAmazonInvoices(scanned, knownOrderIds);
  console.warn(
    `found ${String(scanned.length)} invoice PDF(s), attaching ${String(matched.length)} to ` +
      `${String(new Set(matched.map((invoice) => invoice.sourceOrderId)).size)} order(s)`
  );
  if (rejected.length > 0) {
    // Listed in full, not summarised to the first few. An invoice that
    // attaches to nothing is evidence about to be dropped, and the whole
    // point of reading them was to stop doing that quietly.
    console.warn(`invoices not attached: ${summariseRejections(rejected)}`);
    for (const { path, kind, detail } of rejected) {
      console.warn(`  ${path}: ${kind} — ${detail}`);
    }
  }

  if (client === undefined) {
    console.warn('--dry-run: nothing was written');
    return;
  }

  await upsertSource(client, {
    id: AMAZON_SOURCE_ID,
    label: 'Amazon',
    // No bank descriptor is the bare word AMAZON — it is `AMAZON MKTPLACE
    // AU`, `Amazon AU`, `AMAZON.COM.AU`.
    descriptorPattern: 'AMAZON%',
    // One order routinely settles as several shipment charges days apart,
    // so Amazon gets review rather than auto-linking.
    autoLinkPolicy: 'review',
    ingestAdapter: 'amazon-dsar-export',
  });

  reportOutcome(
    await postPurchases(client, attachInvoiceDocuments(orders, storeInvoices(matched)))
  );
}

if (isCliEntrypoint(import.meta.url)) {
  await runCli(main);
}
