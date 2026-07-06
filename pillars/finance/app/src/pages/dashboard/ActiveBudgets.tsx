import { Link } from 'react-router';

import { Badge, Button, Card, ErrorAlert, SkeletonGrid } from '@pops/ui';

import { BudgetProgressBar, BudgetSpentBadge } from '../budgets/BudgetProgress';

import type { BudgetsListResponse } from '../../finance-api/types.gen.js';

type Budget = NonNullable<BudgetsListResponse['data']>[number];

function BudgetCard({ budget }: { budget: Budget }) {
  return (
    <Card className="p-5 flex flex-col justify-between h-full">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-muted-foreground uppercase text-2xs tracking-widest">
            {budget.category}
          </h3>
          <Badge variant={budget.active ? 'default' : 'secondary'} className="text-2xs h-5">
            {budget.active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold">
            ${budget.amount ? budget.amount.toFixed(2) : '0.00'}
          </span>
          <span className="text-xs text-muted-foreground">/ {budget.period}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <BudgetSpentBadge spent={budget.spent} amount={budget.amount} />
          <BudgetProgressBar spent={budget.spent} amount={budget.amount} />
        </div>
      </div>
    </Card>
  );
}

export function ActiveBudgets({
  budgets,
  isLoading,
  error,
}: {
  budgets: Budget[] | undefined;
  isLoading: boolean;
  error?: Error | null;
}) {
  if (isLoading) {
    return <SkeletonGrid count={3} itemHeight="h-32" cols="md:grid-cols-3" />;
  }
  if (error) {
    return (
      <ErrorAlert
        title="Couldn't load budgets"
        message="The budgets list failed to load."
        details={error.message}
      />
    );
  }
  if (!budgets || budgets.length === 0) {
    return (
      <Card className="p-12 text-center border-dashed">
        <p className="text-muted-foreground mb-4">No active budgets found.</p>
        <Button asChild size="sm">
          <Link to="/finance/budgets">Manage Budgets</Link>
        </Button>
      </Card>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {budgets.map((budget) => (
        <BudgetCard key={budget.id} budget={budget} />
      ))}
    </div>
  );
}
