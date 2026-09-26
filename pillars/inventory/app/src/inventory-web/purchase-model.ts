import type { PurchaseGetResponse, SearchSearchResponse } from '../purchases-api/types.gen.js';

/** A purchase line shown in the inventory purchase preview. */
export interface PurchaseLine {
  name: string;
  quantity: number;
  priceCents: number;
  itemId?: string;
}

/** A purchase detail projected into the inventory preview's read-only model. */
export interface PurchaseResult {
  id: string;
  merchant: string;
  orderNumber: string;
  date: string;
  totalCents: number;
  lines: readonly PurchaseLine[];
}

/** One purchase in a result list; line-only matches have no order number. */
export interface PurchaseHit {
  id: string;
  merchant: string;
  orderNumber: string | null;
  date: string;
  totalCents: number;
  currency: string;
  matchedLine: string | null;
}

/** A raw hit from the purchases pillar's search response. */
export type PurchasesSearchHit = SearchSearchResponse['hits'][number];

type MappedPurchaseHit = {
  kind: 'order' | 'line';
  result: PurchaseHit;
};

type CommonHitFields = {
  date: string;
  totalCents: number;
  currency: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requiredString(data: Record<string, unknown>, field: string): string | null {
  const value = data[field];
  return typeof value === 'string' ? value : null;
}

function nullableString(data: Record<string, unknown>, field: string): string | null | undefined {
  if (!(field in data)) return undefined;
  const value = data[field];
  return value === null || typeof value === 'string' ? value : undefined;
}

function requiredNumber(data: Record<string, unknown>, field: string): number | null {
  const value = data[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function commonHitFields(data: Record<string, unknown>): CommonHitFields | null {
  const date = requiredString(data, 'orderedAt');
  const totalCents = requiredNumber(data, 'totalCents');
  const currency = requiredString(data, 'currency');
  if (date === null || totalCents === null || currency === null) return null;
  return { date, totalCents, currency };
}

function hitKind(uri: string): { kind: 'order' | 'line'; id: string } | null {
  const order = /^pops:purchases\/purchase\/([^/\s]+)$/.exec(uri);
  if (order?.[1] !== undefined) return { kind: 'order', id: order[1] };

  const line = /^pops:purchases\/purchase-item\/([^/\s]+)$/.exec(uri);
  if (line?.[1] !== undefined) return { kind: 'line', id: line[1] };

  return null;
}

function mapOrderHit(
  id: string,
  data: Record<string, unknown>,
  fields: CommonHitFields
): MappedPurchaseHit | null {
  const merchantEntityName = nullableString(data, 'merchantEntityName');
  const source = requiredString(data, 'source');
  const orderNumber = nullableString(data, 'sourceOrderId');
  if (merchantEntityName === undefined || source === null || orderNumber === undefined) {
    return null;
  }

  return {
    kind: 'order',
    result: {
      id,
      merchant: merchantEntityName ?? source,
      orderNumber,
      ...fields,
      matchedLine: null,
    },
  };
}

function mapLineHit(
  data: Record<string, unknown>,
  fields: CommonHitFields
): MappedPurchaseHit | null {
  const purchaseId = requiredString(data, 'purchaseId');
  const merchantEntityName = nullableString(data, 'merchantEntityName');
  const name = requiredString(data, 'name');
  if (purchaseId === null || merchantEntityName === undefined || name === null) return null;

  return {
    kind: 'line',
    result: {
      id: purchaseId,
      merchant: merchantEntityName ?? '',
      orderNumber: null,
      ...fields,
      matchedLine: name,
    },
  };
}

function mapHit(hit: PurchasesSearchHit): MappedPurchaseHit | null {
  const kind = hitKind(hit.uri);
  if (kind === null || !isRecord(hit.data)) return null;

  const fields = commonHitFields(hit.data);
  if (fields === null) return null;

  if (kind.kind === 'order') return mapOrderHit(kind.id, hit.data, fields);
  return mapLineHit(hit.data, fields);
}

/** Group purchases search hits by purchase, in first-hit order. */
export function purchaseHits(hits: readonly PurchasesSearchHit[]): PurchaseHit[] {
  const grouped = new Map<string, { hasOrder: boolean; result: PurchaseHit }>();

  for (const hit of hits) {
    const mapped = mapHit(hit);
    if (mapped === null) continue;

    const existing = grouped.get(mapped.result.id);
    if (existing === undefined) {
      grouped.set(mapped.result.id, {
        hasOrder: mapped.kind === 'order',
        result: mapped.result,
      });
      continue;
    }

    if (mapped.kind === 'order' && !existing.hasOrder) {
      existing.hasOrder = true;
      existing.result = {
        ...mapped.result,
        matchedLine: existing.result.matchedLine,
      };
      continue;
    }

    if (mapped.kind === 'line' && existing.result.matchedLine === null) {
      existing.result = { ...existing.result, matchedLine: mapped.result.matchedLine };
    }
  }

  return [...grouped.values()].map(({ result }) => result);
}

/** A purchase detail as the preview reads it. */
export function toPurchaseResult(detail: PurchaseGetResponse): PurchaseResult {
  return {
    id: detail.purchase.id,
    merchant: detail.purchase.merchantEntityName ?? detail.purchase.source,
    orderNumber: detail.purchase.sourceOrderId ?? '',
    date: detail.purchase.orderedAt,
    totalCents: detail.purchase.totalCents,
    lines: detail.items.map((entry) => {
      const inventoryItemUri =
        entry.units.find((unit) => unit.inventoryItemUri !== null)?.inventoryItemUri ?? null;
      const itemId = inventoryItemIdOf(inventoryItemUri);

      return {
        name: entry.item.name,
        quantity: entry.item.quantity,
        priceCents: entry.item.unitPriceCents,
        ...(itemId === null ? {} : { itemId }),
      };
    }),
  };
}

/** The inventory item id in a `pops://inventory/item/<id>` URI, else null. */
export function inventoryItemIdOf(uri: string | null): string | null {
  if (uri === null) return null;
  const match = /^pops:\/\/inventory\/item\/([^/\s]+)$/.exec(uri);
  return match?.[1] ?? null;
}

/** Where the preview's link goes in the purchases app. */
export function purchaseHref(id: string): string {
  return `/purchases/${id}`;
}
