import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
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
      <AccountAndFormatFields dialectId="Amex" onBankChange={vi.fn()} />
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

  it('shows the newly created account in the picker, not just on the store', async () => {
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

    // The picker's own list query resolves to both accounts once the create
    // settles and invalidates it — not just the original one from mount.
    accountsList.mockResolvedValue({
      data: {
        data: [account({}), account({ id: 'acc-new', name: 'Bendigo Everyday' })],
        pagination: { total: 2, limit: 500, offset: 0, hasMore: false },
      },
      error: undefined,
    });
    await user.click(dialog.getByRole('button', { name: 'Create account' }));

    // The picker resolves the now-selected id against its own accounts list —
    // if that list is never invalidated, the id lookup misses and the trigger
    // falls back to the unselected placeholder instead of the account's name.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(
      await screen.findByRole('combobox', { name: 'Account to import into' })
    ).toHaveTextContent('Bendigo Everyday');
  });

  it('toasts an unmapped create failure instead of swallowing it', async () => {
    const user = userEvent.setup();
    accountsCreate.mockResolvedValue({
      data: undefined,
      error: { message: 'finance API request failed: not permitted (HTTP 403)' },
      response: { status: 403 },
    });
    renderFields([account({})]);

    await user.click(await screen.findByRole('button', { name: /add the account/i }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByPlaceholderText('Everyday'), 'Bendigo Everyday');
    await user.click(dialog.getByRole('combobox', { name: 'Currency' }));
    await user.click(await screen.findByText('AUD — Australian Dollar'));
    await user.click(dialog.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'finance API request failed: not permitted (HTTP 403)'
      )
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(useImportStore.getState().accountId).toBeNull();
  });

  it('routes a duplicate-name create failure onto the name field instead of a toast', async () => {
    const user = userEvent.setup();
    accountsCreate.mockResolvedValue({
      data: undefined,
      error: { message: "Account 'Bendigo Everyday' already exists" },
      response: { status: 409 },
    });
    renderFields([account({})]);

    await user.click(await screen.findByRole('button', { name: /add the account/i }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByPlaceholderText('Everyday'), 'Bendigo Everyday');
    await user.click(dialog.getByRole('combobox', { name: 'Currency' }));
    await user.click(await screen.findByText('AUD — Australian Dollar'));
    await user.click(dialog.getByRole('button', { name: 'Create account' }));

    expect(
      await dialog.findByText("Account 'Bendigo Everyday' already exists")
    ).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
