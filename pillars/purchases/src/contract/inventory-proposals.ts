/**
 * The wire shape of an inventory fan-out proposal and of the answer to one.
 *
 * A proposal is an *offer*, not a record: purchases writes nothing into
 * inventory and never will from here. The surface holding the human's
 * consent creates the asset on that pillar and then tells purchases which
 * URI came back.
 *
 * Field names follow inventory's where a counterpart exists, but three do
 * not survive a copy into that pillar's `POST /items` and a caller should
 * not assume they will. `purchasePriceCents` is integer cents against a
 * float `purchasePrice`, because purchases mints no float anywhere.
 * `serialNumber` has no column there. `purchaseTransactionUri` — the whole
 * point of the reverse link — is not in inventory's create body either,
 * which takes a bare `purchaseTransactionId` and leaves
 * `home_inventory.purchase_transaction_uri` with no REST writer at all.
 */
import { z } from 'zod';

import { IsoTimestampSchema, PopsUriSchema } from './schemas/purchase.js';

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
const InventoryItemUriSchema = z
  .string()
  .regex(
    /^pops:\/\/inventory\/item\/[^/\s]+$/u,
    'expected an inventory item URI, e.g. pops://inventory/item/<id>'
  );

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
   * The order's settling transaction, when exactly one confirmed link names
   * one. Null when the order settled across several, or when the only links
   * it has are the matcher's own unconfirmed proposals.
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
