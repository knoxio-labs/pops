import { getPillar } from '../pillar-client.js';
import { itemDeleteTool } from './inventory-item-delete.js';
import { itemWriteTools } from './inventory-items-write.js';
import { mapCallResult, optBool, optNum, optStr, reqStr, toolError } from './utils.js';

import type { PillarHandle } from '@pops/pillar-sdk/client';

import type { ToolDef } from './tool-def.js';

type ItemsShape = {
  web: {
    list: (input: {
      cursor?: string;
      limit?: number;
      typeKey?: string;
      placementKind?: 'location' | 'container' | 'hand';
      locationId?: string;
      containingItemId?: string;
      includeInactive?: boolean;
    }) => unknown;
    get: (input: { id: string; historyCursor?: string; historyLimit?: number }) => unknown;
  };
};

function items(): PillarHandle<ItemsShape>['web'] {
  return getPillar<ItemsShape>('inventory').web;
}

function placementKind(value: unknown): 'location' | 'container' | 'hand' | undefined {
  return value === 'location' || value === 'container' || value === 'hand' ? value : undefined;
}

const itemsList: ToolDef = {
  name: 'inventory.items.list',
  description:
    'List protocol-2 inventory items with stable typeId, catalogueRevision and fieldValues. Read inventory.catalogue.get before interpreting field IDs.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      cursor: { type: 'string', description: 'Opaque next-page cursor from the previous response' },
      limit: { type: 'integer', minimum: 1, maximum: 200 },
      typeKey: { type: 'string', description: 'Published type key filter' },
      placementKind: { type: 'string', enum: ['location', 'container', 'hand'] },
      locationId: { type: 'string' },
      containingItemId: { type: 'string' },
      includeInactive: { type: 'boolean' },
    },
  },
  handler: async (args) =>
    mapCallResult(
      await items().list({
        cursor: optStr(args, 'cursor'),
        limit: optNum(args, 'limit'),
        typeKey: optStr(args, 'typeKey'),
        placementKind: placementKind(args['placementKind']),
        locationId: optStr(args, 'locationId'),
        containingItemId: optStr(args, 'containingItemId'),
        includeInactive: optBool(args, 'includeInactive'),
      })
    ),
};

const itemGet: ToolDef = {
  name: 'inventory.items.get',
  description:
    'Get one protocol-2 item, including revision, stable typeId, catalogueRevision, fieldValues and history. Read the matching catalogue revision before editing values.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string', description: 'Item ID' },
      historyCursor: { type: 'string', description: 'Opaque older-history cursor' },
      historyLimit: { type: 'integer', minimum: 1, maximum: 200 },
    },
    required: ['id'],
  },
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    return mapCallResult(
      await items().get({
        id,
        historyCursor: optStr(args, 'historyCursor'),
        historyLimit: optNum(args, 'historyLimit'),
      })
    );
  },
};

export const itemTools: readonly ToolDef[] = [
  itemsList,
  itemGet,
  ...itemWriteTools,
  itemDeleteTool,
];
