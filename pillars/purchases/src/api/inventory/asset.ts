/**
 * Turning one inventory proposal into the body inventory's `POST /items`
 * accepts, and reading the id back out of its answer.
 *
 * Separate from the transport next door because this is where the fan-out
 * can be wrong without anything failing: every field here is a translation
 * between two pillars that named the same fact differently, and a wrong
 * translation produces an asset that looks perfectly ordinary and describes
 * something else.
 */
import { z } from 'zod';

import type { InventoryProposal } from '../../db/index.js';

/** Cents per dollar, because inventory's `purchasePrice` is a float amount. */
const CENTS_PER_DOLLAR = 100;

/** A finance transaction URI, whose last segment is the bare id. */
const FINANCE_TRANSACTION_URI = /^pops:\/\/finance\/transaction\/([^/\s]+)$/u;

/**
 * The subset of inventory's create response this pillar reads.
 *
 * Narrow on purpose: the accept is stored against the id and nothing else,
 * so pinning the rest of that pillar's item shape here would fail the leg
 * on a change nothing in purchases reads.
 */
export const InventoryItemCreatedSchema = z.object({
  data: z.object({ id: z.string().min(1) }),
});

/** What `POST /items` is sent. Field names are inventory's, not this pillar's. */
export interface InventoryItemCreateBody {
  readonly itemName: string;
  readonly purchaseDate: string;
  readonly purchasePrice: number;
  readonly purchasedFromName: string | null;
  readonly purchaseTransactionId: string | null;
  readonly notes: string;
}

/** Where an accepted asset is addressed once inventory has minted its id. */
export function inventoryItemUri(id: string): string {
  return `pops://inventory/item/${id}`;
}

/**
 * The bare transaction id inside a `pops://finance/transaction/<id>` URI.
 *
 * Inventory's create body takes the id rather than the URI, and its own
 * `purchase_transaction_uri` column has no REST writer at all, so this is
 * the only way the settling transaction crosses. Anything not addressed to
 * a finance transaction answers null rather than being split on its last
 * slash: the column means "a finance transaction", and filing a documents
 * id in it would be a false statement no reader could catch.
 */
export function financeTransactionId(uri: string | null): string | null {
  if (uri === null) return null;
  return FINANCE_TRANSACTION_URI.exec(uri)?.[1] ?? null;
}

/**
 * What the asset was created from, in the row itself.
 *
 * A row purchases wrote is otherwise indistinguishable from one a person
 * typed in, which is the property that makes an automated writer into
 * someone else's pillar hard to audit and hard to undo. The order id is
 * enough to reach `GET /purchases/:id`, and the line id tells two assets
 * from one order apart.
 *
 * The serial number rides along because inventory has nowhere else to put
 * it and it is the strongest identity the asset carries. Prose, not a
 * field: a reader can see it, and nothing can mistake it for the column
 * inventory does not have.
 */
export function provenanceNote(proposal: InventoryProposal): string {
  const source = `Created from purchases order ${proposal.purchaseId}, line ${proposal.itemId}.`;
  return proposal.serialNumber === null
    ? source
    : `${source} Serial number: ${proposal.serialNumber}.`;
}

/**
 * Translate one offer into inventory's create body.
 *
 * Three fields do not survive a straight copy, and each is handled rather
 * than dropped:
 *
 *   - `purchasePriceCents` is integer cents; inventory's `purchasePrice` is
 *     a float dollar amount, so the division happens here, on the accepting
 *     side, and purchases still mints no float of its own.
 *   - `purchaseTransactionUri` has no counterpart, but its id does; see
 *     {@link financeTransactionId}.
 *   - `serialNumber` has no column at all, so it goes in the note.
 *
 * `purchaseDate` crosses unchanged, as the instant purchases holds. The
 * column is an opaque string that inventory renders through `new Date(…)`,
 * and truncating the timestamp to a calendar date would shift the day for
 * every purchase made after mid-afternoon in a UTC+10 timezone.
 */
export function toInventoryItemCreateBody(proposal: InventoryProposal): InventoryItemCreateBody {
  return {
    itemName: proposal.itemName,
    purchaseDate: proposal.purchaseDate,
    purchasePrice: proposal.purchasePriceCents / CENTS_PER_DOLLAR,
    purchasedFromName: proposal.purchasedFromName,
    purchaseTransactionId: financeTransactionId(proposal.purchaseTransactionUri),
    notes: provenanceNote(proposal),
  };
}
