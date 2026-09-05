import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NO_BALANCE } from '../test-utils.js';
import { AccountDetailPage } from './AccountDetailPage';

import type {
  CurrenciesListResponses,
  TransactionsListResponse,
} from '../finance-api/types.gen.js';
import type { Account } from './accounts/types';

type Transaction = NonNullable<TransactionsListResponse['data']>[number];
type Currency = CurrenciesListResponses[200]['data'][number];

const accountsList = vi.fn();
const institutionsList = vi.fn();
const currenciesList = vi.fn();
const transactionsList = vi.fn();
const accountsUpdate = vi.fn();
const entitiesList = vi.fn();

vi.mock('../finance-api/index.js', () => ({
  accountsList: (...args: unknown[]) => accountsList(...args),
  institutionsList: (...args: unknown[]) => institutionsList(...args),
  currenciesList: (...args: unknown[]) => currenciesList(...args),
  transactionsList: (...args: unknown[]) => transactionsList(...args),
  accountsUpdate: (...args: unknown[]) => accountsUpdate(...args),
  transactionsAvailableTags: vi.fn(),
  institutionsCreate: vi.fn(),
  giftCardDetailsGet: vi.fn(),
  giftCardDetailsWrite: vi.fn(),
  giftCardDetailsReveal: vi.fn(),
  loanWriteTerms: vi.fn(),
  loanGetTerms: vi.fn().mockRejectedValue(Object.assign(new Error('not found'), { status: 404 })),
  loanListRateHistory: vi.fn().mockResolvedValue({ data: { data: [] }, error: undefined }),
  loanListOffsetLinks: vi.fn().mockResolvedValue({ data: { data: [] }, error: undefined }),
}));

vi.mock('../contacts-api/index.js', () => ({
  entitiesList: (...args: unknown[]) => entitiesList(...args),
}));

function account(overrides: Partial<Account>): Account {
  return {
    id: 'a1',
    name: 'Everyday',
    institutionId: null,
    kind: 'checking',
    currency: 'AUD',
    archivedAt: null,
    displayOrder: 0,
    entityId: null,
    entityDisplayName: null,
    entityDisplayNameStale: false,
    balance: NO_BALANCE,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const AUD: Currency = { code: 'AUD', name: 'Australian Dollar', symbol: '$', decimals: 2, kind: 'fiat', createdAt: '' }; // prettier-ignore
const POINTS: Currency = { code: 'QFF', name: 'Qantas points', symbol: null, decimals: 0, kind: 'points', createdAt: '' }; // prettier-ignore

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: 't1',
    accountId: 'a1',
    amount: -12.5,
    country: null,
    date: '2026-08-01',
    description: 'Coffee',
    entityId: null,
    entityName: null,
    foreignAmountMinor: null,
    foreignCurrency: null,
    fxCaptureSource: null,
    fxFeeCents: null,
    lastEditedTime: '2026-08-01T00:00:00Z',
    location: null,
    notes: null,
    relatedTransactionId: null,
    tags: [],
    type: 'purchase',
    ...overrides,
  };
}

