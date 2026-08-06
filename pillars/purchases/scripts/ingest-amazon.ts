/**
 * Backfill an Amazon DSAR bundle through `POST /purchases`.
 *
 * Deliberately a CLI over HTTP rather than a route: the bundle is a
 * multi-hundred-megabyte directory the user downloads and unzips, and the
 * upload surface that would accept it belongs with the receipt drop-zone
 * (POPS-240). Going through the same endpoint every other adapter writes
 * through means this exercises the real validation, dedup and write path
 * rather than a private shortcut into the database.
 *
 *   pnpm ingest:amazon -- "/path/to/Your Orders" [--dry-run]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AMAZON_SOURCE_ID, parseAmazonOrderHistory } from '../src/ingest/amazon/index.js';

import type { AmazonAnomaly } from '../src/ingest/amazon/index.js';

const ORDER_HISTORY_PATH = join('Your Amazon Orders', 'Order History.csv');

const DEFAULT_BASE_URL = 'http://localhost:3013';

interface Args {
  readonly bundlePath: string;
  readonly dryRun: boolean;
}

function readArgs(argv: readonly string[]): Args {
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const bundlePath = positional[0];
  if (bundlePath === undefined) {
    throw new Error(
      'usage: pnpm ingest:amazon -- "/path/to/Your Orders" [--dry-run]\n' +
        'The directory is the unzipped DSAR bundle — the one containing "Your Amazon Orders".'
    );
  }
  return { bundlePath, dryRun: argv.includes('--dry-run') };
}

function summarise(anomalies: readonly AmazonAnomaly[]): string {
  const counts = new Map<string, number>();
  for (const anomaly of anomalies) {
    counts.set(anomaly.kind, (counts.get(anomaly.kind) ?? 0) + 1);
  }
  return [...counts]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([kind, count]) => `${kind}=${String(count)}`)
    .join(' ');
}

async function upsertSource(baseUrl: string): Promise<void> {
  const response = await fetch(`${baseUrl}/sources/${AMAZON_SOURCE_ID}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      label: 'Amazon',
      // Covers `AMAZON MKTPLACE AU`, `Amazon AU`, `AMAZON.COM.AU` — the
      // linker's stage-0 blocking, not a matcher in its own right.
      descriptorPattern: 'AMAZON',
      // One order routinely settles as several shipment charges days apart,
      // so Amazon gets review rather than auto-linking.
      autoLinkPolicy: 'review',
      ingestAdapter: 'amazon-dsar-export',
    }),
  });
  if (!response.ok) {
    throw new Error(
      `could not register the amazon source (${String(response.status)}): ${await response.text()}`
    );
  }
}

async function main(): Promise<void> {
  const { bundlePath, dryRun } = readArgs(process.argv.slice(2));
  const baseUrl = process.env.PURCHASES_BASE_URL ?? DEFAULT_BASE_URL;

  const csvPath = join(bundlePath, ORDER_HISTORY_PATH);
  const { orders, anomalies } = parseAmazonOrderHistory(readFileSync(csvPath, 'utf8'));

  const lines = orders.reduce((count, order) => count + (order.items?.length ?? 0), 0);
  const shipments = orders.reduce((count, order) => count + (order.shipments?.length ?? 0), 0);
  console.warn(
    `parsed ${String(orders.length)} orders, ${String(shipments)} shipments, ${String(lines)} lines`
  );
  if (anomalies.length > 0) console.warn(`anomalies: ${summarise(anomalies)}`);

  if (dryRun) {
    console.warn('--dry-run: nothing was written');
    return;
  }

  await upsertSource(baseUrl);

  let created = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const order of orders) {
    const response = await fetch(`${baseUrl}/purchases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(order),
    });

    if (response.status === 201) created += 1;
    // A checksum or (source, orderId) that already exists. Re-running a
    // backfill is expected, so this is the normal path, not an error.
    else if (response.status === 409) skipped += 1;
    else {
      failures.push(
        `${order.sourceOrderId ?? '?'} -> ${String(response.status)} ${await response.text()}`
      );
    }
  }

  console.warn(
    `created ${String(created)}, skipped ${String(skipped)}, failed ${String(failures.length)}`
  );
  for (const failure of failures.slice(0, 10)) console.error(`  ${failure}`);

  if (failures.length > 0) process.exitCode = 1;
}

await main();
