/**
 * The receipt-upload shape bfm reads from `purchases`, and the mapping from it
 * to the mobile shape bfm publishes.
 *
 * Validated rather than trusted, for the same reason the finance leg validates:
 * the SDK proxy resolves routes from the producer's OpenAPI at runtime, so the
 * local router type is an assertion. Here the stakes are a confirmation screen
 * — a producer-side rename would reach a phone as a purchase reporting no
 * merchant and a total of nothing, which reads as a bug in the receipt rather
 * than in the wire.
 *
 * Money is `purchases`' and is mirrored: integer cents, exactly as that pillar
 * persists and publishes it. The finance leg mirrors decimal dollars for the
 * same reason. Normalising the two here would put a conversion — and a rounding
 * rule — between the producer and the screen.
 *
 * Only what the mobile outcome draws is described. `purchases`' `created` arm
 * carries a full purchase detail (shipments, charges, documents, accounting)
 * that a phone does not render, and a schema demanding all of it would turn a
 * producer trimming an unused field into a `502` on a handset. The reading on
 * the `needs-review` arm IS drawn, so it is described — but loosely: every
 * string the model transcribed is accepted as a string, and every field the
 * review screen has no label for is left out, so the producer can still tighten
 * its own extraction schema without that reaching a handset as an outage.
 */
import { z } from 'zod';

import { IsoTimestampSchema } from '../../contract/iso-timestamp.js';

import type { MobileExtractedReceipt, MobileReceiptOutcome } from '../../contract/rest-schemas.js';

/** The purchase fields the mobile confirmation is built from. */
const PurchasesPurchaseSchema = z.object({
  id: z.string(),
  merchantEntityName: z.string().nullable(),
  totalCents: z.number().int(),
  currency: z.string(),
  /**
   * Enforced rather than accepted as a bare string — see
   * `../../contract/iso-timestamp.ts` for why, in both directions.
   */
  orderedAt: IsoTimestampSchema,
});

const PurchasesPurchaseDetailSchema = z.object({
  purchase: PurchasesPurchaseSchema,
  items: z.array(z.unknown()),
});

/** One objection the producer's arithmetic gate raised. */
const PurchasesGateFailureSchema = z.object({
  /**
   * Open, not the producer's enum. A seventh failure kind must not make an
   * otherwise-readable `needs-review` answer fail bfm's parse and reach the
   * phone as "purchases answered with a contract this pillar cannot call",
   * which is a false statement about a working producer.
   */
  kind: z.string(),
  detail: z.string(),
  /** Present only on a sum mismatch. Absent on every other kind. */
  deltaCents: z.number().int().optional(),
});

/**
 * The reading, as loosely as it can be described and still be mapped.
 *
 * Every money field stays the string the model transcribed — parsing here
 * would be bfm inventing cents for figures the producer's own gate has just
 * refused to believe. The optional fields are optional because `purchases`
 * defaults them rather than requiring them, so a model that omitted one
 * produced a perfectly good reading and must not arrive as a `502`.
 */
const PurchasesExtractedLineSchema = z.object({
  description: z.string(),
  amount: z.string(),
  quantity: z.number().int().positive().optional(),
  unitNote: z.string().optional(),
});

const PurchasesExtractedReceiptSchema = z.object({
  merchantName: z.string().nullable(),
  address: z.string().nullable().optional(),
  purchasedOn: z.string().nullable(),
  purchasedAt: z.string().nullable(),
  currency: z.string().nullable(),
  total: z.string(),
  tax: z.string().nullable(),
  discounts: z.array(z.string()).optional(),
  surcharges: z.array(z.string()).optional(),
  shipping: z.string().nullable().optional(),
  lines: z.array(PurchasesExtractedLineSchema),
  /** The producer's name for what the phone calls `unreadableNotes`. */
  unreadable: z.array(z.string()).optional(),
});

/**
 * What `receipt.upload` answers. A discriminated union on the producer's side
 * and here, so an arm bfm does not know about is a parse failure rather than a
 * silently mishandled outcome.
 */
export const PurchasesReceiptOutcomeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('created'),
    purchase: PurchasesPurchaseDetailSchema,
    alreadyStored: z.boolean(),
  }),
  z.object({
    kind: z.literal('needs-review'),
    /**
     * Every part the producer stored, in the order it was sent. Only the count
     * is published — see {@link MobileReceiptOutcome} — but the array is what
     * the producer sends and `min(1)` is what its own contract promises, so a
     * producer that stopped storing parts is caught here rather than reaching a
     * phone as a receipt made of no photographs.
     */
    receiptUris: z.array(z.string()).min(1),
    failures: z.array(PurchasesGateFailureSchema),
    extracted: PurchasesExtractedReceiptSchema,
  }),
  z.object({
    kind: z.literal('unreadable'),
    receiptUris: z.array(z.string()).min(1),
    reason: z.string(),
  }),
]);

export type PurchasesReceiptOutcome = z.infer<typeof PurchasesReceiptOutcomeSchema>;

/** purchases' receipt outcome → the mobile one. Field-for-field; no arithmetic. */
export function toMobileReceiptOutcome(outcome: PurchasesReceiptOutcome): MobileReceiptOutcome {
  switch (outcome.kind) {
    case 'created':
      return {
        kind: 'created',
        purchase: {
          id: outcome.purchase.purchase.id,
          merchantName: outcome.purchase.purchase.merchantEntityName,
          totalCents: outcome.purchase.purchase.totalCents,
          currency: outcome.purchase.purchase.currency,
          orderedAt: outcome.purchase.purchase.orderedAt,
          itemCount: outcome.purchase.items.length,
        },
        alreadyStored: outcome.alreadyStored,
      };
    case 'needs-review':
      return {
        kind: 'needs-review',
        receiptCount: outcome.receiptUris.length,
        problems: outcome.failures.map((failure) => ({
          code: failure.kind,
          detail: failure.detail,
          deltaCents: failure.deltaCents ?? null,
        })),
        extracted: toMobileExtractedReceipt(outcome.extracted),
      };
    case 'unreadable':
      return {
        kind: 'unreadable',
        receiptCount: outcome.receiptUris.length,
        reason: outcome.reason,
      };
  }
}

/**
 * The producer's reading → the mobile one. Absent becomes explicit: the
 * producer omits a defaulted field, and the phone's wire type says `null` or
 * `[]` so the generated client has one shape to decode rather than two.
 */
function toMobileExtractedReceipt(
  extracted: z.infer<typeof PurchasesExtractedReceiptSchema>
): MobileExtractedReceipt {
  return {
    merchantName: extracted.merchantName,
    address: extracted.address ?? null,
    purchasedOn: extracted.purchasedOn,
    purchasedAt: extracted.purchasedAt,
    currency: extracted.currency,
    total: extracted.total,
    tax: extracted.tax,
    discounts: extracted.discounts ?? [],
    surcharges: extracted.surcharges ?? [],
    shipping: extracted.shipping ?? null,
    lines: extracted.lines.map((line) => ({
      description: line.description,
      amount: line.amount,
      quantity: line.quantity ?? null,
      unitNote: line.unitNote ?? null,
    })),
    unreadableNotes: extracted.unreadable ?? [],
  };
}
