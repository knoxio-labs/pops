import { readPath, type UriTypeResolver } from './resolver.js';

/** Resolves purchase order object URIs through the purchases gateway. */
export const purchasesUriResolvers: readonly UriTypeResolver[] = [
  {
    key: 'purchases/purchase',
    tool: 'purchases.orders.get',
    args: (id) => (id.length === 0 ? null : { id }),
    describe: (payload) => {
      const merchantName = readPath(payload, 'purchase', 'merchantEntityName');
      const title = merchantName === null ? readPath(payload, 'purchase', 'source') : merchantName;
      if (typeof title !== 'string') return null;

      const orderedAt = readPath(payload, 'purchase', 'orderedAt');
      const totalCents = readPath(payload, 'purchase', 'totalCents');
      const currency = readPath(payload, 'purchase', 'currency');
      const subtitle =
        typeof orderedAt === 'string' &&
        orderedAt.length >= 10 &&
        typeof totalCents === 'number' &&
        Number.isFinite(totalCents) &&
        typeof currency === 'string'
          ? `${orderedAt.slice(0, 10)} · ${(totalCents / 100).toFixed(2)} ${currency}`
          : undefined;

      return { title, ...(subtitle === undefined ? {} : { subtitle }) };
    },
  },
];
