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

import { FINANCE_TRANSACTION_URI } from '../../contract/schemas/scalars.js';
import { calendarDateAtOffset, calendarDateInZone } from '../../ingest/local-time.js';

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
  readonly sourceRef: string;
}

/**
 * The bare transaction id inside a `pops://finance/transaction/<id>` URI.
 *
 * Inventory's create body takes the id and no URI field, so this is the only
 * way the settling transaction crosses. It is not lossy: that pillar derives
 * `home_inventory.purchase_transaction_uri` from the id on both its write
 * paths, reproducing this exact spelling — so sending the id populates the
 * URI column too, and the two sides must keep agreeing on the shape.
 *
 * Anything not addressed to a finance transaction answers null rather than
 * being split on its last slash: the column means "a finance transaction",
 * and filing a documents id in it would be a false statement no reader
 * could catch.
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
 * The idempotency key sent as inventory's `sourceRef` (POPS-2433).
 *
 * Deterministic from the offer, not from anything either side mints at
 * request time: two concurrent accepts of the same slot compute the
 * identical key, and inventory's UNIQUE index on it turns the second create
 * into a fetch of the first insert's row rather than minting a second one.
 *
 * `unitId` is the second half of the key when the offer names one. When it
 * does not, `slot` takes that place instead of being dropped: a durable
 * line with quantity > 1 and no unit rows yet offers one proposal per
 * remaining physical unit, all with `unitId: null` but a distinct `slot`
 * (`listInventoryProposals`'s `for (const [slot, price] of ...)` — the
 * absolute position in the line, stable across snapshots because it indexes
 * `lineUnits[slot]` directly rather than counting what remains). Keying on
 * `itemId` alone would collide those units' sourceRefs, so accepting the
 * second one — genuinely a different physical thing — would silently return
 * the first's asset instead of minting its own. `slot` cannot be sent BACK
 * to address a decision (`decideInventoryProposal`'s docstring is explicit
 * about that), but reading it off a proposal this pillar itself just
 * produced, to derive a key, is a different use than trusting it from a
 * caller.
 */
export function sourceRefFor(proposal: InventoryProposal): string {
  const base = `pops://purchases/order/${proposal.purchaseId}/item/${proposal.itemId}`;
  return proposal.unitId === null
    ? `${base}/slot/${proposal.slot}`
    : `${base}/unit/${proposal.unitId}`;
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
 *     instant does not merely render oddly, it deletes itself. Which day it
 *     is, is {@link purchaseCalendarDate}'s question.
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
/**
 * The calendar day this purchase fell on, where it was made.
 *
 * The order's own recorded offset first. `storeTimeZone()` is one configured
 * household zone for the whole installation, and the day an order fell on is
 * a fact about that order — the two agree for anything bought at home and
 * part company for anything bought while travelling, where a receipt
 * photographed in Tokyo would otherwise be filed under the Sydney calendar.
 * The field is user-visible on the asset and, for a deductible one, decides
 * a tax year at a year boundary.
 *
 * The household zone stays the fallback rather than being dropped: an order
 * with no recorded offset stated an instant and no place, and where it was
 * bought is then genuinely unknown. Deriving the day in UTC instead would
 * move every purchase made after mid-afternoon in Sydney onto the next one.
 */
export function purchaseCalendarDate(proposal: InventoryProposal): string | null {
  const offset = proposal.purchaseDateOffsetMinutes;
  return offset === null
    ? calendarDateInZone(proposal.purchaseDate)
    : calendarDateAtOffset(proposal.purchaseDate, offset);
}

export function toInventoryItemCreateBody(proposal: InventoryProposal): InventoryItemCreateBody {
  return {
    itemName: proposal.itemName,
    purchaseDate: purchaseCalendarDate(proposal),
    purchasePrice: proposal.purchasePriceCents / CENTS_PER_DOLLAR,
    purchasedFromName: proposal.purchasedFromName,
    purchaseTransactionId: financeTransactionId(proposal.purchaseTransactionUri),
    inUse: false,
    deductible: false,
    notes: provenanceNote(proposal),
    sourceRef: sourceRefFor(proposal),
  };
}
