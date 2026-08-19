/**
 * The wire shape of an inventory fan-out proposal and of the answer to one.
 *
 * A proposal is an *offer*, not a record: purchases writes nothing into
 * inventory and never will from here. The payload is shaped in inventory's
 * own field names so the surface holding the human's consent can hand it to
 * that pillar's `POST /items` unchanged, then tell purchases which URI came
 * back.
 *
 * Money is the one field that is not inventory's shape. Inventory's
 * `purchasePrice` is a float dollar amount; purchases holds integer cents
 * everywhere and does not mint a float on the way out, so the conversion is
 * the accepting caller's step and the field is named for what it holds.
 */
import { z } from 'zod';

import { IsoTimestampSchema, PopsUriSchema } from './schemas/purchase.js';

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
  /** This unit's share of the line's landed cost. A line's shares sum to it exactly. */
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
 * `unitId` addresses a specific existing unit — the one carrying a serial
 * number, say. Omitted, the decision lands on the line's oldest undecided
 * unit and mints one when there is none.
 */
export const InventoryProposalDecisionSchema = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('accepted'),
    inventoryItemUri: PopsUriSchema,
    unitId: z.string().optional(),
  }),
  z.object({
    decision: z.literal('declined'),
    unitId: z.string().optional(),
  }),
]);
