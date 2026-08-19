/**
 * Backfill the digital half of an Amazon DSAR bundle through
 * `POST /purchases`.
 *
 *   POPS_INTERNAL_API_KEY=<key> pnpm ingest:amazon-digital -- "<bundle-root>" [--dry-run]
 *
 * Its own command rather than a second phase of `ingest:amazon` because it
 * writes under its own source: digital Order IDs are a separate namespace,
 * and the two feeds settle differently enough to want different matching
 * configuration. Running one must not be able to fail the other.
 *
 * `<bundle-root>` is the same directory `ingest:amazon` takes — the one
 * CONTAINING `Your Amazon Orders/`, not that folder itself.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AMAZON_DIGITAL_SOURCE_ID,
  DIGITAL_ORDERS_BUNDLE_PATH,
  DIGITAL_RETURNS_BUNDLE_PATH,
  parseAmazonDigitalOrders,
} from '../src/ingest/amazon-digital/index.js';
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

const DIGITAL_ORDERS_PATH = join(...DIGITAL_ORDERS_BUNDLE_PATH);
const DIGITAL_RETURNS_PATH = join(...DIGITAL_RETURNS_BUNDLE_PATH);

/**
 * A digital purchase is authorised and fulfilled in the same minute —
 * `Order Date` equals `Fulfilled Date` on all 90 orders of the reference
 * bundle — so it settles 1:1 rather than as the shipment splits days apart
 * that the pillar's 21-day default exists to absorb. A week either side is
 * wide enough for a statement's own posting lag and narrow enough to keep
 * two same-priced subscription renewals in different months apart.
 */
const DIGITAL_SETTLEMENT_WINDOW_DAYS = 3;

/**
 * Read `Digital Returns.csv`, which a bundle from an account that never
 * returned a digital purchase does not carry.
 *
 * Only a missing file is tolerated, for the reason the physical CLI
 * tolerates only a missing `Refund Details.csv`: proceeding past an
 * unreadable one would land every returned order at its full total, which
 * is indistinguishable from an account that returned nothing.
 */
function readDigitalReturns(bundlePath: string): string | undefined {
  try {
    return readFileSync(join(bundlePath, DIGITAL_RETURNS_PATH), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    console.warn(`no ${DIGITAL_RETURNS_PATH} in this bundle; no returns will be recorded`);
    return undefined;
  }
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const bundlePath = readBundlePath(argv, 'ingest:amazon-digital');
  const dryRun = argv.includes('--dry-run');

  // Resolved before the bundle is read, so a missing key fails before the
  // parse rather than after it.
  const client = dryRun ? undefined : createIngestClient();

  const { orders, anomalies } = parseAmazonDigitalOrders(
    readFileSync(join(bundlePath, DIGITAL_ORDERS_PATH), 'utf8'),
    readDigitalReturns(bundlePath)
  );

  const lines = orders.reduce((count, order) => count + (order.items?.length ?? 0), 0);
  const refunds = orders.reduce((count, order) => count + (order.charges?.length ?? 0), 0);
  const free = orders.filter((order) => order.totalCents === 0).length;
  console.warn(`parsed ${String(orders.length)} orders, ${String(lines)} lines`);
  console.warn(
    `${String(free)} order(s) cost nothing, and ${String(refunds)} return(s) moved money back`
  );
  if (anomalies.length > 0) console.warn(`anomalies: ${summariseAnomalies(anomalies)}`);

  if (client === undefined) {
    console.warn('--dry-run: nothing was written');
    return;
  }

  await upsertSource(client, {
    id: AMAZON_DIGITAL_SOURCE_ID,
    label: 'Amazon Digital',
    // Null rather than `AMAZON%`. Half of these orders bill as Audible and
    // half as Amazon, one LIKE pattern cannot express both, and the failure
    // of a too-narrow pattern is the silent one: every Audible charge would
    // be blocked at stage 0 and stay residual forever with nothing shown to
    // a human. Declaring no pattern matches on amount and date instead, and
    // `review` keeps a person in front of every result.
    descriptorPattern: null,
    settlementWindowDays: DIGITAL_SETTLEMENT_WINDOW_DAYS,
    autoLinkPolicy: 'review',
    ingestAdapter: 'amazon-dsar-digital',
  });

  reportOutcome(await postPurchases(client, orders));
}

if (isCliEntrypoint(import.meta.url)) {
  await runCli(main);
}
