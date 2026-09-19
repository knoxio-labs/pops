import { sendItemMutation, withCurrentRevision } from './inventory-sync-client.js';
/**
 * Placement tools: move an item to a location, store it inside a container,
 * or pick it up into hand. Each issues `item.move` over the sync mutation
 * protocol (Inventory ADR-002), reading the item's current revision first so
 * the write carries a `baseRevision` the server can check.
 */
import { mapCallResult, reqStr, toolError } from './utils.js';

import type { ToolDef } from './index.js';

const itemsMove: ToolDef = {
  name: 'inventory.items.move',
  description: "Move an item to a location. Records the move in the item's history.",
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Item ID' },
      locationId: { type: 'string', description: 'Destination location ID' },
    },
    required: ['id', 'locationId'],
  },
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    const locationId = reqStr(args, 'locationId');
    if (!locationId) return toolError('Missing required field: locationId');
    return mapCallResult(
      await withCurrentRevision(id, (baseRevision) =>
        sendItemMutation(
          id,
          'item.move',
          { to: { kind: 'location', locationId }, verb: 'move' },
          baseRevision
        )
      )
    );
  },
};

const itemsStore: ToolDef = {
  name: 'inventory.items.store',
  description: 'Store an item inside a container item (the container must already be a container).',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Item ID' },
      containerId: { type: 'string', description: 'The container item to store it in' },
    },
    required: ['id', 'containerId'],
  },
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    const containerId = reqStr(args, 'containerId');
    if (!containerId) return toolError('Missing required field: containerId');
    return mapCallResult(
      await withCurrentRevision(id, (baseRevision) =>
        sendItemMutation(
          id,
          'item.move',
          { to: { kind: 'container', itemId: containerId }, verb: 'store' },
          baseRevision
        )
      )
    );
  },
};

const itemsPickUp: ToolDef = {
  name: 'inventory.items.pickUp',
  description: 'Pick an item up into hand, remembering where it came from.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Item ID' } },
    required: ['id'],
  },
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    return mapCallResult(
      await withCurrentRevision(id, (baseRevision) =>
        sendItemMutation(id, 'item.move', { to: { kind: 'hand' }, verb: 'pick_up' }, baseRevision)
      )
    );
  },
};

export const placementTools: readonly ToolDef[] = [itemsMove, itemsStore, itemsPickUp];
