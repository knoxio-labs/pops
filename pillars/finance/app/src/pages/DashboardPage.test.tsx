import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { DashboardPage } from './DashboardPage';

const budgetsList = vi.fn();
const transactionsList = vi.fn();

vi.mock('../finance-api/index.js', () => ({
  budgetsList: (...args: unknown[]) => budgetsList(...args),
  transactionsList: (...args: unknown[]) => transactionsList(...args),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('DashboardPage', () => {
  it('requests only active budgets, limited to 3, from the server', async () => {
    transactionsList.mockResolvedValue({
      data: { data: [], pagination: { total: 0, limit: 10, offset: 0, hasMore: false } },
      error: undefined,
    });
    budgetsList.mockResolvedValue({
      data: { data: [], pagination: { total: 0, limit: 3, offset: 0, hasMore: false } },
      error: undefined,
    });

    renderPage();

    await waitFor(() => expect(budgetsList).toHaveBeenCalled());

    expect(budgetsList).toHaveBeenCalledWith({
      query: { limit: 3, active: 'true' },
    });
  });

  it('renders every budget the server returns, without re-slicing client-side', async () => {
    transactionsList.mockResolvedValue({
      data: { data: [], pagination: { total: 0, limit: 10, offset: 0, hasMore: false } },
      error: undefined,
    });
    budgetsList.mockResolvedValue({
      data: {
        data: [
          {
            id: 'b1',
            category: 'Groceries',
            period: 'Monthly',
            amount: 400,
            active: true,
            notes: null,
            lastEditedTime: '2026-07-01T00:00:00Z',
            spent: 100,
            remaining: 300,
          },
          {
            id: 'b2',
            category: 'Transport',
            period: 'Monthly',
            amount: 200,
            active: true,
            notes: null,
            lastEditedTime: '2026-07-01T00:00:00Z',
            spent: 50,
            remaining: 150,
          },
          {
            id: 'b3',
            category: 'Entertainment',
            period: 'Monthly',
            amount: 100,
            active: true,
            notes: null,
            lastEditedTime: '2026-07-01T00:00:00Z',
            spent: 10,
            remaining: 90,
          },
        ],
        pagination: { total: 3, limit: 3, offset: 0, hasMore: false },
      },
      error: undefined,
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Groceries')).toBeInTheDocument());
    expect(screen.getByText('Transport')).toBeInTheDocument();
    expect(screen.getByText('Entertainment')).toBeInTheDocument();
  });
});
