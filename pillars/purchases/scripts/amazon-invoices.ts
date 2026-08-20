/**
 * The evidence half of the Amazon backfill: naming the bundle's tax invoices,
 * putting their bytes on the volume, and getting them onto orders whether or
 * not this run is the one that created them.
 *
 * Split from `ingest-amazon.ts`, which is the CLI — argument reading, parsing,
 * reporting — and was at its line budget.
 */
import { rmSync } from 'node:fs';

import { receiptSha256, receiptUri, storeReceiptBytes } from '../src/ingest/receipt/store.js';
import { attachDocuments, fetchPurchaseIdsBySourceOrderId } from './attach-documents.js';

import type { MatchedInvoice } from '../src/ingest/amazon/index.js';
import type {
  CreateDocumentInput,
  CreatePurchaseInput,
} from '../src/db/services/purchase-input.js';
import type { AttachOutcome, DocumentAttachment } from './attach-documents.js';
import type { IngestClient } from './backfill.js';

/** An invoice's URI, and the bytes that URI has to resolve to. */
export interface PlannedDocument {
  readonly document: CreateDocumentInput;
  readonly bytes: Buffer;
}

/** Every planned document, by the merchant order id it belongs to. */
export type InvoicePlan = ReadonlyMap<string, readonly PlannedDocument[]>;

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
export function planInvoiceDocuments(matched: readonly MatchedInvoice[]): InvoicePlan {
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
  plan: InvoicePlan
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
  /** Record that some row now references this URI, so its bytes stay. */
  readonly keepUri: (documentUri: string) => void;
  /** Remove what this run wrote for orders it did not create. */
  readonly settle: () => InvoiceWriteOutcome;
}

/**
 * The evidence half of the write, ordered so neither side is left dangling.
 *
 * Bytes go down before the request that references them, because a row
 * pointing at a file that is not there cannot be repaired by the create path —
 * `POST /purchases` is create-only, so a re-run is a 409. The cost of that
 * ordering is a file written for an order that turns out to already exist,
 * which is why every file this run created is removed again unless some row
 * references it — one it created, or one `keepUri` reports an attach reached.
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
export function createInvoiceWriter(plan: InvoicePlan): InvoiceWriter {
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
    keepUri(documentUri) {
      keptUris.add(documentUri);
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

export interface AttachExistingOutcome {
  /** Merchant order ids in the plan that named an order already in the database. */
  readonly matchedOrders: number;
  /** Merchant order ids in the plan that named no order at all. */
  readonly unknownOrders: readonly string[];
  readonly attach: AttachOutcome;
}

/**
 * Put the plan's invoices on the orders that were already there.
 *
 * `created` names the orders this run wrote, and they are skipped: their
 * invoices travelled in the create request and re-posting them would be a 409
 * counted as a repeat, which reads as if the bundle had been attached twice.
 *
 * The order index is read after the create pass, so an order written moments
 * ago is in it; that is the same reason the exclusion is needed rather than
 * merely tidy.
 */
export async function attachToExistingOrders(
  client: IngestClient,
  source: string,
  plan: InvoicePlan,
  created: ReadonlySet<string>,
  writer: InvoiceWriter
): Promise<AttachExistingOutcome> {
  const idsBySourceOrderId = await fetchPurchaseIdsBySourceOrderId(client, source);

  const attachments: DocumentAttachment[] = [];
  const unknownOrders: string[] = [];
  let matchedOrders = 0;

  for (const [sourceOrderId, planned] of plan) {
    if (created.has(sourceOrderId)) continue;
    const purchaseId = idsBySourceOrderId.get(sourceOrderId);
    if (purchaseId === undefined) {
      unknownOrders.push(sourceOrderId);
      continue;
    }
    matchedOrders += 1;
    for (const { document } of planned) attachments.push({ purchaseId, document });
  }

  const attach = await attachDocuments(client, attachments, { onReferenced: writer.keepUri });
  return { matchedOrders, unknownOrders, attach };
}
