import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../../inventory-api-helpers.js';
import * as inventoryApi from '../../inventory-api/index.js';
import { webItemDetailQueryKey } from '../../inventory-web/queryKeys.js';

import type { ItemsGetResponses, WebGetResponses } from '../../inventory-api/types.gen.js';

type LegacyItem = ItemsGetResponses[200]['data'];
type WebItem = WebGetResponses[200]['item'];

const { connectionsListForItem, itemsGet, locationsGetPath, photosListForItem } = inventoryApi;

function isWebGet(value: unknown): value is typeof inventoryApi.webGet {
  return typeof value === 'function';
}

let webGetCandidate: unknown;
try {
  webGetCandidate = Reflect.get(inventoryApi, 'webGet');
} catch {
  webGetCandidate = undefined;
}
const webGet = isWebGet(webGetCandidate) ? webGetCandidate : undefined;

function textField(fields: Record<string, unknown>, key: string): string | null {
  const value = fields[key];
  return typeof value === 'string' ? value : null;
}

function webPlacementFields(item: WebItem): Pick<LegacyItem, 'locationId' | 'containerId'> {
  if (item.placement.kind === 'location') {
    return { locationId: item.placement.locationId, containerId: null };
  }
  if (item.placement.kind === 'container') {
    return { locationId: null, containerId: item.placement.itemId };
  }
  return { locationId: null, containerId: null };
}

function webProvenanceFields(
  item: WebItem
): Pick<
  LegacyItem,
  | 'purchaseDate'
  | 'purchasePrice'
  | 'warrantyExpires'
  | 'purchaseTransactionId'
  | 'purchasedFromName'
> {
  const provenance = item.provenance;
  return {
    purchaseDate: provenance?.purchasedOn ?? null,
    purchasePrice: provenance?.price ?? null,
    warrantyExpires: provenance?.warrantyExpires ?? null,
    purchaseTransactionId: provenance?.transactionUri ?? null,
    purchasedFromName: provenance?.merchant ?? null,
  };
}

function legacyItemFromWeb(item: WebItem): LegacyItem {
  const fields = item.fields ?? {};
  return {
    id: item.id,
    itemName: item.name,
    brand: textField(fields, 'brand'),
    model: textField(fields, 'model'),
    type: item.legacyType,
    condition: textField(fields, 'condition'),
    room: textField(fields, 'room'),
    location: null,
    ...webPlacementFields(item),
    assetId: item.code,
    inUse: item.lifecycle === 'active',
    deductible: false,
    ...webProvenanceFields(item),
    replacementValue: null,
    resaleValue: null,
    purchasedFromId: null,
    itemId: null,
    notes: item.note,
    lastEditedTime: item.updatedAt,
  };
}

function useLegacyItemQuery(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['inventory', 'items', 'get', { id: id ?? '' }],
    queryFn: async () => unwrap(await itemsGet({ path: { id: id ?? '' } })),
    enabled,
  });
}

function useWebItemQuery(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [...webItemDetailQueryKey(id ?? ''), 50],
    queryFn: async () => {
      if (webGet === undefined) throw new Error('web item detail endpoint is unavailable');
      return unwrap(await webGet({ path: { id: id ?? '' }, query: { historyLimit: 50 } }));
    },
    enabled,
  });
}

/** Reads the legacy, web, location, connection, and photo data for item detail. */
export function useItemDetailQueries(id: string | undefined) {
  const legacyQuery = useLegacyItemQuery(id, id !== undefined && typeof itemsGet === 'function');
  const webQuery = useWebItemQuery(id, id !== undefined && webGet !== undefined);
  const legacyItem =
    legacyQuery.data?.data ??
    (webQuery.data?.item ? legacyItemFromWeb(webQuery.data.item) : undefined);
  const locationId = legacyItem?.locationId ?? null;
  const locationQuery = useQuery({
    queryKey: ['inventory', 'locations', 'getPath', { id: locationId ?? '' }],
    queryFn: async () => unwrap(await locationsGetPath({ path: { id: locationId ?? '' } })),
    enabled: locationId !== null,
  });
  const connectionsQuery = useQuery({
    queryKey: ['inventory', 'connections', 'listForItem', { itemId: id ?? '' }],
    queryFn: async () => unwrap(await connectionsListForItem({ path: { itemId: id ?? '' } })),
    enabled: id !== undefined,
  });
  const photosQuery = useQuery({
    queryKey: ['inventory', 'photos', 'listForItem', { itemId: id ?? '' }],
    queryFn: async () => unwrap(await photosListForItem({ path: { itemId: id ?? '' } })),
    enabled: id !== undefined,
  });
  return { legacyQuery, webQuery, legacyItem, locationQuery, connectionsQuery, photosQuery };
}
