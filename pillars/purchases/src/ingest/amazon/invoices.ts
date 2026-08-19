/**
 * Finding the bundle's tax invoices and deciding which order each belongs to.
 *
 * The filenames carry nothing: they are `Retail.TransactionalInvoicing.<n>.pdf`
 * and the number is a position in a batch, not an identifier. The order number
 * is read out of the document itself by `invoice-pdf.ts`; this file is the
 * walk over the bundle and the gate on what that read produced.
 *
 * The gate is an exact membership test against the orders the CSV parser
 * actually built. That is stronger than it looks: an order id is a fixed
 * seventeen-character shape, so a misread cannot land on a different real
 * order — it lands on nothing and is reported. Nothing here is attached on a
 * resemblance.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { readAmazonInvoice, type AmazonInvoiceRead } from './invoice-pdf.js';

import type { DocumentKind } from '../../contract/constants.js';
import type { CreateDocumentInput, CreatePurchaseInput } from '../../db/services/purchase-input.js';

/** Where the DSAR bundle files its invoices, relative to the bundle root. */
export const INVOICE_BUNDLE_DIRECTORY = 'Additional Data';

/**
 * The invoices arrive split across sibling directories — `.1`, `.3.1`, `.3.2`
 * in the reference bundle — and **the numbering restarts in each**. A union
 * keyed on the filename therefore collides: `.3.1/…1.pdf` and `.3.2/…1.pdf`
 * are different invoices for different orders. Every key here is a path.
 */
export const INVOICE_DIRECTORY_PREFIX = 'Retail.TransactionalInvoicing';

export interface ScannedInvoicePdf {
  /** Path relative to the bundle root, which is what a report has to name. */
  readonly path: string;
  readonly bytes: Buffer;
  readonly read: AmazonInvoiceRead;
}

export type InvoiceRejectionKind =
  /** The PDF has no text layer this reader can decompress. */
  | 'no-text-layer'
  /** A text layer with no labelled order number in it. */
  | 'no-order-id'
  /** More than one order named, so which order it evidences is unknown. */
  | 'ambiguous-order-id'
  /** A well-formed order id that the parsed order set does not contain. */
  | 'unknown-order'
  /** A digital order, which `Order History.csv` does not carry at all. */
  | 'digital-order'
  /** A second rendering of a document already attached to the same order. */
  | 'duplicate-document';

export interface RejectedInvoice {
  readonly path: string;
  readonly kind: InvoiceRejectionKind;
  readonly detail: string;
}

export interface MatchedInvoice {
  readonly path: string;
  readonly sourceOrderId: string;
  readonly bytes: Buffer;
  readonly documentKind: DocumentKind;
}

export interface AmazonInvoiceMatch {
  readonly matched: readonly MatchedInvoice[];
  readonly rejected: readonly RejectedInvoice[];
}

/**
 * Digital orders carry a `D01-` id and live in `Digital Content Orders.csv`,
 * which this adapter does not read. In the reference bundle all 90 of them are
 * in that file and none appear in `Order History.csv`, so their invoices can
 * never match — separating them keeps a genuinely dropped retail order visible
 * instead of buried in a pile of expected misses.
 */
const DIGITAL_ORDER_PREFIX = 'D01-';

/**
 * Read every invoice PDF in the bundle.
 *
 * A bundle from an account with no invoices simply has no such directory, so
 * a missing one is an empty result rather than a failure — the same treatment
 * `Refund Details.csv` gets.
 */
