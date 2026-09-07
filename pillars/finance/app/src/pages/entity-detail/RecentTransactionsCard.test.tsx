import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RecentTransactionsCard } from './RecentTransactionsCard';

const transactionsListMock = vi.hoisted(() => vi.fn());

vi.mock('../../finance-api/index.js', () => ({
  transactionsList: (...args: unknown[]) => transactionsListMock(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RecentTransactionsCard', () => {
  it('queries transactions filtered by entityId', async () => {
    transactionsListMock.mockResolvedValue({
      data: { data: [], pagination: { total: 0, limit: 6, offset: 0, hasMore: false } },
      error: undefined,
    });

    render(<RecentTransactionsCard entityId="ent-1" />, { wrapper });

    await waitFor(() =>
      expect(transactionsListMock).toHaveBeenCalledWith({ query: { entityId: 'ent-1', limit: 6 } })
    );
  });

  it('shows its own empty state when there are no matching transactions', async () => {
    transactionsListMock.mockResolvedValue({
      data: { data: [], pagination: { total: 0, limit: 6, offset: 0, hasMore: false } },
      error: undefined,
    });

    render(<RecentTransactionsCard entityId="ent-1" />, { wrapper });

    expect(await screen.findByText('No transactions yet')).toBeInTheDocument();
  });

  it('renders each matching transaction', async () => {
    transactionsListMock.mockResolvedValue({
      data: {
        data: [
          {
            id: 't1',
            accountId: 'a1',
            amount: -48.2,
            date: '2026-09-04',
            description: 'Woolworths Metro',
            entityId: 'ent-1',
            entityName: 'Woolworths',
            tags: [],
            type: 'purchase',
          },
        ],
        pagination: { total: 1, limit: 6, offset: 0, hasMore: false },
      },
      error: undefined,
    });

    render(<RecentTransactionsCard entityId="ent-1" />, { wrapper });

    expect(await screen.findByText('Woolworths Metro')).toBeInTheDocument();
    expect(screen.getByText('-$48.20')).toBeInTheDocument();
  });
});
