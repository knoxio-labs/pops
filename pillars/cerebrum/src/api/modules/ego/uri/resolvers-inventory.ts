import { readPath, type UriTypeResolver } from './resolver.js';

/** Resolves inventory item object URIs through the inventory gateway. */
export const inventoryUriResolvers: readonly UriTypeResolver[] = [
  {
    key: 'inventory/item',
    tool: 'inventory.items.get',
    args: (id) => (id.length === 0 ? null : { id }),
    describe: (payload) => {
      const title = readPath(payload, 'item', 'name');
      if (typeof title !== 'string') return null;

      const typeKey = readPath(payload, 'item', 'typeKey');
      const subtitle =
        typeof typeKey === 'string' && typeKey.trim().length > 0 ? typeKey : undefined;
      return { title, ...(subtitle === undefined ? {} : { subtitle }) };
    },
  },
];
