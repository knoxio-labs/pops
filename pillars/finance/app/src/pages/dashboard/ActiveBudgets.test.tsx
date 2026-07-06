import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { ActiveBudgets } from './ActiveBudgets';

import type { BudgetsListResponse } from '../../finance-api/types.gen.js';

type Budget = NonNullable<BudgetsListResponse['data']>[number];

function makeBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: 'b1',
    category: 'Groceries',
    period: 'Monthly',
    amount: 400,
    active: true,
    notes: null,
    lastEditedTime: '2026-07-01T00:00:00Z',
    spent: 100,
    remaining: 300,
    ...overrides,
  };
}

function renderBudgets(
  budgets: Budget[] | undefined,
  isLoading = false,
  error: Error | null = null
) {
  return render(
    <MemoryRouter>
      <ActiveBudgets budgets={budgets} isLoading={isLoading} error={error} />
    </MemoryRouter>
  );
}

describe('ActiveBudgets', () => {
  it('renders every budget it is given, trusting the server-side limit', () => {
    const budgets = [
      makeBudget({ id: 'b1', category: 'Groceries' }),
      makeBudget({ id: 'b2', category: 'Transport' }),
      makeBudget({ id: 'b3', category: 'Entertainment' }),
      makeBudget({ id: 'b4', category: 'Utilities' }),
    ];

    renderBudgets(budgets);

    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('Transport')).toBeInTheDocument();
    expect(screen.getByText('Entertainment')).toBeInTheDocument();
    expect(screen.getByText('Utilities')).toBeInTheDocument();
  });

  it('shows the empty state with a link to manage budgets when there are none', () => {
    renderBudgets([]);

    expect(screen.getByText('No active budgets found.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage Budgets' })).toHaveAttribute(
      'href',
      '/finance/budgets'
    );
  });

  it('shows a loading skeleton while budgets are being fetched', () => {
    renderBudgets(undefined, true);

    expect(screen.queryByText('No active budgets found.')).not.toBeInTheDocument();
    expect(screen.queryByText('Groceries')).not.toBeInTheDocument();
  });

  it('surfaces a query error instead of a false empty state', () => {
    renderBudgets(undefined, false, new Error('network unreachable'));

    expect(screen.getByText("Couldn't load budgets")).toBeInTheDocument();
    expect(screen.getByText('network unreachable')).toBeInTheDocument();
    expect(screen.queryByText('No active budgets found.')).not.toBeInTheDocument();
  });

  it('renders spent and progress for each budget card', () => {
    renderBudgets([makeBudget({ category: 'Groceries', amount: 400, spent: 100 })]);

    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('flags an over-budget card as destructive via the spent badge', () => {
    renderBudgets([makeBudget({ category: 'Entertainment', amount: 100, spent: 150 })]);

    const badge = screen.getByText('$150.00');
    expect(badge).toHaveAttribute('data-variant', 'destructive');
  });
});
