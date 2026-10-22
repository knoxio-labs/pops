import { getPillar } from '../pillar-client.js';
import { mapCallResult, reqStr, toolError } from './utils.js';

import type { PillarHandle } from '@pops/pillar-sdk/client';

import type { ToolDef } from './tool-def.js';

type ItemInput = { itemId: string };
type PartInput = { itemId: string; partItemId: string };

type PartsShape = {
  items: {
    getParts: (input: ItemInput) => unknown;
    addPart: (input: PartInput) => unknown;
    removePart: (input: PartInput) => unknown;
  };
};

function items(): PillarHandle<PartsShape>['items'] {
  return getPillar<PartsShape>('inventory').items;
}

const ITEM_ID = {
  type: 'string',
  description: 'The assembly item ID (a kit, set or modular piece of furniture)',
};
const PART_ITEM_ID = { type: 'string', description: 'The item ID of the part' };

const partsList: ToolDef = {
  name: 'inventory.parts.list',
  readOnly: true,
  description:
    "Read an item's place in an assembly: `assembly` is the item it is a part of (or null), `parts` lists its own parts with where each one currently is, and `canHaveParts` says whether its type grants the parts capability.",
  inputSchema: {
    type: 'object',
    properties: { itemId: { type: 'string', description: 'Item ID' } },
    required: ['itemId'],
  },
  handler: async (args) => {
    const itemId = reqStr(args, 'itemId');
    if (!itemId) return toolError('Missing required field: itemId');
    return mapCallResult(await items().getParts({ itemId }));
  },
};

function partWrite(
  name: string,
  description: string,
  call: (input: PartInput) => ReturnType<PillarHandle<PartsShape>['items']['addPart']>
): ToolDef {
  return {
    name,
    readOnly: false,
    description,
    inputSchema: {
      type: 'object',
      properties: { itemId: ITEM_ID, partItemId: PART_ITEM_ID },
      required: ['itemId', 'partItemId'],
    },
    handler: async (args) => {
      const itemId = reqStr(args, 'itemId');
      if (!itemId) return toolError('Missing required field: itemId');
      const partItemId = reqStr(args, 'partItemId');
      if (!partItemId) return toolError('Missing required field: partItemId');
      return mapCallResult(await call({ itemId, partItemId }));
    },
  };
}

const partsAdd = partWrite(
  'inventory.parts.add',
  "Make an existing item a part of an assembly. The assembly's type must grant the `parts` capability; an item is a part of at most one assembly, never of itself or its own parts. The part keeps its own placement. Re-adding the same pair is a no-op.",
  (input) => items().addPart(input)
);

const partsRemove = partWrite(
  'inventory.parts.remove',
  'Stop an item being a part of an assembly. The item itself is kept.',
  (input) => items().removePart(input)
);

export const partTools: readonly ToolDef[] = [partsList, partsAdd, partsRemove];
