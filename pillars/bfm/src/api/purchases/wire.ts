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
 * and its `needs-review` arm carries the whole extracted reading; neither is
 * something a phone renders, and a schema that demanded them would turn a
 * producer trimming an unused field into a `502` on a handset.
 */
import { z } from 'zod';

import type { MobileReceiptOutcome } from '../../contract/rest-schemas.js';

/** The purchase fields the mobile confirmation is built from. */
const PurchasesPurchaseSchema = z.object({
  id: z.string(),
  merchantEntityName: z.string().nullable(),
  totalCents: z.number().int(),
  currency: z.string(),
  /**
   * ISO-8601 with an explicit timezone, enforced rather than accepted as a
   * bare string. It is the date a confirmation screen shows, and a value the
   * phone cannot parse renders as a blank or as today — neither of which is
   * distinguishable from a receipt that stated no date, which purchases
   * signals a completely different way. The pattern mirrors purchases'
   * `IsoTimestampSchema` exactly, offsets included, so bfm rejects what that
   * pillar rejects and nothing more.
   */
  orderedAt: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/u,
      'expected an ISO-8601 timestamp with a timezone'
    ),
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
    failures: z.array(PurchasesGateFailureSchema),
  }),
  z.object({
    kind: z.literal('unreadable'),
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
        problems: outcome.failures.map((failure) => ({
          code: failure.kind,
          detail: failure.detail,
        })),
      };
    case 'unreadable':
      return { kind: 'unreadable', reason: outcome.reason };
  }
}
