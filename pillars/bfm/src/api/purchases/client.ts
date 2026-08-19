/**
 * bfm's purchases leg: the receipt a handset photographed, expressed as a call
 * to the purchases pillar.
 *
 * The first write bfm makes on the phone's behalf, and it is a proxy of content
 * rather than a command: the bytes are the device's, and everything downstream
 * of accepting them — reading them, gating the reading against the receipt's
 * own total, deduping the file, creating the purchase — belongs to `purchases`.
 * bfm adds no idempotency key for that reason (ADR-046); the producer
 * content-addresses the bytes, so a retry is the same photograph and the same
 * purchase.
 *
 * Like the finance leg, every call goes through the {@link PillarGateway}, so a
 * half-broken federation arrives as a value with a kind rather than an
 * exception, and leaves the same way. Nothing here throws, catches, or turns a
 * failed upload into a plausible-looking outcome: "purchases could not be
 * reached" and "purchases could not read the receipt" are different facts and
 * the phone draws them differently.
 */
import { type GatewayOutcome, type PillarGateway, isGatewayOk } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';
import { PurchasesReceiptOutcomeSchema, toMobileReceiptOutcome } from './wire.js';

import type { MobileReceiptOutcome, MobileReceiptPart } from '../../contract/rest-schemas.js';

/** The purchases pillar id, as registered with the registry. */
export const PURCHASES_PILLAR_ID = 'purchases';

/**
 * The subset of purchases' router bfm calls. A `type` rather than an
 * `interface` so it satisfies the SDK proxy's `Record<string, unknown>`
 * constraint.
 *
 * An assertion about a peer, not a compile-time link to one — `wire.ts`
 * validates what comes back, which is where the guarantee lives.
 */
export type PurchasesReceiptRouter = {
  receipt: {
    upload: (input: {
      parts: readonly MobileReceiptPart[];
      capturedAt?: string;
      timeZone?: string;
    }) => Promise<unknown>;
  };
};

/**
 * What the handset knew about the capture, carried through untouched.
 *
 * bfm neither validates these against a clock nor fills them in. They are
 * the device's claim about itself, and `purchases` is the only place that
 * decides whether to believe it.
 */
export interface MobileReceiptCapture {
  readonly capturedAt?: string;
  readonly timeZone?: string;
}

export interface MobilePurchasesClient {
  uploadReceipt(
    parts: readonly MobileReceiptPart[],
    capture?: MobileReceiptCapture
  ): Promise<GatewayOutcome<MobileReceiptOutcome>>;
}

export function createMobilePurchasesClient(gateway: PillarGateway): MobilePurchasesClient {
  return {
    async uploadReceipt(parts: readonly MobileReceiptPart[], capture: MobileReceiptCapture = {}) {
      // The parts travel unchanged. Re-encoding them here would be a second
      // representation of bytes the producer content-addresses, so a byte-level
      // difference would break its dedup and turn a retry into a second
      // purchase.
      const outcome = await gateway.call<PurchasesReceiptRouter, unknown>(
        PURCHASES_PILLAR_ID,
        (handle) =>
          handle.receipt.upload({
            parts,
            // Spread rather than passed as `undefined`: the producer's body
            // schema makes both optional, and sending an explicit `undefined`
            // through JSON would serialise the key away anyway — being
            // explicit here keeps the two readings the same.
            ...(capture.capturedAt === undefined ? {} : { capturedAt: capture.capturedAt }),
            ...(capture.timeZone === undefined ? {} : { timeZone: capture.timeZone }),
          })
      );

      const answered = parseOrMismatch(
        PURCHASES_PILLAR_ID,
        outcome,
        PurchasesReceiptOutcomeSchema,
        'receipt.upload'
      );
      if (!isGatewayOk(answered)) return answered;

      return { kind: 'ok', value: toMobileReceiptOutcome(answered.value) };
    },
  };
}
