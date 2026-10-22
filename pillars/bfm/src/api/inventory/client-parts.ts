import { z } from 'zod';

import {
  MobileInventoryItemPartsSchema,
  type MobileInventoryItemParts,
} from '../../contract/rest-mobile-inventory-parts.js';
import { isGatewayOk } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';

import type { GatewayOutcome, PillarGateway } from '../pillars/gateway.js';
import type { ItemPartRequest, ItemRequest } from './client-types.js';

const INVENTORY_PILLAR_ID = 'inventory';

/** Inventory answers every parts route as `{ data: ItemParts }`. */
const InventoryItemPartsEnvelopeSchema = z.object({ data: MobileInventoryItemPartsSchema });

type PartPair = { itemId: string; partItemId: string };

type InventoryPartsRouter = {
  items: {
    getParts: (input: { itemId: string }) => Promise<unknown>;
    addPart: (input: PartPair) => Promise<unknown>;
    removePart: (input: PartPair) => Promise<unknown>;
  };
};

function unwrap(
  outcome: GatewayOutcome<unknown>,
  operation: string
): GatewayOutcome<MobileInventoryItemParts> {
  const parsed = parseOrMismatch(
    INVENTORY_PILLAR_ID,
    outcome,
    InventoryItemPartsEnvelopeSchema,
    operation
  );
  return isGatewayOk(parsed) ? { kind: 'ok', value: parsed.value.data } : parsed;
}

/** Reads an item's assembly and parts through the inventory gateway. */
export async function callItemParts(
  gateway: PillarGateway,
  request: ItemRequest
): Promise<GatewayOutcome<MobileInventoryItemParts>> {
  const outcome = await gateway.call<InventoryPartsRouter, unknown>(INVENTORY_PILLAR_ID, (handle) =>
    handle.items.getParts({ itemId: request.itemId })
  );
  return unwrap(outcome, 'items.getParts');
}

/** Makes `partItemId` a part of `itemId` through the inventory gateway. */
export async function callAddItemPart(
  gateway: PillarGateway,
  request: ItemPartRequest
): Promise<GatewayOutcome<MobileInventoryItemParts>> {
  const outcome = await gateway.call<InventoryPartsRouter, unknown>(INVENTORY_PILLAR_ID, (handle) =>
    handle.items.addPart({ itemId: request.itemId, partItemId: request.partItemId })
  );
  return unwrap(outcome, 'items.addPart');
}

/** Stops `partItemId` being a part of `itemId` through the inventory gateway. */
export async function callRemoveItemPart(
  gateway: PillarGateway,
  request: ItemPartRequest
): Promise<GatewayOutcome<MobileInventoryItemParts>> {
  const outcome = await gateway.call<InventoryPartsRouter, unknown>(INVENTORY_PILLAR_ID, (handle) =>
    handle.items.removePart({ itemId: request.itemId, partItemId: request.partItemId })
  );
  return unwrap(outcome, 'items.removePart');
}
