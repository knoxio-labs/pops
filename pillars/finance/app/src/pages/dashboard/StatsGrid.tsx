import { useTranslation } from 'react-i18next';

import { SkeletonGrid, StatCard, type StatCardColor } from '@pops/ui';

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
  const nonTransfers = monthTransactions.filter((t) => t.type.toLowerCase() !== 'transfer');
  return {
    totalTransactions: totalAllTime ?? 0,
    totalIncome: nonTransfers.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0),
    totalExpenses: nonTransfers
      .filter((t) => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0),
  };
}

export function signedColor(amount: number): StatCardColor {
  if (amount > 0) return 'emerald';
  if (amount < 0) return 'rose';
  return 'slate';
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
        value={`$${stats.totalIncome.toFixed(2)}`}
        description={t('dashboard.thisMonth')}
        color={signedColor(stats.totalIncome)}
      />
      <StatCard
        title={t('dashboard.monthExpenses')}
        value={`$${stats.totalExpenses.toFixed(2)}`}
        description={t('dashboard.thisMonth')}
        color={signedColor(-stats.totalExpenses)}
      />
      <StatCard
        title={t('dashboard.netBalance')}
        value={`$${netBalance.toFixed(2)}`}
        description={t('dashboard.thisMonth')}
        color={signedColor(netBalance)}
      />
    </div>
  );
}
