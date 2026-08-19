/**
 * View types for one order, derived from the generated client.
 *
 * Aliases into `purchases-api/types.gen.ts` rather than a hand-written mirror,
 * for the reason the queue's types give: a mirror keeps compiling while it
 * renders fields the server stopped sending.
 */
import type { PurchaseGetResponses } from '../../purchases-api/types.gen.js';

/** Everything `GET /purchases/{id}` answers with. */
export type PurchaseDetail = NonNullable<PurchaseGetResponses[200]>;

/** The order row itself — identity, money as the merchant stated it, status. */
export type Purchase = PurchaseDetail['purchase'];

/** The order's own reconciliation split, computed by the pillar. */
export type PurchaseAccounting = PurchaseDetail['accounting'];

/** One line, with its tags, units, notes and landed cost. */
export type PurchaseLine = PurchaseDetail['items'][number];

/** The namespace a line's product identifier lives in. */
export type SkuScheme = NonNullable<PurchaseLine['item']['sku']>['scheme'];

/** One charge, with what it was allocated to and what it is linked to. */
export type PurchaseCharge = PurchaseDetail['charges'][number];

/** One transaction link hanging off a charge. */
export type ChargeLink = PurchaseCharge['links'][number];

export type PurchaseShipment = PurchaseDetail['shipments'][number];

export type PurchaseDocument = PurchaseDetail['documents'][number];
