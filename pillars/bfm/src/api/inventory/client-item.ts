import {
  MobileInventoryItemResultSchema,
  type MobileInventoryItemResult,
} from '../../contract/mobile-inventory-schemas.js';
import { parseOrMismatch } from '../pillars/parse-response.js';

import type { GatewayOutcome, PillarGateway } from '../pillars/gateway.js';
import type { ItemRequest } from './client-types.js';

const INVENTORY_PILLAR_ID = 'inventory';

type InventoryItemRouter = {
  sync: {
    item: (input: { id: string }) => Promise<unknown>;
  };
};

/** Reads one inventory item and its projection issues through the gateway. */
export async function callItem(
  gateway: PillarGateway,
  request: ItemRequest
): Promise<GatewayOutcome<MobileInventoryItemResult>> {
  const outcome = await gateway.call<InventoryItemRouter, unknown>(INVENTORY_PILLAR_ID, (handle) =>
    handle.sync.item({ id: request.itemId })
  );
  return parseOrMismatch(
    INVENTORY_PILLAR_ID,
    outcome,
    MobileInventoryItemResultSchema,
    'sync.item'
  );
}
