import {
  MobileInventoryItemsPageSchema,
  type MobileInventoryItemsPage,
  type MobileInventoryItemsQuery,
} from '../../contract/mobile-inventory-list-schemas.js';
import { parseOrMismatch } from '../pillars/parse-response.js';

import type { GatewayOutcome, PillarGateway } from '../pillars/gateway.js';

const INVENTORY_PILLAR_ID = 'inventory';

type InventoryWebItemsRouter = {
  web: {
    list: (input: MobileInventoryItemsQuery) => Promise<unknown>;
  };
};

/** Relay one filtered mobile browse page from Inventory's web item query. */
export async function fetchMobileInventoryItems(
  gateway: PillarGateway,
  request: MobileInventoryItemsQuery
): Promise<GatewayOutcome<MobileInventoryItemsPage>> {
  const outcome = await gateway.call<InventoryWebItemsRouter, unknown>(
    INVENTORY_PILLAR_ID,
    (handle) => handle.web.list(request)
  );
  return parseOrMismatch(INVENTORY_PILLAR_ID, outcome, MobileInventoryItemsPageSchema, 'web.list');
}
