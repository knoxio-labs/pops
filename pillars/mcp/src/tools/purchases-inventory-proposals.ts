/**
 * The one write the purchases tools make: recording that an inventory item
 * which already exists is the asset an order line's unit became.
 *
 * It is a link the user asked for, with an artefact on both ends. Declining
 * an offer and creating the asset through purchases stay out: a decline is a
 * judgement with nothing behind it, and it cannot be retracted.
 */
import { getPillar } from '../pillar-client.js';
import { mapCallResult, reqStr, toolError } from './utils.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { PillarHandle } from '@pops/pillar-sdk/client';

import type { ToolDef } from './tool-def.js';

type AcceptInput = {
  id: string;
  itemId: string;
  decision: 'accepted';
  inventoryItemUri: string;
  unitId?: string;
};

type ProposalsShape = {
  purchase: {
    listInventoryProposals: (input: { id: string }) => unknown;
    decideInventoryProposal: (input: AcceptInput) => unknown;
  };
};

type InventoryShape = {
  web: { get: (input: { id: string }) => { item: { id: string; deletedAt: string | null } } };
};

function purchases(): PillarHandle<ProposalsShape> {
  return getPillar<ProposalsShape>('purchases');
}

function inventory(): PillarHandle<InventoryShape> {
  return getPillar<InventoryShape>('inventory');
}

const proposalsList: ToolDef = {
  name: 'purchases.inventoryProposals.list',
  description:
    "List an order's unanswered inventory offers: one per unit of each line classified as durable that is not yet linked to an inventory item. Lines are unclassified until a classification pass runs, so an empty list does not mean nothing can be linked; inventoryProposals.accept takes any line of the order. Also empty for an order that does not exist.",
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: { orderId: { type: 'string', description: 'Order id' } },
    required: ['orderId'],
  },
  handler: async (args) => {
    const orderId = reqStr(args, 'orderId');
    if (!orderId) return toolError('Missing required field: orderId');
    return mapCallResult(await purchases().purchase.listInventoryProposals({ id: orderId }));
  },
};

// Purchases stores the URI unchecked and a decision cannot be retracted, so a
// wrong id would be a permanent link to nothing.
async function missingInventoryItem(inventoryItemId: string): Promise<CallToolResult | undefined> {
  const found = await inventory().web.get({ id: inventoryItemId });
  if (found.kind !== 'ok') return mapCallResult(found);
  if (found.value.item.deletedAt !== null) {
    return toolError(`Inventory item ${inventoryItemId} is deleted and cannot be linked.`);
  }
  return undefined;
}

const proposalsAccept: ToolDef = {
  name: 'purchases.inventoryProposals.accept',
  description:
    "Link an existing inventory item to the order line unit it came from. Take orderId and the line's itemId from purchases.orders.get or purchases.search. It works on any line of the order, whether or not purchases.inventoryProposals.list offers it: that list only covers lines already classified as durable, and most lines are unclassified. Send unitId only when the line already has an unanswered unit row, as orders.get shows it. The inventory item must already exist; this creates nothing. The link is permanent: it cannot be changed or removed afterwards, so only call it when the user has said which item came from which order line.",
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      orderId: { type: 'string', description: 'Order id' },
      itemId: { type: 'string', description: "The order line's item id" },
      unitId: {
        type: 'string',
        description: "Id of the line's unanswered unit row, when it has one. Omit otherwise.",
      },
      inventoryItemId: { type: 'string', description: 'Id of the existing inventory item' },
    },
    required: ['orderId', 'itemId', 'inventoryItemId'],
  },
  handler: async (args) => {
    const orderId = reqStr(args, 'orderId');
    if (!orderId) return toolError('Missing required field: orderId');
    const itemId = reqStr(args, 'itemId');
    if (!itemId) return toolError('Missing required field: itemId');
    const inventoryItemId = reqStr(args, 'inventoryItemId');
    if (!inventoryItemId) return toolError('Missing required field: inventoryItemId');
    const unitId = args['unitId'];
    if (unitId !== undefined && (typeof unitId !== 'string' || unitId.length === 0)) {
      return toolError('Invalid field: unitId');
    }

    const missing = await missingInventoryItem(inventoryItemId);
    if (missing !== undefined) return missing;

    return mapCallResult(
      await purchases().purchase.decideInventoryProposal({
        id: orderId,
        itemId,
        decision: 'accepted',
        inventoryItemUri: `pops://inventory/item/${inventoryItemId}`,
        ...(unitId === undefined ? {} : { unitId }),
      })
    );
  },
};

export const inventoryProposalTools: readonly ToolDef[] = [proposalsList, proposalsAccept];
