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
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AMAZON_SOURCE_ID,
  REFUND_DETAILS_BUNDLE_PATH,
  parseAmazonOrderHistory,
} from '../src/ingest/amazon/index.js';
import {
  createIngestClient,
  postPurchases,
  reportOutcome,
  runCli,
  summariseAnomalies,
  upsertSource,
} from './backfill.js';

const ORDER_HISTORY_PATH = join('Your Amazon Orders', 'Order History.csv');
const REFUND_DETAILS_PATH = join(...REFUND_DETAILS_BUNDLE_PATH);

function readBundlePath(argv: readonly string[]): string {
  const bundlePath = argv.find((arg) => !arg.startsWith('--'));
  if (bundlePath === undefined) {
    throw new Error(
      'usage: pnpm ingest:amazon -- "<bundle-root>" [--dry-run]\n' +
        '<bundle-root> is the unzipped DSAR bundle: the directory CONTAINING ' +
        '"Your Amazon Orders", not that folder itself.'
    );
  }
  return bundlePath;
}

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
  const bundlePath = readBundlePath(argv);
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

  reportOutcome(await postPurchases(client, orders));
}

// Guarded so importing `main` for tests does not also run the CLI.
if (import.meta.url === `file://${process.argv[1]}`) {
  await runCli(main);
}
