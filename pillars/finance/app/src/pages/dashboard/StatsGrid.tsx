import { useTranslation } from 'react-i18next';

import { formatCurrency, SkeletonGrid, StatCard, type StatCardColor } from '@pops/ui';

import { tileForType } from '../../lib/transaction-type';

import type { TransactionsListResponse } from '../../finance-api/types.gen.js';

type Transaction = NonNullable<TransactionsListResponse['data']>[number];

interface Stats {
  totalTransactions: number;
  totalIncome: number;
  totalExpenses: number;
}

/**
 * @param monthTransactions every transaction dated within the current
 *   calendar month (a date-filtered query, not an arbitrary row slice) —
 *   income/expenses are summed over exactly this set.
 * @param totalAllTime the all-time transaction count, independent of the
 *   month window, for the "Total Transactions" card.
 */
export function computeStats(
  monthTransactions: Transaction[] | undefined,
  totalAllTime: number | undefined
): Stats | null {
  if (!monthTransactions) return null;
  // Aggregate by the type → tile map, not amount sign: income-tile types add
  // their signed amount, expense-tile types add the negated amount (so a refund
  // offsets rather than inflates), and transfers/unknowns feed neither tile.
  let totalIncome = 0;
  let totalExpenses = 0;
  for (const txn of monthTransactions) {
    const tile = tileForType(txn.type);
    if (tile === 'income') totalIncome += txn.amount;
    else if (tile === 'expense') totalExpenses -= txn.amount;
  }
  return { totalTransactions: totalAllTime ?? 0, totalIncome, totalExpenses };
}

export function signedColor(amount: number): StatCardColor {
  if (amount > 0) return 'emerald';
  if (amount < 0) return 'rose';
  return 'slate';
}

/** Money tile: 2 dp with the sign before the currency symbol (e.g. -$400.00). */
export function formatTileAmount(value: number): string {
  return formatCurrency(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function StatsGrid({ stats, isLoading }: { stats: Stats | null; isLoading: boolean }) {
  const { t } = useTranslation('finance');
  if (isLoading) {
    return <SkeletonGrid count={4} itemHeight="h-32" cols="sm:grid-cols-2 lg:grid-cols-4" />;
  }
  if (!stats) return null;
  const netBalance = stats.totalIncome - stats.totalExpenses;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title={t('dashboard.totalTransactions')}
        value={stats.totalTransactions.toLocaleString()}
        description={t('dashboard.allTimeTransactions')}
        color="slate"
      />
      <StatCard
        title={t('dashboard.monthIncome')}
        value={formatTileAmount(stats.totalIncome)}
        description={t('dashboard.thisMonth')}
        color={signedColor(stats.totalIncome)}
      />
      <StatCard
        title={t('dashboard.monthExpenses')}
        value={formatTileAmount(stats.totalExpenses)}
        description={t('dashboard.thisMonth')}
        color={signedColor(-stats.totalExpenses)}
      />
      <StatCard
        title={t('dashboard.netBalance')}
        value={formatTileAmount(netBalance)}
        description={t('dashboard.thisMonth')}
        color={signedColor(netBalance)}
      />
    </div>
  );
}
