/**
 * Backfill an Amazon DSAR bundle through `POST /purchases`.
 *
 * Deliberately a CLI rather than a route: the bundle is a multi-hundred-
 * megabyte directory the user downloads and unzips, and the upload surface
 * that would accept it belongs with the receipt drop-zone (POPS-240).
 *
 *   pnpm ingest:amazon -- "<bundle-root>" [--dry-run]
 *
 * `<bundle-root>` is the directory CONTAINING `Your Amazon Orders/`, not
 * that folder itself. Amazon names it `Your Orders`, so the path usually
 * ends in it — which reads as if the inner folder were meant.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AMAZON_SOURCE_ID, parseAmazonOrderHistory } from '../src/ingest/amazon/index.js';
import {
  baseUrlFromEnv,
  postPurchases,
  reportOutcome,
  summariseAnomalies,
  upsertSource,
} from './backfill.js';

const ORDER_HISTORY_PATH = join('Your Amazon Orders', 'Order History.csv');

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

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const bundlePath = readBundlePath(argv);

  const csvPath = join(bundlePath, ORDER_HISTORY_PATH);
  const { orders, anomalies } = parseAmazonOrderHistory(readFileSync(csvPath, 'utf8'));

  const lines = orders.reduce((count, order) => count + (order.items?.length ?? 0), 0);
  const shipments = orders.reduce((count, order) => count + (order.shipments?.length ?? 0), 0);
  console.warn(
    `parsed ${String(orders.length)} orders, ${String(shipments)} shipments, ${String(lines)} lines`
  );
  if (anomalies.length > 0) console.warn(`anomalies: ${summariseAnomalies(anomalies)}`);

  if (argv.includes('--dry-run')) {
    console.warn('--dry-run: nothing was written');
    return;
  }

  const baseUrl = baseUrlFromEnv();
  await upsertSource(baseUrl, {
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

  reportOutcome(await postPurchases(baseUrl, orders));
}

await main();
