import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useImportStore } from '../../../store/importStore';
import { AccountAndFormatFields } from './AccountAndFormatFields';

import type { Account } from '../../../pages/accounts/types';

const accountsList = vi.fn();
const institutionsList = vi.fn();
const currenciesList = vi.fn();
const accountsCreate = vi.fn();

vi.mock('../../../finance-api/index.js', () => ({
  accountsList: (...args: unknown[]) => accountsList(...args),
  institutionsList: (...args: unknown[]) => institutionsList(...args),
  currenciesList: (...args: unknown[]) => currenciesList(...args),
  accountsCreate: (...args: unknown[]) => accountsCreate(...args),
  institutionsCreate: vi.fn(),
  giftCardDetailsWrite: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function account(overrides: Partial<Account>): Account {
  return {
    id: 'acc-1',
    name: 'ANZ Everyday',
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

const AUD = {
  code: 'AUD',
  name: 'Australian Dollar',
  symbol: '$',
  decimals: 2,
  kind: 'fiat' as const,
  createdAt: '',
};

function renderFields(accounts: Account[]) {
  accountsList.mockResolvedValue({
    data: {
      data: accounts,
      pagination: { total: accounts.length, limit: 500, offset: 0, hasMore: false },
    },
    error: undefined,
  });
  institutionsList.mockResolvedValue({ data: { data: [] }, error: undefined });
  currenciesList.mockResolvedValue({ data: { data: [AUD] }, error: undefined });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountAndFormatFields bankType="Amex" onBankChange={vi.fn()} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  useImportStore.getState().reset();
  vi.clearAllMocks();
});

describe('AccountAndFormatFields', () => {
  it('shows an empty state instead of a picker when there are no accounts yet', async () => {
    renderFields([]);
    expect(await screen.findByText('No accounts yet')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('hides the bank/format picker until an account is chosen', async () => {
    renderFields([account({})]);
    expect(await screen.findByRole('combobox', { name: 'Account to import into' })).toBeVisible();
    expect(screen.getByText(/pick an account first/i)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('reveals the format picker once an account is picked, and records it on the store', async () => {
    const user = userEvent.setup();
    renderFields([account({})]);

    await user.click(await screen.findByRole('combobox', { name: 'Account to import into' }));
    await user.click(await screen.findByText('ANZ Everyday'));

    expect(useImportStore.getState().accountId).toBe('acc-1');
    expect(useImportStore.getState().accountName).toBe('ANZ Everyday');
    expect(screen.getAllByRole('radio').length).toBeGreaterThan(0);
  });

  it('creating an account from the inline hatch pre-selects it on the store', async () => {
    const user = userEvent.setup();
    accountsCreate.mockResolvedValue({
      data: { data: account({ id: 'acc-new', name: 'Bendigo Everyday' }), message: 'Created' },
      error: undefined,
    });
    renderFields([account({})]);

    await user.click(await screen.findByRole('button', { name: /add the account/i }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByPlaceholderText('Everyday'), 'Bendigo Everyday');
    await user.click(dialog.getByRole('combobox', { name: 'Currency' }));
    await user.click(await screen.findByText('AUD — Australian Dollar'));
    await user.click(dialog.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(useImportStore.getState().accountId).toBe('acc-new'));
    expect(useImportStore.getState().accountName).toBe('Bendigo Everyday');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
