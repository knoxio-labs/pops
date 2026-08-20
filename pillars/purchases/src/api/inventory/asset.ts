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

import { FINANCE_TRANSACTION_URI } from '../../contract/rest-reconcile.js';
import { calendarDateInZone } from '../../ingest/local-time.js';

import type { InventoryProposal } from '../../db/index.js';

/** Cents per dollar, because inventory's `purchasePrice` is a float amount. */
const CENTS_PER_DOLLAR = 100;

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
  readonly purchaseDate: string | null;
  readonly purchasePrice: number;
  readonly purchasedFromName: string | null;
  readonly purchaseTransactionId: string | null;
  readonly inUse: boolean;
  readonly deductible: boolean;
  readonly notes: string;
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
 * Four fields do not survive a straight copy, and each is handled rather
 * than dropped:
 *
 *   - `purchasePriceCents` is integer cents; inventory's `purchasePrice` is
 *     a float dollar amount, so the division happens here, on the accepting
 *     side, and purchases still mints no float of its own.
 *   - `purchaseTransactionUri` has no counterpart, but its id does; see
 *     {@link financeTransactionId}.
 *   - `serialNumber` has no column at all, so it goes in the note.
 *   - `purchaseDate` is an instant here and a calendar day there.
 *     Inventory's only edit surface binds that column to an
 *     `<input type="date">`, which cannot hold a timestamp: it shows blank
 *     and writes null back on the next save of any field on the row, so an
 *     instant does not merely render oddly, it deletes itself. The day is
 *     derived in the household timezone rather than in UTC, which would
 *     move every purchase made after mid-afternoon in Sydney onto the next
 *     one.
 *
 * `inUse` and `deductible` are stated rather than left to inventory's own
 * defaults, because a default in another pillar's contract is a fact about
 * this asset that nothing here would notice changing. Both are false:
 * purchases holds no evidence either way, and `true` would assert a claim
 * nobody made. What false is NOT is a review — `home_inventory.in_use` is a
 * nullable tri-state whose NULL means "nobody has looked", and inventory's
 * create body has no way to say it, so a fanned-out asset arrives
 * indistinguishable from one a person marked "Stored". The pillar README's
 * fan-out section carries that caveat and what it costs.
 */
export function toInventoryItemCreateBody(proposal: InventoryProposal): InventoryItemCreateBody {
  return {
    itemName: proposal.itemName,
    purchaseDate: calendarDateInZone(proposal.purchaseDate),
    purchasePrice: proposal.purchasePriceCents / CENTS_PER_DOLLAR,
    purchasedFromName: proposal.purchasedFromName,
    purchaseTransactionId: financeTransactionId(proposal.purchaseTransactionUri),
    inUse: false,
    deductible: false,
    notes: provenanceNote(proposal),
  };
}
