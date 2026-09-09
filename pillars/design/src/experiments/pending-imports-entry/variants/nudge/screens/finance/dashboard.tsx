import { type Budget, budgets as allBudgets } from '@/fixtures/budgets';
import { type PendingImport, pendingSets } from '@/fixtures/pending-imports';
import { type Transaction, transactions as allTransactions } from '@/fixtures/transactions';
import { ActiveBudgets, RecentTransactions, StatsGrid } from '@/kit/finance-dashboard-sections';
import { sortPending } from '@/kit/pending-import-card';
import { ArrowRight, History, TriangleAlert } from 'lucide-react';

import { Button, Card, cn, PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Dashboard', order: 0, frame: 'web' };

function summarise(items: PendingImport[]): string {
  const counts = { live: 0, saved: 0, open: 0, unusable: 0 };
  for (const item of items) counts[item.state] += 1;
  const parts: string[] = [];
  if (counts.live > 0) parts.push(`${counts.live} live from Up`);
  if (counts.saved > 0) parts.push(`${counts.saved} saved`);
  if (counts.open > 0) parts.push(`${counts.open} open in another tab`);
  if (counts.unusable > 0) parts.push(`${counts.unusable} to discard`);
  return parts.join(' · ');
}

/**
 * One line instead of a section: how many imports are waiting and what
 * kinds, with the newest named, and the page they live on one click away.
 * The dashboard stays about the money; the plumbing has its own page, the
 * way the account page shows the balance and the imports page shows the
 * batches (POPS-2750).
 */
function PendingNudge({ items }: { items: PendingImport[] }) {
  if (items.length === 0) return null;
  const urgent = items.some((i) => i.state === 'unusable');
  const first = sortPending(items)[0];
  return (
    <Card
      className={cn(
        'flex items-center gap-3 px-4 py-3',
        urgent ? 'border-destructive/40' : 'border-primary/30 bg-primary/5'
      )}
    >
      {urgent ? (
        <TriangleAlert className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
      ) : (
        <History className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {items.length === 1 ? '1 import to finish' : `${items.length} imports to finish`}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {summarise(items)}
          {first && first.state !== 'unusable' && ` · newest: ${first.step ?? 'unreviewed'}`}
        </p>
      </div>
      <Button size="sm" variant="outline" suffix={<ArrowRight className="h-4 w-4" />}>
        Pending imports
      </Button>
    </Card>
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
      <PendingNudge items={pending} />
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

export default function FinanceDashboard() {
  return <Dashboard pending={pendingSets.mixed} />;
}

export const states: ScreenStates = {
  'nothing-pending': () => <Dashboard pending={pendingSets.none} />,
  'one-draft': () => <Dashboard pending={pendingSets.one} />,
  'unusable-after-deploy': () => <Dashboard pending={pendingSets.withUnusable} />,
  'open-in-another-tab': () => <Dashboard pending={pendingSets.openElsewhere} />,
};
