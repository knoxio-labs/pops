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
import {
  attachToExistingOrders,
  createInvoiceWriter,
  planInvoiceDocuments,
  plannedDocuments,
  type AttachExistingOutcome,
  type InvoiceWriteOutcome,
} from './amazon-invoices.js';
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

import type { CreatePurchaseInput } from '../src/db/services/purchase-input.js';
import type { IngestClient } from './backfill.js';

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
  // What the bundle holds, not what was written: an invoice reaches the
  // database only if the order it names is created in this run or named by
  // the second pass, neither of which has happened yet. The outcome is
  // reported after the requests, below.
  console.warn(
    `found ${String(scanned.length)} invoice PDF(s); ${String(matched.length)} name ` +
      `${String(new Set(matched.map((invoice) => invoice.sourceOrderId)).size)} of the ` +
      'parsed order(s)'
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

  await postWithInvoices(client, orders, matched, attachExisting);
}

/**
 * Post the orders carrying their invoices, then place the rest if asked, and
 * settle the volume either way.
 *
 * The settle is in a `finally` because the run can end through a throw:
 * `postPurchases` stops on a 401/403 rather than repeating the same failure
 * for every remaining order, and the bytes already written for requests that
 * will now never be made are exactly the ones that have to come back off.
 */
async function postWithInvoices(
  client: IngestClient,
  orders: readonly CreatePurchaseInput[],
  matched: readonly MatchedInvoice[],
  attachExisting: boolean
): Promise<void> {
  const plan = planInvoiceDocuments(matched);
  const writer = createInvoiceWriter(plan);
  const created = new Set<string>();

  try {
    reportOutcome(
      await postPurchases(client, attachInvoiceDocuments(orders, plannedDocuments(plan)), {
        beforeRequest: writer.write,
        afterCreated: (purchase) => {
          writer.keep(purchase);
          if (purchase.sourceOrderId != null) created.add(purchase.sourceOrderId);
        },
      })
    );

    if (attachExisting) {
      reportAttachExisting(
        await attachToExistingOrders(client, {
          source: AMAZON_SOURCE_ID,
          plan,
          created,
          writer,
        })
      );
    }
  } finally {
    reportInvoiceWrites(writer.settle(), matched.length, attachExisting);
  }
}

/**
 * What the second pass did.
 *
 * A repeat is printed as its own count rather than folded into the successes,
 * because "already there" and "just written" are what tell an operator whether
 * this run changed anything.
 */
function reportAttachExisting({
  matchedOrders,
  unknownOrders,
  attach,
}: AttachExistingOutcome): void {
  console.warn(
    `--attach-existing: ${String(attach.attached)} invoice(s) attached to ` +
      `${String(matchedOrders)} order(s) that were already in the database, ` +
      `${String(attach.alreadyAttached)} already carried theirs`
  );
  if (unknownOrders.length > 0) {
    console.warn(
      `${String(unknownOrders.length)} matched order(s) are in neither this run nor the ` +
        `database: ${unknownOrders.slice(0, 10).join(', ')}`
    );
  }
  for (const failure of attach.failures.slice(0, 10)) console.error(`  ${failure}`);
  if (attach.failures.length > 0) process.exitCode = 1;
}

/**
 * What became of the invoices, once it is known.
 *
 * A run that creates no order attaches no invoice, and that is the ordinary
 * outcome against a database this bundle has already been ingested into.
 * Saying so is the point: the alternative is an operator reading the counts
 * above as evidence that landed.
 */
function reportInvoiceWrites(
  { attached, discarded }: InvoiceWriteOutcome,
  matched: number,
  attachExisting: boolean
): void {
  console.warn(
    `attached ${String(attached)} invoice(s) to the order(s) this run created` +
      (discarded > 0 ? `, discarding ${String(discarded)} stored file(s) it did not` : '')
  );
  if (attached === 0 && matched > 0 && !attachExisting) {
    console.warn(
      `none of the ${String(matched)} matched invoice(s) were attached: this run created ` +
        'none of the orders they name. Re-run with --attach-existing to put them on the ' +
        'orders that are already in the database'
    );
  }
}

if (isCliEntrypoint(import.meta.url)) {
  await runCli(main);
}
