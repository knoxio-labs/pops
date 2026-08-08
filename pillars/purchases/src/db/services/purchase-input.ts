/**
 * The ingest payload shape.
 *
 * Adapters describe relationships with their own local `ref` strings rather
 * than ids they cannot know before the insert — `shipmentRef` on a line,
 * `itemRef` on an allocation. Those are resolved during the write and never
 * persisted.
 *
 * Split from `purchase-writes.ts` so the write path stays readable; these
 * are types only, with no behaviour.
 */
import type {
  ChargeOrigin,
  DocumentKind,
  IngestMethod,
  ItemKind,
  SettlementMode,
  SettlementRole,
  ShipmentStatus,
} from '../../contract/constants.js';

export interface CreateShipmentInput {
  /** Adapter-local wiring handle. Never persisted. */
  readonly ref: string;
  /** The merchant's own identifier for this delivery, which IS persisted. */
  readonly sourceShipmentRef?: string | null;
  readonly carrier?: string | null;
  readonly trackingNumber?: string | null;
  readonly shippedAt?: string | null;
  readonly deliveredAt?: string | null;
  readonly status?: ShipmentStatus;
  readonly shippingCents?: number;
}

export interface CreateItemUnitInput {
  readonly serialNumber?: string | null;
  readonly inventoryItemUri?: string | null;
}

export interface CreateItemInput {
  /** Adapter-local handle used to allocate charges to this line within one call. */
  readonly ref?: string;
  /** Adapter-local {@link CreateShipmentInput.ref} of the delivery that brought it. */
  readonly shipmentRef?: string | null;
  readonly name: string;
  readonly sku?: string | null;
  readonly url?: string | null;
  readonly imageUrl?: string | null;
  readonly quantity?: number;
  readonly unitPriceCents: number;
  readonly lineTotalCents: number;
  readonly allocatedShippingCents?: number;
  readonly allocatedAdjustmentCents?: number;
  readonly merchantCategory?: string | null;
  readonly kind?: ItemKind | null;
  readonly tags?: readonly string[];
  readonly units?: readonly CreateItemUnitInput[];
}

export interface CreateChargeAllocationInput {
  /** Adapter-local {@link CreateItemInput.ref}. */
  readonly itemRef: string;
  readonly amountCents: number;
}

export interface CreateChargeInput {
  readonly sourceChargeRef?: string | null;
  readonly shipmentRef?: string | null;
  readonly amountCents: number;
  /** Settlement currency. Defaults to the order's currency. */
  readonly currency?: string;
  /** Value in the order's currency. Defaults to `amountCents` when currencies match. */
  readonly orderAmountCents?: number;
  readonly chargedAt?: string | null;
  readonly role?: SettlementRole;
  readonly paymentHint?: string | null;
  readonly origin?: ChargeOrigin;
  readonly allocations?: readonly CreateChargeAllocationInput[];
}

export interface CreateDocumentInput {
  readonly documentUri: string;
  readonly shipmentRef?: string | null;
  readonly kind?: DocumentKind;
}

export interface CreatePurchaseInput {
  readonly source: string;
  readonly sourceOrderId?: string | null;
  readonly ingestMethod: IngestMethod;
  readonly orderedAt: string;
  readonly currency: string;
  readonly subtotalCents?: number;
  readonly shippingCents?: number;
  readonly taxCents?: number;
  readonly discountCents?: number;
  /** A fee the merchant added: a card surcharge, a small-order fee. */
  readonly surchargeCents?: number;
  readonly totalCents: number;
  readonly merchantEntityId?: string | null;
  readonly merchantEntityName?: string | null;
  readonly settlementMode?: SettlementMode;
  readonly paymentHint?: string | null;
  readonly rawRef?: string | null;
  readonly checksum: string;
  readonly shipments?: readonly CreateShipmentInput[];
  readonly items?: readonly CreateItemInput[];
  readonly charges?: readonly CreateChargeInput[];
  readonly documents?: readonly CreateDocumentInput[];
  /**
   * Facts about the whole order that are not fields — `date-uncertain` and
   * its future siblings. Free-form; see `schema/purchases.ts`.
   */
  readonly tags?: readonly string[];
}