export function readAmazonInvoiceBundle(bundlePath: string): readonly ScannedInvoicePdf[] {
  const root = join(bundlePath, INVOICE_BUNDLE_DIRECTORY);

  let entries: readonly string[];
  try {
    entries = readdirSync(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return [];
  }

  const scanned: ScannedInvoicePdf[] = [];
  const directories = entries
    .filter((entry) => entry.startsWith(INVOICE_DIRECTORY_PREFIX))
    .toSorted(compare);

  for (const directory of directories) {
    const absolute = join(root, directory);
    let files: readonly string[];
    try {
      files = readdirSync(absolute);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOTDIR') throw error;
      continue;
    }
    for (const file of files.filter((name) => name.endsWith('.pdf')).toSorted(compare)) {
      const bytes = readFileSync(join(absolute, file));
      scanned.push({
        path: join(INVOICE_BUNDLE_DIRECTORY, directory, file),
        bytes,
        read: readAmazonInvoice(bytes),
      });
    }
  }

  return scanned;
}

/**
 * Plain code-unit ordering, not `localeCompare`.
 *
 * The only thing ordering decides here is which of two renderings of the same
 * invoice is kept, and that answer must not change with the host's ICU data.
 */
function compare(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Decide, for each scanned PDF, whether it attaches and to what.
 *
 * @param scanned Every invoice found in the bundle.
 * @param knownOrderIds The `sourceOrderId` of every order the CSV parser
 *   built. Membership is the whole gate.
 */
export function matchAmazonInvoices(
  scanned: readonly ScannedInvoicePdf[],
  knownOrderIds: ReadonlySet<string>
): AmazonInvoiceMatch {
  const matched: MatchedInvoice[] = [];
  const rejected: RejectedInvoice[] = [];
  const seenDocuments = new Set<string>();

  for (const { path, bytes, read } of scanned) {
    if (!read.ok) {
      rejected.push({ path, kind: read.failure, detail: read.detail });
      continue;
    }

    const { sourceOrderId, documentNumber, documentType, kind } = read.fields;

    if (!knownOrderIds.has(sourceOrderId)) {
      rejected.push({
        path,
        kind: sourceOrderId.startsWith(DIGITAL_ORDER_PREFIX) ? 'digital-order' : 'unknown-order',
        detail: `${documentType} for ${sourceOrderId}, which no parsed order carries`,
      });
      continue;
    }

    // Two files, different bytes, same invoice number on the same order: the
    // bundle ships a re-rendered copy. Content addressing cannot collapse
    // those — the bytes genuinely differ — so the second is dropped here, or
    // the order would show one invoice twice.
    if (documentNumber !== null) {
      const documentKey = `${sourceOrderId} ${documentNumber}`;
      if (seenDocuments.has(documentKey)) {
        rejected.push({
          path,
          kind: 'duplicate-document',
          detail: `${documentNumber} is already attached to ${sourceOrderId}`,
        });
        continue;
      }
      seenDocuments.add(documentKey);
    }

    matched.push({ path, sourceOrderId, bytes, documentKind: kind });
  }

  return { matched, rejected };
}

/**
 * Hang each order's documents on the order the parser built for it.
 *
 * Orders are returned in the order they arrived and every one of them is
 * returned, with or without documents — a filter here would silently drop the
 * 498 orders the bundle ships no invoice for.
 *
 * Any documents an order already carries are kept. Nothing in this adapter
 * produces one today, and losing them to a later change that does is the kind
 * of thing that leaves no trace.
 */
export function attachInvoiceDocuments(
  orders: readonly CreatePurchaseInput[],
  documentsByOrderId: ReadonlyMap<string, readonly CreateDocumentInput[]>
): readonly CreatePurchaseInput[] {
  return orders.map((order) => {
    const orderId = order.sourceOrderId ?? '';
    const documents = documentsByOrderId.get(orderId);
    if (documents === undefined || documents.length === 0) return order;
    return { ...order, documents: [...(order.documents ?? []), ...documents] };
  });
}

/** Rejections counted by kind: a per-file dump buries the shape of them. */
export function summariseRejections(rejections: readonly RejectedInvoice[]): string {
  const counts = new Map<InvoiceRejectionKind, number>();
  for (const rejection of rejections) {
    counts.set(rejection.kind, (counts.get(rejection.kind) ?? 0) + 1);
  }
  return [...counts]
    .toSorted(([a], [b]) => compare(a, b))
    .map(([kind, count]) => `${kind}=${String(count)}`)
    .join(' ');
}
