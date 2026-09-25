/**
 * The raw shape `purchases`' `POST /search` answers with, and the mapping
 * from one of its hits to a mobile search hit.
 *
 * `purchases`' hit is a flat envelope (`uri`, `score`, `matchField`,
 * `matchType`, `data`) with `data` typed as an open record — one endpoint
 * serves two adapters, order and line item, and the envelope does not say
 * which. This file is where that ambiguity resolves: `hit.uri`'s own prefix
 * (`pops:purchases/purchase/…` vs `pops:purchases/purchase-item/…`) says
 * which adapter answered, and only then is `data` re-parsed against the
 * matching shape. A hit whose prefix names neither is not a shape this pillar
 * can read — it fails the same way a producer rename would, per
 * `parse-response.ts`'s reasoning.
 */
import { z } from 'zod';

import { calendarDayOf } from './calendar-day.js';

import type { MobilePurchaseSearchHit } from '../../contract/mobile-purchases-schemas.js';

const ORDER_URI_PREFIX = 'pops:purchases/purchase/';
const ITEM_URI_PREFIX = 'pops:purchases/purchase-item/';

/** Mirrors `SearchHitSchema` in `pillars/purchases/src/contract/rest-search.ts`. */
export const PurchasesSearchHitSchema = z.object({
  uri: z.string(),
  score: z.number(),
  matchField: z.string(),
  matchType: z.string(),
  data: z.record(z.string(), z.unknown()),
});

export type PurchasesSearchHit = z.infer<typeof PurchasesSearchHitSchema>;

export const PurchasesSearchResponseSchema = z.object({
  hits: z.array(PurchasesSearchHitSchema),
});

const OrderedAtOffsetSchema = z.int().min(-840).max(840).nullable().optional();

/** An order hit's `data`, mirroring `orderCandidate`'s payload in `search-order-adapter.ts`. */
const OrderHitDataSchema = z.object({
  source: z.string(),
  sourceOrderId: z.string().nullable(),
  merchantEntityId: z.string().nullable(),
  merchantEntityName: z.string().nullable(),
  orderedAt: z.string(),
  orderedAtOffsetMinutes: OrderedAtOffsetSchema,
  currency: z.string(),
  totalCents: z.number().int(),
  status: z.string(),
});

/** An item hit's `data`, mirroring `itemCandidate`'s payload in `search-item-adapter.ts`. */
const ItemHitDataSchema = z.object({
  purchaseId: z.string(),
  name: z.string(),
  quantity: z.number().int().min(1),
  lineTotalCents: z.number().int(),
  totalCents: z.number().int(),
  currency: z.string(),
  merchantEntityName: z.string().nullable(),
  orderedAt: z.string(),
  orderedAtOffsetMinutes: OrderedAtOffsetSchema,
  status: z.string(),
  matchedTag: z.string().nullable(),
});

/**
 * What is actually visible on screen for the field named, or null when the
 * field's own value is already the thing a row renders (`name`,
 * `merchantEntityName`) and restating it as a second "matched text" would be
 * noise rather than a highlight.
 */
function matchedTextFor(matchField: string, literalValue: string | null): string | null {
  if (matchField === 'name' || matchField === 'merchantEntityName') return null;
  return literalValue;
}

function toOrderHit(hit: PurchasesSearchHit): MobilePurchaseSearchHit {
  const data = OrderHitDataSchema.parse(hit.data);
  const [, id = ''] = hit.uri.split(ORDER_URI_PREFIX);

  return {
    kind: 'purchase',
    id,
    merchantName: data.merchantEntityName,
    totalCents: data.totalCents,
    currency: data.currency,
    orderedOn: calendarDayOf(data.orderedAt, data.orderedAtOffsetMinutes ?? null),
    status: data.status,
    matchField: hit.matchField,
    matchedText: matchedTextFor(hit.matchField, matchedLiteral(hit.matchField, data)),
  };
}

/** The literal value an order hit's `matchField` names, or null for an unnamed field. */
function matchedLiteral(
  matchField: string,
  data: z.infer<typeof OrderHitDataSchema>
): string | null {
  switch (matchField) {
    case 'source':
      return data.source;
    case 'sourceOrderId':
      return data.sourceOrderId;
    case 'merchantEntityName':
      return data.merchantEntityName;
    default:
      return null;
  }
}

function toItemHit(hit: PurchasesSearchHit): MobilePurchaseSearchHit {
  const data = ItemHitDataSchema.parse(hit.data);
  const [, id = ''] = hit.uri.split(ITEM_URI_PREFIX);

  return {
    kind: 'item',
    id,
    purchaseId: data.purchaseId,
    name: data.name,
    quantity: data.quantity,
    lineTotalCents: data.lineTotalCents,
    totalCents: data.totalCents,
    currency: data.currency,
    merchantName: data.merchantEntityName,
    orderedOn: calendarDayOf(data.orderedAt, data.orderedAtOffsetMinutes ?? null),
    status: data.status,
    matchField: hit.matchField,
    matchedText: hit.matchField === 'tag' ? data.matchedTag : matchedTextFor(hit.matchField, null),
  };
}

/**
 * One producer hit to the mobile shape, branching on the hit's own URI
 * prefix to pick which adapter answered.
 *
 * An unrecognised prefix throws rather than being silently dropped — a
 * documented failure mode, per this module's own header. `client.ts`'s
 * `search()` catches it and turns it into the same `contract-mismatch`
 * outcome a schema mismatch elsewhere on this leg produces, so a producer
 * that adds a third adapter surfaces as "purchases answered with a contract
 * this pillar cannot call" rather than a hit silently missing from the list.
 */
export function toMobileSearchHit(hit: PurchasesSearchHit): MobilePurchaseSearchHit {
  if (hit.uri.startsWith(ORDER_URI_PREFIX)) return toOrderHit(hit);
  if (hit.uri.startsWith(ITEM_URI_PREFIX)) return toItemHit(hit);
  throw new Error(`[bfm-api] purchases search hit names an unrecognised uri: ${hit.uri}`);
}
