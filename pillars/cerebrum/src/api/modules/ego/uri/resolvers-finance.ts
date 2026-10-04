import { readPath, type UriTypeResolver } from './resolver.js';

/** Resolves finance transaction and budget object URIs. */
export const financeUriResolvers: readonly UriTypeResolver[] = [
  {
    key: 'finance/transaction',
    tool: 'finance.transactions.get',
    args: (id) => (id.length === 0 ? null : { id }),
    describe: (payload) => {
      const title = readPath(payload, 'data', 'description');
      if (typeof title !== 'string') return null;

      const date = readPath(payload, 'data', 'date');
      const amount = readPath(payload, 'data', 'amount');
      const subtitle =
        typeof date === 'string' && typeof amount === 'number' && Number.isFinite(amount)
          ? date + ' · ' + amount.toFixed(2)
          : undefined;
      return { title, ...(subtitle === undefined ? {} : { subtitle }) };
    },
  },
  {
    key: 'finance/budget',
    tool: 'finance.budgets.get',
    args: (id) => (id.length === 0 ? null : { id }),
    describe: (payload) => {
      const title = readPath(payload, 'data', 'category');
      if (typeof title !== 'string') return null;

      const period = readPath(payload, 'data', 'period');
      const subtitle = typeof period === 'string' && period.trim().length > 0 ? period : undefined;
      return { title, ...(subtitle === undefined ? {} : { subtitle }) };
    },
  },
];
