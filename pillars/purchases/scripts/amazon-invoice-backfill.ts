/** Shared invoice reporting and writes for the retail and digital backfills. */
import { attachInvoiceDocuments, summariseRejections } from '../src/ingest/amazon/index.js';
import {
  attachToExistingOrders,
  createInvoiceWriter,
  planInvoiceDocuments,
  plannedDocuments,
} from './amazon-invoices.js';
import { postPurchases, reportOutcome } from './backfill.js';

import type { CreatePurchaseInput } from '../src/db/services/purchase-input.js';
import type { MatchedInvoice, RejectedInvoice } from '../src/ingest/amazon/index.js';
import type { AttachExistingOutcome, InvoiceWriteOutcome } from './amazon-invoices.js';
import type { IngestClient } from './backfill.js';

/** Options for posting orders together with their invoices. */
export interface PostWithInvoicesOptions {
  /** The source id used to find already-ingested orders. */
  readonly source: string;
  /** The adapter name shown in attach reports. */
  readonly sourceLabel: string;
  /** Orders parsed from this run's bundle. */
  readonly orders: readonly CreatePurchaseInput[];
  /** Invoices whose source order id matched an order from the bundle. */
  readonly matched: readonly MatchedInvoice[];
  /** Whether to attach invoices to orders that already exist in the database. */
  readonly attachExisting: boolean;
}

/** Report invoice counts and every invoice the adapter could not match. */
export function reportInvoiceMatches(
  scannedCount: number,
  matched: readonly MatchedInvoice[],
  rejected: readonly RejectedInvoice[]
): void {
  console.warn(
    `found ${String(scannedCount)} invoice PDF(s); ${String(matched.length)} name ` +
      `${String(new Set(matched.map((invoice) => invoice.sourceOrderId)).size)} of the parsed order(s)`
  );
  if (rejected.length === 0) return;

  console.warn(`invoices not attached: ${summariseRejections(rejected)}`);
  for (const { path, kind, detail } of rejected) {
    console.warn(`  ${path}: ${kind} — ${detail}`);
  }
}

/**
 * Create orders with invoices, then attach invoices to any matching orders
 * already in the database. Invoice bytes are removed if no row references
 * them after either pass.
 */
export async function postWithInvoices(
  client: IngestClient,
  { source, sourceLabel, orders, matched, attachExisting }: PostWithInvoicesOptions
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

    if (attachExisting && plan.size > 0) {
      reportAttachExisting(
        sourceLabel,
        await attachToExistingOrders(client, { source, plan, created, writer })
      );
    }
  } finally {
    reportInvoiceWrites(writer.settle(), matched.length, attachExisting);
  }
}

function reportAttachExisting(
  sourceLabel: string,
  { matchedOrders, unknownOrders, attach }: AttachExistingOutcome
): void {
  console.warn(
    `${sourceLabel} existing-order pass: ${String(attach.attached)} invoice(s) attached to ` +
      `${String(matchedOrders)} order(s), ${String(attach.alreadyAttached)} already carried theirs`
  );
  if (unknownOrders.length > 0) {
    console.warn(
      `${String(unknownOrders.length)} matched order(s) are in neither this run nor the ` +
        `database, and their invoices were dropped:`
    );
    for (const sourceOrderId of unknownOrders) console.warn(`  ${sourceOrderId}`);
  }
  for (const failure of attach.failures.slice(0, 10)) console.error(`  ${failure}`);
  if (attach.failures.length > 0 || unknownOrders.length > 0) process.exitCode = 1;
}

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
