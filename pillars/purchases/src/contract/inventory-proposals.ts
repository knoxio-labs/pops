/**
 * The wire shape of an inventory fan-out proposal and of the answer to one.
 *
 * A proposal is an *offer*, not a record, and an offer becomes an asset one
 * of two ways. A caller that created the inventory row itself reports the
 * URI it got back ({@link InventoryProposalDecisionSchema}). A caller that
 * has not asks purchases to create it, naming nothing but the slot
 * ({@link InventoryAssetRequestSchema}) — the one place this pillar writes
 * into another pillar's data, and the only one where an accept and the asset
 * it names cannot drift apart.
 *
 * Field names follow inventory's where a counterpart exists, but three do
 * not survive a copy into that pillar's `POST /items` and a caller should
 * not assume they will. `purchasePriceCents` is integer cents against a
 * float `purchasePrice`, because purchases mints no float anywhere.
 * `serialNumber` has no column there. `purchaseTransactionUri` is not in
 * inventory's create body either, which takes a bare
 * `purchaseTransactionId` — though that pillar now derives
 * `home_inventory.purchase_transaction_uri` from the id, so a caller that
 * sends the id keeps the reverse link rather than losing it.
 */
import { z } from 'zod';

import { ErrorBodySchema } from './rest-schemas.js';
import { IsoTimestampSchema, PopsUriSchema } from './schemas/purchase.js';
import { popsUri, popsUriPattern } from './schemas/scalars.js';

/**
 * Where an accepted asset lives: `pops://inventory/item/<id>`.
 *
 * Narrower than {@link PopsUriSchema}, which matches any pillar and any
 * type, because this one is stored rather than read back at the boundary.
 * The nightly cron resolves this column against the inventory pillar and
 * marks anything addressed elsewhere a bad URI forever, and a decision
 * cannot be retracted — so an accept naming a finance transaction would be
 * a permanent wrong answer accepted without complaint.
 */
export const INVENTORY_ITEM_URI = popsUriPattern('inventory', 'item');

export const InventoryItemUriSchema = z
  .string()
  .regex(INVENTORY_ITEM_URI, 'expected an inventory item URI, e.g. pops://inventory/item/<id>');

/** The URI for one inventory row, in the shape {@link InventoryItemUriSchema} admits. */
export function inventoryItemUri(id: string): string {
  return popsUri('inventory', 'item', id);
}

export const InventoryProposalSchema = z.object({
  purchaseId: z.string(),
  itemId: z.string(),
  /** The existing unit row this offer is about, or null for a slot with no row yet. */
  unitId: z.string().nullable(),
  /** Which of the line's units this is, from zero. For display; not an address. */
  slot: z.int().min(0),
  itemName: z.string(),
  serialNumber: z.string().nullable(),
  purchaseDate: IsoTimestampSchema,
  /**
   * This unit's share of the line's landed cost, net of anything refunded
   * on it. A line's shares sum to that figure exactly.
   */
  purchasePriceCents: z.int(),
  purchasedFromName: z.string().nullable(),
  /**
   * The order's settling transaction, when exactly one confirmed link on a
   * charge that paid for the goods names one. Null when the order was paid
   * across several, or when the only links it has are the matcher's own
   * unconfirmed proposals. A refund or a card hold is a transaction of the
   * order without being a payment for it, and neither counts as a second.
   */
  purchaseTransactionUri: PopsUriSchema.nullable(),
  /**
   * Whether a human asserted the line's `durable` kind or a classification
   * pass merely proposed it. Travels with the offer because a review
   * surface that cannot see it is stacking a guess on a guess.
   */
  kindConfirmed: z.boolean(),
});

/**
 * A human's answer to one proposal.
 *
 * `accepted` carries the URI of the asset the caller **has already
 * created** in inventory. This route does not create it: an accept that
 * arrives before the inventory row exists would record a reference to
 * nothing, and the nightly soft-URI cron would dutifully mark it stale.
 *
 * `unitId` is how a proposal is addressed, and a proposal that carries one
 * must be answered with it — it is the only thing telling two offers on the
 * same line apart, one of which may be the unit whose serial number the
 * source stated. Omitting it answers a proposal whose `unitId` was null,
 * which mints the row; a line whose every unit already has a row has no
 * such proposal left and refuses an unnamed answer.
 */
export const InventoryProposalDecisionSchema = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('accepted'),
    inventoryItemUri: InventoryItemUriSchema,
    unitId: z.string().optional(),
  }),
  z.object({
    decision: z.literal('declined'),
    unitId: z.string().optional(),
  }),
]);

/**
 * An accept that asks purchases to create the asset.
 *
 * It names a slot and nothing else. Every field of the row comes from the
 * proposal the projection just computed, so the asset cannot describe
 * something other than the line the human answered — a body carrying an
 * item name or a price would let the two disagree with no way to tell which
 * was right afterwards.
 *
 * `unitId` addresses the slot exactly as it does on
 * {@link InventoryProposalDecisionSchema}: present answers the proposal
 * carrying that unit, absent answers a proposal whose `unitId` was null.
 */
export const InventoryAssetRequestSchema = z.object({
  unitId: z.string().optional(),
});

/**
 * A create that did not end with an asset recorded against the slot.
 *
 * `inventoryItemUri` is what separates the two shapes of failure, and the
 * reason this is not a bare error body. It is null while nothing this
 * pillar can name was created — inventory refused the credential, was
 * unreachable, or rejected the payload — and carries the URI in the one
 * case where a row *does* exist and the accept did not land: a slot
 * answered by someone else between the projection and the write.
 *
 * That case has no mechanical repair, which is exactly why it is reported
 * rather than retried. A decision cannot be retracted, so the accept cannot
 * be recorded afterwards, and repeating the request would mint a second
 * asset for one physical thing. The URI is the only trace of a row nothing
 * references, and a person decides what happens to it.
 *
 * `code` names which failure this is, so a consumer branches on a value
 * rather than on the presence of a field it might forget to read.
 */
export const InventoryAssetFailureSchema = ErrorBodySchema.extend({
  inventoryItemUri: InventoryItemUriSchema.nullable(),
});
