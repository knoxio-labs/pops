import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountsPage } from './AccountsPage';

import type { Account } from './accounts/types';

const accountsList = vi.fn();
const institutionsList = vi.fn();
const currenciesList = vi.fn();

vi.mock('../finance-api/index.js', () => ({
  accountsList: (...args: unknown[]) => accountsList(...args),
  institutionsList: (...args: unknown[]) => institutionsList(...args),
  currenciesList: (...args: unknown[]) => currenciesList(...args),
  accountsCreate: vi.fn(),
  accountsUpdate: vi.fn(),
  institutionsCreate: vi.fn(),
  giftCardDetailsGet: vi.fn(),
  giftCardDetailsWrite: vi.fn(),
  giftCardDetailsReveal: vi.fn(),
}));

function account(overrides: Partial<Account>): Account {
  return {
    id: 'id',
    name: 'Account',
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
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/finance/accounts']}>
        <Routes>
          <Route path="/finance/accounts" element={<AccountsPage />} />
          <Route path="/finance/accounts/:id" element={<div>Account detail page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function mockLists(accounts: Account[]) {
  accountsList.mockResolvedValue({
    data: {
      data: accounts,
      pagination: { total: accounts.length, limit: 500, offset: 0, hasMore: false },
    },
    error: undefined,
  });
  institutionsList.mockResolvedValue({ data: { data: [] }, error: undefined });
  currenciesList.mockResolvedValue({
    data: {
      data: [
        {
          code: 'AUD',
          name: 'Australian Dollar',
          symbol: '$',
          decimals: 2,
          kind: 'fiat',
          createdAt: '',
        },
      ],
    },
    error: undefined,
  });
}

describe('AccountsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the fresh-install empty state when there are no accounts', async () => {
    mockLists([]);
    renderPage();
    expect(await screen.findByText('No accounts yet')).toBeInTheDocument();
  });

  it('renders one card per account, with a filter chip per kind present', async () => {
    mockLists([
      account({ id: 'a1', kind: 'checking' }),
      account({ id: 'a2', kind: 'savings', name: 'Rainy day' }),
    ]);
    renderPage();
    expect(await screen.findByText('Account')).toBeInTheDocument();
    expect(screen.getByText('Rainy day')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Checking', pressed: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Savings', pressed: false })).toBeInTheDocument();
  });

  it('shows the no-results empty state when a search matches nothing, and clears back to the full list', async () => {
    mockLists([account({ id: 'a1', name: 'Everyday' })]);
    renderPage();
    await screen.findByText('Everyday');

    await userEvent.type(screen.getByLabelText('Search accounts'), 'nonexistent');
    expect(await screen.findByText('No accounts match')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(screen.getByText('Everyday')).toBeInTheDocument());
  });

  it('navigates to the account detail page when a card is clicked, rather than opening the edit dialog', async () => {
    mockLists([account({ id: 'a1', name: 'Everyday' })]);
    renderPage();
    await userEvent.click(await screen.findByText('Everyday'));
    expect(await screen.findByText('Account detail page')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps archived accounts hidden until the reveal toggle is used', async () => {
    mockLists([
      account({ id: 'a1', name: 'Active one' }),
      account({ id: 'a2', name: 'Old card', archivedAt: '2026-01-01T00:00:00.000Z' }),
    ]);
    renderPage();
    await screen.findByText('Active one');
    expect(screen.queryByText('Old card')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Show 1 archived/ }));
    expect(await screen.findByText('Old card')).toBeInTheDocument();
  });
});
