import { finance } from './finance-client.js';
import { mapCallResult, optNum, optStr, reqStr, toolError } from './utils.js';

import type { ToolDef } from './tool-def.js';

const wishlistList: ToolDef = {
  name: 'finance.wishlist.list',
  description: 'List wish-list items. Supports free-text search and priority filtering.',
  inputSchema: {
    type: 'object',
    properties: {
      search: { type: 'string', description: 'Search by item name' },
      priority: { type: 'string', description: 'Filter by priority' },
      limit: { type: 'number', description: 'Max results (default 50)' },
      offset: { type: 'number', description: 'Pagination offset (default 0)' },
    },
  },
  handler: async (args) => {
    const result = await finance().wishlist.list({
      search: optStr(args, 'search'),
      priority: optStr(args, 'priority'),
      limit: optNum(args, 'limit'),
      offset: optNum(args, 'offset'),
    });
    return mapCallResult(result);
  },
};

const wishlistGet: ToolDef = {
  name: 'finance.wishlist.get',
  description: 'Get a single wish-list item by ID.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Wish-list item ID' } },
    required: ['id'],
  },
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    return mapCallResult(await finance().wishlist.get({ id }));
  },
};

export const wishlistTools: readonly ToolDef[] = [wishlistList, wishlistGet];
