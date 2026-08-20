import type {
  CaptureSource,
  ChargeOrigin,
  DocumentKind,
  IngestMethod,
  ItemKind,
  SettlementMode,
  SettlementRole,
  ShipmentStatus,
} from '../../contract/constants.js';
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
import type { ProductIdentity } from '../../contract/types/purchase.js';

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
  /**
   * The merchant's product identifier and the namespace it lives in, as one
   * value. Undefined for every source that states none.
   *
   * One value rather than two fields is what holds the pair total: the
   * column CHECK can reject a namespace with nothing in it, but SQLite
   * cannot be given the converse on a table that already exists, so this
   * type is where "an identifier with no namespace" stops being expressible.
   */
  readonly sku?: ProductIdentity | null;
  readonly url?: string | null;
  readonly imageUrl?: string | null;
  readonly quantity?: number;
  readonly unitPriceCents: number;
  readonly lineTotalCents: number;
  readonly allocatedShippingCents?: number;
  readonly allocatedAdjustmentCents?: number;
  readonly merchantCategory?: string | null;
  /** Amazon's `Product Condition`, verbatim. Not a category. */
  readonly merchantCondition?: string | null;
  /** `^` on a Woolworths receipt. Undefined where the source states nothing. */
  readonly promotionalPrice?: boolean | null;
  /** `#` on a Woolworths receipt: GST applies. */
  readonly gstApplicable?: boolean | null;
  /**
   * Only where the source states it outright. A kind supplied here is
   * persisted as *asserted* — `kindConfirmedAt` is set at ingest — because
   * transcribing what a merchant said is not a guess a later classification
   * pass should be free to overwrite.
   */
  readonly kind?: ItemKind | null;
  /**
   * POPS item tags. No shipped source states one, so supplying these means
   * asserting a classification; they persist confirmed, like `kind`.
   */
  readonly tags?: readonly string[];
  /** Verbatim merchant prose, in printed order. Duplicates are meaningful. */
  readonly notes?: readonly string[];
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

/**
 * When and where the evidence was captured — a device that said so, or the
 * photograph itself.
 *
 * Every field independently optional: a client sending only a location
 * leaves the capture time to the camera, and a photograph that kept its
 * timestamp and lost its GPS is the ordinary case. An input with nothing in
 * it writes no row, so an order carries this only when something actually
 * stated it.
 *
 * The coordinates are sensitive. Nothing on the write path logs them, and
 * no read path returns them (`schema/capture.ts`).
 */
export interface CreateCaptureInput {
  /** ISO-8601 instant the shutter fired. NOT when the shop happened. */
  readonly capturedAt?: string | null;
  readonly capturedAtSource?: CaptureSource | null;
  readonly utcOffsetMinutes?: number | null;
  readonly declaredTimeZone?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly locationSource?: CaptureSource | null;
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
  /**
   * Minutes ahead of UTC where the order was placed, at `orderedAt`.
   *
   * Supplied by the adapters that resolve a printed wall clock and so know
   * the offset they resolved it against. Omitted by the ones whose source
   * states an instant, which never knew one.
   */
  readonly orderedAtOffsetMinutes?: number | null;
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
   * What the device and the photograph said about themselves. Written only
   * when it states something — see {@link CreateCaptureInput}.
   */
  readonly capture?: CreateCaptureInput;
  /**
   * Facts about the whole order that are not fields — `date-uncertain` and
   * its future siblings. Free-form; see `schema/purchases.ts`.
   */
  readonly tags?: readonly string[];
}
