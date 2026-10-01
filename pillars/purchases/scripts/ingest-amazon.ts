/**
 * Backfill an Amazon DSAR bundle through `POST /purchases`.
 *
 * Deliberately a CLI rather than a route: the bundle is a multi-hundred-
 * megabyte directory the user downloads and unzips, and the upload surface
 * that would accept it belongs with the receipt drop-zone (POPS-240).
 *
 *   POPS_INTERNAL_API_KEY=<key> pnpm ingest:amazon -- "<bundle-root>" [flags]
 *
 * `<bundle-root>` is the directory CONTAINING `Your Amazon Orders/`, not
 * that folder itself. Amazon names it `Your Orders`, so the path usually
 * ends in it — which reads as if the inner folder were meant.
 *
 * The key is required for a real run and checked before the bundle is
 * parsed, so a missing one fails fast rather than after minutes of CSV work.
 * `--dry-run` needs no key; it parses and prints without making a request.
 *
 * The bundle's tax invoices are read here too, and ride on the orders this run
 * creates. They cannot reach an order that already exists that way: documents
 * travel in the create request and `POST /purchases` refuses a second one at
 * the checksum. `--attach-existing` is the second pass that does reach them,
 * posting each invoice to `POST /purchases/{id}/documents`; running it again
 * is a no-op, because an invoice already on an order comes back as a 409.
 *
 * `--dry-run` reports what the bundle holds and which invoices name an order
 * it parsed, without storing a byte or making a request.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isCliEntrypoint } from '@pops/pillar-sdk/node';

import {
  AMAZON_DESCRIPTOR_PATTERN,
  AMAZON_SETTLEMENT_WINDOW_DAYS,
  AMAZON_SOURCE_ID,
  REFUND_DETAILS_BUNDLE_PATH,
  matchAmazonInvoices,
  parseAmazonOrderHistory,
  readAmazonInvoiceBundle,
} from '../src/ingest/amazon/index.js';
import { postWithInvoices, reportInvoiceMatches } from './amazon-invoice-backfill.js';
import {
  createIngestClient,
  readBundlePath,
  runCli,
  summariseAnomalies,
  upsertSource,
} from './backfill.js';

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

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const bundlePath = readBundlePath(argv, 'ingest:amazon');
  const dryRun = argv.includes('--dry-run');
  const attachExisting = argv.includes('--attach-existing');

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
  reportInvoiceMatches(scanned.length, matched, rejected);

  if (client === undefined) {
    console.warn('--dry-run: nothing was written');
    return;
  }

  await upsertSource(client, {
    id: AMAZON_SOURCE_ID,
    label: 'Amazon',
    descriptorPattern: AMAZON_DESCRIPTOR_PATTERN,
    settlementWindowDays: AMAZON_SETTLEMENT_WINDOW_DAYS,
    // One order routinely settles as several shipment charges days apart,
    // so Amazon gets review rather than auto-linking.
    autoLinkPolicy: 'review',
    ingestAdapter: 'amazon-dsar-export',
  });

  await postWithInvoices(client, {
    source: AMAZON_SOURCE_ID,
    sourceLabel: 'Amazon',
    orders,
    matched,
    attachExisting,
  });
}

if (isCliEntrypoint(import.meta.url)) {
  await runCli(main);
}
