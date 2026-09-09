import { type Budget, budgets as allBudgets } from '@/fixtures/budgets';
import { type Transaction, transactions as allTransactions } from '@/fixtures/transactions';
import { ActiveBudgets, RecentTransactions, StatsGrid } from '@/kit/finance-dashboard-sections';

import { PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Dashboard', order: 0, frame: 'web' };

function Dashboard({
  transactions = allTransactions.slice(0, 6),
  budgets = allBudgets,
}: {
  transactions?: Transaction[];
  budgets?: Budget[];
}) {
  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6 pb-10">
      <PageHeader title="Dashboard" description="Where the money went this month." />
      <section>
        <StatsGrid transactions={transactions} />
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Recent transactions</h2>
        <RecentTransactions transactions={transactions} />
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Active budgets</h2>
        <ActiveBudgets budgets={budgets} />
      </section>
    </div>
  );
}

/**
 * The finance dashboard as it ships (`pillars/finance/app/src/pages/DashboardPage.tsx`):
 * stat tiles, recent transactions, active budgets. Where an unfinished
 * import shows up here is the `pending-imports-entry` experiment's question.
 */
export default function FinanceDashboard() {
  return <Dashboard />;
}

export const states: ScreenStates = {
  empty: () => <Dashboard transactions={[]} budgets={[]} />,
};
