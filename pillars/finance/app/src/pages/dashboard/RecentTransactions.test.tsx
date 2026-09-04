import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RecentTransactions } from './RecentTransactions';

import type { TransactionsListResponse } from '../../finance-api/types.gen.js';

type Transaction = NonNullable<TransactionsListResponse['data']>[number];

const mockAccountsList = vi.fn();
const mockInstitutionsList = vi.fn();

vi.mock('../../finance-api/index.js', () => ({
  accountsList: (...args: unknown[]) => mockAccountsList(...args),
  institutionsList: (...args: unknown[]) => mockInstitutionsList(...args),
}));

function makeTransaction(tags: string[]): Transaction {
  return {
    accountId: 'account-1',
    amount: -12.5,
    country: null,
    date: '2026-08-01',
    description: 'Coffee',
    entityId: null,
    entityName: null,
    foreignAmountMinor: null,
    foreignCurrency: null,
    fxFeeCents: null,
    fxCaptureSource: null,
    id: 't1',
    lastEditedTime: '2026-08-01T00:00:00Z',
    location: null,
    notes: null,
    relatedTransactionId: null,
    tags,
    type: 'purchase',
  };
}

function renderRow(tags: string[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(
    <MemoryRouter>
      <RecentTransactions transactions={[makeTransaction(tags)]} isLoading={false} />
    </MemoryRouter>,
    { wrapper }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInstitutionsList.mockResolvedValue({ data: { data: [] }, error: undefined });
  mockAccountsList.mockResolvedValue({
    data: {
      data: [
        {
          id: 'account-1',
          name: 'Up Everyday',
          institutionId: null,
          kind: 'checking',
          currency: 'AUD',
          archivedAt: null,
          displayOrder: 0,
          entityId: null,
          entityDisplayName: null,
          entityDisplayNameStale: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      pagination: { total: 1, limit: 500, offset: 0, hasMore: false },
    },
    error: undefined,
  });
});

describe('RecentTransactions', () => {
  it('badges a transaction tagged with the namespaced online channel', () => {
    renderRow(['channel:online', 'venue:cafe']);

    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('does not badge a transaction on another channel', () => {
    renderRow(['channel:in-person']);

    expect(screen.queryByText('Online')).toBeNull();
  });

  it('does not badge on a value from another facet that happens to be "online"', () => {
    renderRow(['project:online']);

    expect(screen.queryByText('Online')).toBeNull();
  });

  it('does not badge an untagged transaction', () => {
    renderRow([]);

    expect(screen.queryByText('Online')).toBeNull();
  });

  it('renders the resolved account chip once accounts have loaded, not the raw id', async () => {
    renderRow([]);

    expect(await screen.findByText('Up Everyday')).toBeInTheDocument();
    expect(screen.queryByText('account-1')).toBeNull();
  });
});