function renderDetail(
  accounts: Account[],
  id: string,
  opts: { currencies?: Currency[]; transactions?: Transaction[] } = {}
) {
  accountsList.mockResolvedValue({
    data: {
      data: accounts,
      pagination: { total: accounts.length, limit: 500, offset: 0, hasMore: false },
    },
    error: undefined,
  });
  institutionsList.mockResolvedValue({ data: { data: [] }, error: undefined });
  currenciesList.mockResolvedValue({ data: { data: opts.currencies ?? [AUD] }, error: undefined });
  const transactions = opts.transactions ?? [];
  transactionsList.mockResolvedValue({
    data: {
      data: transactions,
      pagination: { total: transactions.length, limit: 500, offset: 0, hasMore: false },
    },
    error: undefined,
  });
  entitiesList.mockResolvedValue({
    data: { data: [], pagination: { total: 0, limit: 200, offset: 0, hasMore: false } },
    error: undefined,
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/finance/accounts/${id}`]}>
        <Routes>
          <Route path="/finance/accounts/:id" element={<AccountDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('AccountDetailPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows an error panel with a retry when the accounts query fails', async () => {
    accountsList.mockRejectedValue(new Error('network down'));
    institutionsList.mockResolvedValue({ data: { data: [] }, error: undefined });
    currenciesList.mockResolvedValue({ data: { data: [AUD] }, error: undefined });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/finance/accounts/a1']}>
          <Routes>
            <Route path="/finance/accounts/:id" element={<AccountDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByText('network down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows "No such account" once the accounts list loads and the id is not in it', async () => {
    renderDetail([account({ id: 'a1' })], 'does-not-exist');
    expect(await screen.findByText('No such account')).toBeInTheDocument();
  });

  it('renders the header, an honestly-empty balance card and an empty module grid for a checking account', async () => {
    renderDetail([account({ id: 'a1', name: 'Everyday', kind: 'checking' })], 'a1');

    expect(await screen.findByRole('heading', { name: 'Everyday' })).toBeInTheDocument();
    expect(screen.getByText('Checking')).toBeInTheDocument();
    expect(screen.getByText('AUD')).toBeInTheDocument();
    expect(screen.getByText('Not tracked yet')).toBeInTheDocument();
    expect(screen.queryByText('Archived')).not.toBeInTheDocument();
  });

  it('shows the archived banner at the top of the page for an archived account, not just a faded card', async () => {
    renderDetail(
      [account({ id: 'a1', name: 'Old savings', archivedAt: '2026-01-01T00:00:00.000Z' })],
      'a1'
    );
    expect(await screen.findByText(/Archived, not deleted/)).toBeInTheDocument();
    expect(screen.getAllByText('Archived').length).toBeGreaterThan(0);
  });

  it('gives a liability kind (credit-card) its own true balance-card wording, never asset framing', async () => {
    renderDetail([account({ id: 'a1', kind: 'credit-card' })], 'a1');
    expect(await screen.findByText(/check against your statements/)).toBeInTheDocument();
  });

  it.each(['checking', 'savings', 'credit-card', 'cash', 'gift-card', 'person', 'loan'] as const)(
    'renders something true and specific for the %s kind without crashing',
    async (kind) => {
      renderDetail([account({ id: 'a1', kind })], 'a1');
      await screen.findByRole('heading', { name: 'Everyday' });
      expect(screen.getByText('Not tracked yet')).toBeInTheDocument();
    }
  );

  it('renders a points-currency recent transaction with no currency symbol and no decimals', async () => {
    renderDetail([account({ id: 'a1', currency: 'QFF' })], 'a1', {
      currencies: [POINTS],
      transactions: [transaction({ amount: 500 })],
    });
    expect(await screen.findByText('500 pts')).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it('links "View all" to the transactions list filtered to this account', async () => {
    renderDetail([account({ id: 'a1' })], 'a1');
    await screen.findByRole('heading', { name: 'Everyday' });
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      '/finance/transactions?account=a1'
    );
  });

  it('links "Import transactions" pre-scoped to this account', async () => {
    renderDetail([account({ id: 'a1' })], 'a1');
    await screen.findByRole('heading', { name: 'Everyday' });
    expect(screen.getByRole('link', { name: /Import transactions/ })).toHaveAttribute(
      'href',
      '/finance/import?account=a1'
    );
  });

  it('opens the edit dialog prefilled with this account, not the accounts list', async () => {
    renderDetail([account({ id: 'a1', name: 'Everyday' })], 'a1');
    await screen.findByRole('heading', { name: 'Everyday' });

    await userEvent.click(screen.getByRole('button', { name: 'Edit account' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByDisplayValue('Everyday')).toBeInTheDocument();
  });

  it('opens "Add transaction" pre-scoped to this account', async () => {
    renderDetail([account({ id: 'a1', name: 'Everyday' })], 'a1');
    await screen.findByRole('heading', { name: 'Everyday' });

    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText('New Transaction')).toBeInTheDocument();
    expect(dialog.getByRole('combobox', { name: 'Account' })).toHaveTextContent('Everyday');
  });

  it('does not offer "Settle up" — no settle-up flow exists yet (POPS-2876)', async () => {
    renderDetail([account({ id: 'a1', kind: 'person' })], 'a1');
    await screen.findByRole('heading', { name: 'Everyday' });
    expect(screen.queryByRole('button', { name: /Settle up/ })).not.toBeInTheDocument();
  });

  it('shows an edit that updates the account against its own id, independent of the list page', async () => {
    accountsUpdate.mockResolvedValue({
      data: { data: account({ id: 'a1', name: 'Renamed' }), message: '' },
      error: undefined,
    });
    renderDetail([account({ id: 'a1', name: 'Everyday' })], 'a1');
    await screen.findByRole('heading', { name: 'Everyday' });

    await userEvent.click(screen.getByRole('button', { name: 'Edit account' }));
    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.clear(dialog.getByPlaceholderText('Everyday'));
    await userEvent.type(dialog.getByPlaceholderText('Everyday'), 'Renamed');
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(accountsUpdate).toHaveBeenCalled());
    const [call] = accountsUpdate.mock.calls[0] as [{ path: { id: string } }];
    expect(call.path).toEqual({ id: 'a1' });
  });
});
