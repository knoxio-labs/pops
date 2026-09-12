/**
 * bfm's calls for separating a receipt's extraction from its persistence,
 * and for a purchase typed by hand (POPS-2454).
 *
 * Split from `client.ts` purely to keep that file under the line-count cap;
 * these three calls share its `PillarGateway` and its `PurchasesReceiptRouter`
 * assertion, and are merged into `MobilePurchasesClient` there.
 */
import { isGatewayOk, type GatewayOutcome, type PillarGateway } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';
import { PurchasesExtractOutcomeSchema, toMobileExtractOutcome } from './draft-wire.js';
import { PurchasesDetailResponseSchema, toMobilePurchaseDetail } from './list-wire.js';

import type { MobileCaptureMetadata } from '../../contract/capture.js';
import type {
  MobileCreateManualPurchaseBody,
  MobileExtractOutcome,
  MobileSaveReceiptDraftBody,
} from '../../contract/receipt-draft.js';
import type { MobilePurchaseDetail, MobileReceiptPart } from '../../contract/rest-schemas.js';

/**
 * The purchases pillar id, as registered with the registry.
 *
 * Declared here rather than imported from a shared module on purpose:
 * `scripts/ci/check-cross-pillar-expectations.mjs` resolves a `pillar()`
 * call's target from the calling file alone, so an imported constant is
 * undecidable and the expectation cannot be pinned. `finance/client.ts` and
 * `finance/accounts-client.ts` each carry their own for the same reason.
 */
export const PURCHASES_PILLAR_ID = 'purchases';

/**
 * The subset of purchases' `receipt.*` and `purchase.*` routers these three
 * calls need. A `type` rather than an `interface` so it satisfies the SDK
 * proxy's `Record<string, unknown>` constraint, and its own assertion rather
 * than `client.ts`'s `PurchasesReceiptRouter` — the two name disjoint routes
 * on the same producer and importing one from the other would be a cycle,
 * since `client.ts` merges these calls into `MobilePurchasesClient`.
 */
export type PurchasesDraftRouter = {
  receipt: {
    extract: (input: {
      parts: readonly MobileReceiptPart[];
      capture?: MobileCaptureMetadata;
    }) => Promise<unknown>;
    saveDraft: (input: unknown) => Promise<unknown>;
  };
  purchase: {
    createManual: (input: unknown) => Promise<unknown>;
  };
};

/** The fields common to a saved draft and a manual entry, on purchases' wire. */
interface DraftWireItem {
  readonly name: string;
  readonly quantity: number | undefined;
  readonly unitPriceCents: number;
  readonly lineTotalCents: number;
  readonly notes: readonly string[];
}

interface DraftWireBody {
  readonly merchantEntityName: string | null;
  readonly orderedAt: string;
  readonly currency: string;
  readonly totalCents: number;
  readonly taxCents: number | undefined;
  readonly surchargeCents: number | undefined;
  readonly shippingCents: number | undefined;
  readonly discountCents: number | undefined;
  readonly items: readonly DraftWireItem[];
  readonly capture: MobileSaveReceiptDraftBody['capture'];
  readonly idempotencyKey: string;
}

function toDraftWireBody(
  body: MobileSaveReceiptDraftBody | MobileCreateManualPurchaseBody
): DraftWireBody {
  return {
    merchantEntityName: body.merchantName,
    orderedAt: body.orderedAt,
    currency: body.currency,
    totalCents: body.totalCents,
    taxCents: body.taxCents,
    surchargeCents: body.surchargeCents,
    shippingCents: body.shippingCents,
    discountCents: body.discountCents,
    items: body.items.map((item) => ({
      name: item.name,
      quantity: item.quantity ?? undefined,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.lineTotalCents,
      notes: item.notes,
    })),
    capture: body.capture ?? undefined,
    idempotencyKey: body.idempotencyKey,
  };
}

export async function extractReceipt(
  gateway: PillarGateway,
  parts: readonly MobileReceiptPart[],
  capture: MobileCaptureMetadata | undefined
): Promise<GatewayOutcome<MobileExtractOutcome>> {
  const outcome = await gateway.call<PurchasesDraftRouter, unknown>(PURCHASES_PILLAR_ID, (handle) =>
    handle.receipt.extract(capture === undefined ? { parts } : { parts, capture })
  );

  const answered = parseOrMismatch(
    PURCHASES_PILLAR_ID,
    outcome,
    PurchasesExtractOutcomeSchema,
    'receipt.extract'
  );
  if (!isGatewayOk(answered)) return answered;

  return { kind: 'ok', value: toMobileExtractOutcome(answered.value) };
}

export async function saveReceiptDraft(
  gateway: PillarGateway,
  body: MobileSaveReceiptDraftBody
): Promise<GatewayOutcome<MobilePurchaseDetail>> {
  const outcome = await gateway.call<PurchasesDraftRouter, unknown>(PURCHASES_PILLAR_ID, (handle) =>
    handle.receipt.saveDraft({ ...toDraftWireBody(body), documents: body.documents })
  );

  const answered = parseOrMismatch(
    PURCHASES_PILLAR_ID,
    outcome,
    PurchasesDetailResponseSchema,
    'receipt.saveDraft'
  );
  if (!isGatewayOk(answered)) return answered;

  return { kind: 'ok', value: toMobilePurchaseDetail(answered.value) };
}

export async function createManualPurchase(
  gateway: PillarGateway,
  body: MobileCreateManualPurchaseBody
): Promise<GatewayOutcome<MobilePurchaseDetail>> {
  const outcome = await gateway.call<PurchasesDraftRouter, unknown>(PURCHASES_PILLAR_ID, (handle) =>
    handle.purchase.createManual(toDraftWireBody(body))
  );

  const answered = parseOrMismatch(
    PURCHASES_PILLAR_ID,
    outcome,
    PurchasesDetailResponseSchema,
    'purchase.createManual'
  );
  if (!isGatewayOk(answered)) return answered;

  return { kind: 'ok', value: toMobilePurchaseDetail(answered.value) };
}
