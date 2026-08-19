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
 * The bundle's tax invoices are read here too, and ride on the orders this run
 * creates. They cannot reach an order that already exists: documents travel in
 * the create request and `POST /purchases` refuses a second one at the
 * checksum, so a re-run against an ingested database attaches nothing.
 *
 * `--dry-run` reports what the bundle holds and which invoices name an order
 * it parsed, without storing a byte or making a request.
 */
import { readFileSync, rmSync } from 'node:fs';
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
import { receiptSha256, receiptUri, storeReceiptBytes } from '../src/ingest/receipt/store.js';
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

import type {
  CreateDocumentInput,
  CreatePurchaseInput,
} from '../src/db/services/purchase-input.js';
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

/** An invoice's URI, and the bytes that URI has to resolve to. */
export interface PlannedDocument {
  readonly document: CreateDocumentInput;
  readonly bytes: Buffer;
}

/**
 * Name each matched invoice without writing a byte.
 *
 * The store is content-addressed, so a file's URI is a function of its bytes
 * and can be minted before anyone decides to keep it. That is what lets the
 * writing wait until a request is actually about to be made: an order that
 * already exists is refused at the checksum, and its invoices should leave
 * nothing behind on the volume.
 *
 * A URI is planned at most once per order. Two byte-identical files hash to
 * one path, and `uq_purchase_documents` would reject the order outright
 * rather than ignore the repeat.
 */
export function planInvoiceDocuments(
  matched: readonly MatchedInvoice[]
): ReadonlyMap<string, readonly PlannedDocument[]> {
  const byOrderId = new Map<string, PlannedDocument[]>();
  const seenUris = new Set<string>();

  for (const invoice of matched) {
    const uri = receiptUri(receiptSha256(invoice.bytes));
    const key = `${invoice.sourceOrderId} ${uri}`;
    if (seenUris.has(key)) continue;
    seenUris.add(key);

    const planned = byOrderId.get(invoice.sourceOrderId) ?? [];
    planned.push({
      document: { documentUri: uri, kind: invoice.documentKind },
      bytes: invoice.bytes,
    });
    byOrderId.set(invoice.sourceOrderId, planned);
  }

  return byOrderId;
}

/** The plan as the request bodies want it: URIs only, no bytes. */
export function plannedDocuments(
  plan: ReadonlyMap<string, readonly PlannedDocument[]>
): ReadonlyMap<string, readonly CreateDocumentInput[]> {
  return new Map(
    [...plan].map(([sourceOrderId, planned]) => [sourceOrderId, planned.map((one) => one.document)])
  );
}

export interface InvoiceWriteOutcome {
  /** Documents on orders this run created, and so on rows that exist. */
  readonly attached: number;
  /** Files this run wrote and then removed, having created no row for them. */
  readonly discarded: number;
}

export interface InvoiceWriter {
  /** Put an order's invoices on the volume, before the row that names them. */
  readonly write: (purchase: CreatePurchaseInput) => void;
  /** Record that the order was created, so its bytes stay. */
  readonly keep: (purchase: CreatePurchaseInput) => void;
  /** Remove what this run wrote for orders it did not create. */
  readonly settle: () => InvoiceWriteOutcome;
}

/**
 * The evidence half of the write, ordered so neither side is left dangling.
 *
 * Bytes go down before the request that references them, because a row
 * pointing at a file that is not there cannot be repaired — `POST /purchases`
 * is create-only, so a re-run is a 409 and the reference stays broken. The
 * cost of that ordering is a file written for an order that turns out to
 * already exist, which is why every file this run created is removed again
 * unless some created order references it.
 *
 * The bytes land in this pillar's own content-addressed store, not the
 * documents pillar: `documents` is a read-only bridge over Paperless-ngx with
 * no write route at all, and blocking 325 invoices on building one is the
 * wrong order. ADR-042 wants them under `pops://documents/...` eventually, and
 * the migration that moves every stored file there moves these with the rest.
 *
 * **The store is a local directory.** It resolves beside this pillar's SQLite
 * file, or to `PURCHASES_RECEIPT_DIR`. Run against a remote `PURCHASES_BASE_URL`
 * from a machine that cannot see the server's volume and the URIs will resolve
 * to bytes that are not there — the write succeeds and the evidence is on the
 * wrong host. Run this where the volume is mounted.
 */
export function createInvoiceWriter(
  plan: ReadonlyMap<string, readonly PlannedDocument[]>
): InvoiceWriter {
  const writtenPaths = new Map<string, string>();
  const keptUris = new Set<string>();
  let attached = 0;

  const plannedFor = (purchase: CreatePurchaseInput): readonly PlannedDocument[] =>
    plan.get(purchase.sourceOrderId ?? '') ?? [];

  return {
    write(purchase) {
      for (const { bytes } of plannedFor(purchase)) {
        const stored = storeReceiptBytes(bytes, 'application/pdf');
        // Only what this run put there is this run's to take away: a file
        // that was already on the volume belongs to an earlier ingest or to
        // the drop-zone, and removing it would delete their evidence.
        if (!stored.alreadyPresent) writtenPaths.set(stored.uri, stored.path);
      }
    },
    keep(purchase) {
      const planned = plannedFor(purchase);
      for (const { document } of planned) keptUris.add(document.documentUri);
      attached += planned.length;
    },
    settle() {
      let discarded = 0;
      for (const [uri, path] of writtenPaths) {
        if (keptUris.has(uri)) continue;
        rmSync(path, { force: true });
        discarded += 1;
      }
      return { attached, discarded };
    },
  };
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
  // What the bundle holds, not what was written: an invoice reaches the
  // database only if the order it names is created in this run, which nothing
  // knows yet. The outcome is reported after the requests, below.
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

  await postWithInvoices(client, orders, matched);
}

/**
 * Post the orders carrying their invoices, and settle the volume either way.
 *
 * The settle is in a `finally` because the run can end through a throw:
 * `postPurchases` stops on a 401/403 rather than repeating the same failure
 * for every remaining order, and the bytes already written for requests that
 * will now never be made are exactly the ones that have to come back off.
 */
async function postWithInvoices(
  client: IngestClient,
  orders: readonly CreatePurchaseInput[],
  matched: readonly MatchedInvoice[]
): Promise<void> {
  const plan = planInvoiceDocuments(matched);
  const writer = createInvoiceWriter(plan);

  try {
    reportOutcome(
      await postPurchases(client, attachInvoiceDocuments(orders, plannedDocuments(plan)), {
        beforeRequest: writer.write,
        afterCreated: writer.keep,
      })
    );
  } finally {
    reportInvoiceWrites(writer.settle(), matched.length);
  }
}

/**
 * What became of the invoices, once it is known.
 *
 * A run that creates no order attaches no invoice, and that is the ordinary
 * outcome against a database this bundle has already been ingested into.
 * Saying so is the point: the alternative is an operator reading the counts
 * above as evidence that landed.
 */
function reportInvoiceWrites({ attached, discarded }: InvoiceWriteOutcome, matched: number): void {
  console.warn(
    `attached ${String(attached)} invoice(s) to the order(s) this run created` +
      (discarded > 0 ? `, discarding ${String(discarded)} stored file(s) it did not` : '')
  );
  if (attached === 0 && matched > 0) {
    console.warn(
      `none of the ${String(matched)} matched invoice(s) were attached: this run created ` +
        'none of the orders they name, and this pillar has no route that attaches a ' +
        'document to an order it did not just create'
    );
  }
}

if (isCliEntrypoint(import.meta.url)) {
  await runCli(main);
}
