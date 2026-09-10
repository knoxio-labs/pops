import { type Budget, budgets as allBudgets } from '@/fixtures/budgets';
import { type PendingImport, pendingSets } from '@/fixtures/pending-imports';
import { type Transaction, transactions as allTransactions } from '@/fixtures/transactions';
import { ActiveBudgets, RecentTransactions, StatsGrid } from '@/kit/finance-dashboard-sections';
import { PendingImportList } from '@/kit/pending-import-card';

import { PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Dashboard', order: 0, frame: 'web' };

/**
 * Pending imports sit between the tiles and the recent rows: above the
 * transactions because an unfinished import is why those rows are not
 * there yet, and absent entirely when there is nothing pending — a section
 * that says "nothing to continue" every day is one nobody reads on the day
 * it says something.
 */
function PendingImports({ items }: { items: PendingImport[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Pending imports</h2>
        <span className="text-sm text-muted-foreground">
          {items.length === 1 ? '1 to finish' : `${items.length} to finish`}
        </span>
      </div>
      <PendingImportList items={items} />
    </section>
  );
}

function Dashboard({
  pending,
  transactions = allTransactions.slice(0, 6),
  budgets = allBudgets,
}: {
  pending: PendingImport[];
  transactions?: Transaction[];
  budgets?: Budget[];
}) {
  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6 pb-10">
      <PageHeader title="Dashboard" description="Where the money went this month." />
      <section>
        <StatsGrid transactions={transactions} />
      </section>
      <PendingImports items={pending} />
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
 * The finance dashboard as it ships (`pillars/finance/app/src/pages/DashboardPage.tsx`:
 * stat tiles, recent transactions, active budgets), with the one section it
 * does not have yet: the imports that were started and not finished, so a
 * draft saved on another machine or rows the bank sent overnight are the
 * first thing seen, not something remembered.
 */
export default function FinanceDashboard() {
  return <Dashboard pending={pendingSets.mixed} />;
}

export const states: ScreenStates = {
  'nothing-pending': () => <Dashboard pending={pendingSets.none} />,
  'one-draft': () => <Dashboard pending={pendingSets.one} />,
  'unusable-after-deploy': () => <Dashboard pending={pendingSets.withUnusable} />,
  'open-in-another-tab': () => <Dashboard pending={pendingSets.openElsewhere} />,
  empty: () => <Dashboard pending={pendingSets.none} transactions={[]} budgets={[]} />,
};
