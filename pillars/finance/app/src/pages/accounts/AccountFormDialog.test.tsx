import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NO_BALANCE, NO_IMPORT_STATUS } from '../../test-utils.js';
import { AccountDetailPage } from '../AccountDetailPage';
import { AccountsPage } from '../AccountsPage';

import type { Account } from './types';

const accountsList = vi.fn();
const institutionsList = vi.fn();
const currenciesList = vi.fn();
const accountsCreate = vi.fn();
const accountsUpdate = vi.fn();
const transactionsList = vi.fn();
const entitiesList = vi.fn();
const loanWriteTerms = vi.fn();
const loanGetTerms = vi.fn();
const loanListRateHistory = vi.fn();
const loanListOffsetLinks = vi.fn();
const loanLinkOffsetAccount = vi.fn();
const loanUnlinkOffsetAccount = vi.fn();

vi.mock('../../finance-api/index.js', () => ({
  accountsList: (...args: unknown[]) => accountsList(...args),
  institutionsList: (...args: unknown[]) => institutionsList(...args),
  currenciesList: (...args: unknown[]) => currenciesList(...args),
  accountsCreate: (...args: unknown[]) => accountsCreate(...args),
  accountsUpdate: (...args: unknown[]) => accountsUpdate(...args),
  transactionsList: (...args: unknown[]) => transactionsList(...args),
  transactionsAvailableTags: vi.fn(),
  institutionsCreate: vi.fn(),
  giftCardDetailsGet: vi.fn(),
  giftCardDetailsWrite: vi.fn(),
  giftCardDetailsReveal: vi.fn(),
  loanWriteTerms: (...args: unknown[]) => loanWriteTerms(...args),
  loanGetTerms: (...args: unknown[]) => loanGetTerms(...args),
  loanListRateHistory: (...args: unknown[]) => loanListRateHistory(...args),
  loanRecordRate: vi.fn(),
  loanListOffsetLinks: (...args: unknown[]) => loanListOffsetLinks(...args),
  loanLinkOffsetAccount: (...args: unknown[]) => loanLinkOffsetAccount(...args),
  loanUnlinkOffsetAccount: (...args: unknown[]) => loanUnlinkOffsetAccount(...args),
}));

vi.mock('../../contacts-api/index.js', () => ({
  entitiesList: (...args: unknown[]) => entitiesList(...args),
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
    balance: NO_BALANCE,
    importStatus: NO_IMPORT_STATUS,
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

function renderPage(accounts: Account[]) {
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
      <MemoryRouter>
        <AccountsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/**
 * The edit dialog moved off the accounts list onto the account detail page
 * (POPS-2805) — this renders that page directly at the target account's id,
 * with the transactions/entities queries its "Add transaction" action and
 * recent-transactions section always fire stubbed to empty, since none of
 * the edit-dialog tests below care about either.
 */
function renderDetailPage(accounts: Account[], id: string) {
  accountsList.mockResolvedValue({
    data: {
      data: accounts,
      pagination: { total: accounts.length, limit: 500, offset: 0, hasMore: false },
    },
    error: undefined,
  });
  institutionsList.mockResolvedValue({ data: { data: [] }, error: undefined });
  currenciesList.mockResolvedValue({ data: { data: [AUD] }, error: undefined });
  transactionsList.mockResolvedValue({
    data: { data: [], pagination: { total: 0, limit: 500, offset: 0, hasMore: false } },
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

async function openEditDialog() {
  await userEvent.click(await screen.findByRole('button', { name: 'Edit account' }));
  return within(screen.getByRole('dialog'));
}

async function openCreateDialog() {
  await userEvent.click(await screen.findByRole('button', { name: 'Add account' }));
  return within(screen.getByRole('dialog'));
}

async function pickCurrency(dialog: ReturnType<typeof within>, label: string) {
  await userEvent.click(dialog.getByRole('combobox', { name: 'Currency' }));
  await userEvent.click(await screen.findByText(label));
}

/** The Kind field's combobox has no `aria-label` support (`ComboboxSelect`) — it renders first among the dialog's comboboxes. */
function kindCombobox(dialog: ReturnType<typeof within>) {
  return dialog.getAllByRole('combobox')[0];
}

async function selectKind(dialog: ReturnType<typeof within>, label: string) {
  await userEvent.click(kindCombobox(dialog));
  await userEvent.click(await screen.findByRole('option', { name: label }));
}

describe('AccountFormDialog — create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates an account with the entered name, default kind and chosen currency', async () => {
    accountsCreate.mockResolvedValue({
      data: { data: account({ id: 'new' }), message: 'Account created' },
      error: undefined,
    });
    renderPage([]);
    const dialog = await openCreateDialog();

    await userEvent.type(dialog.getByPlaceholderText('Everyday'), 'Everyday');
    await pickCurrency(dialog, 'AUD — Australian Dollar');
    await userEvent.click(dialog.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(accountsCreate).toHaveBeenCalled());
    const [call] = accountsCreate.mock.calls[0] as [{ body: Record<string, unknown> }];
    expect(call.body).toMatchObject({ name: 'Everyday', kind: 'checking', currency: 'AUD' });
  });

  it('creates a second cash account in a currency already in use without any client-side error', async () => {
    accountsCreate.mockResolvedValue({
      data: { data: account({ id: 'new', kind: 'cash' }), message: 'Account created' },
      error: undefined,
    });
    renderPage([account({ id: 'existing', kind: 'cash', name: 'Wallet' })]);
    const dialog = await openCreateDialog();

    await selectKind(dialog, 'Cash');
    await userEvent.type(dialog.getByPlaceholderText('Everyday'), 'Piggy bank');
    await pickCurrency(dialog, 'AUD — Australian Dollar');
    expect(dialog.getByText(/more than one account per currency/)).toBeInTheDocument();

    await userEvent.click(dialog.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(accountsCreate).toHaveBeenCalled());
  });

  it('hides the institution field and shows a contact hint once kind is switched to person', async () => {
    renderPage([]);
    const dialog = await openCreateDialog();
    expect(dialog.getByRole('combobox', { name: 'Institution' })).toBeInTheDocument();

    await selectKind(dialog, 'Person');

    expect(dialog.queryByRole('combobox', { name: 'Institution' })).not.toBeInTheDocument();
    expect(dialog.getByText(/looks up or creates a matching contact/)).toBeInTheDocument();
  });

  it('writes loan terms after creating a new loan account with every term filled', async () => {
    accountsCreate.mockResolvedValue({
      data: { data: account({ id: 'new-loan', kind: 'loan' }), message: 'Account created' },
      error: undefined,
    });
    loanWriteTerms.mockResolvedValue({
      data: { data: { accountId: 'new-loan' }, message: 'Terms saved' },
      error: undefined,
    });
    renderPage([]);
    const dialog = await openCreateDialog();

    await selectKind(dialog, 'Loan');
    await userEvent.type(dialog.getByPlaceholderText('Everyday'), 'Home loan');
    await pickCurrency(dialog, 'AUD — Australian Dollar');
    fireEvent.change(dialog.getByLabelText('Original principal'), { target: { value: '500000' } });
    fireEvent.change(dialog.getByLabelText('Annual rate'), { target: { value: '6.24' } });
    fireEvent.change(dialog.getByLabelText('Term (months)'), { target: { value: '360' } });
    fireEvent.change(dialog.getByLabelText('Monthly repayment'), { target: { value: '3100' } });
    await userEvent.type(dialog.getByLabelText('Started on'), '2024-01-01');
    await userEvent.type(dialog.getByLabelText('Terms effective from'), '2026-07-01');
    await userEvent.click(dialog.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(loanWriteTerms).toHaveBeenCalled());
    const [call] = loanWriteTerms.mock.calls[0] as [
      { path: { id: string }; body: Record<string, unknown> },
    ];
    expect(call.path).toEqual({ id: 'new-loan' });
    expect(call.body).toMatchObject({
      originalPrincipal: 500_000,
      annualRatePct: 6.24,
      termMonths: 360,
      monthlyRepayment: 3_100,
      startedOn: '2024-01-01',
      termsEffectiveFrom: '2026-07-01',
    });
  });

  it('blocks submit with a toast when only some loan terms are filled', async () => {
    renderPage([]);
    const dialog = await openCreateDialog();

    await selectKind(dialog, 'Loan');
    await userEvent.type(dialog.getByPlaceholderText('Everyday'), 'Home loan');
    await pickCurrency(dialog, 'AUD — Australian Dollar');
    fireEvent.change(dialog.getByLabelText('Original principal'), { target: { value: '500000' } });
    await userEvent.click(dialog.getByRole('button', { name: 'Create account' }));

    // The dialog stays open on a blocked submit — a successful one would close it.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(accountsCreate).not.toHaveBeenCalled();
    expect(loanWriteTerms).not.toHaveBeenCalled();
  });

  it('surfaces a duplicate-name 409 as an inline error on the Name field', async () => {
    accountsCreate.mockResolvedValue({
      data: undefined,
      error: { message: "Account 'Everyday' already exists" },
      response: { status: 409 } as Response,
    });
    renderPage([]);
    const dialog = await openCreateDialog();

    await userEvent.type(dialog.getByPlaceholderText('Everyday'), 'Everyday');
    await pickCurrency(dialog, 'AUD — Australian Dollar');
    await userEvent.click(dialog.getByRole('button', { name: 'Create account' }));

    expect(await dialog.findByText("Account 'Everyday' already exists")).toBeInTheDocument();
  });
});

describe('AccountFormDialog — edit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('prefills the existing account and submits an update against its id', async () => {
    accountsUpdate.mockResolvedValue({
      data: { data: account({ id: 'a1', name: 'Renamed' }), message: 'Account updated' },
      error: undefined,
    });
    renderDetailPage([account({ id: 'a1', name: 'Everyday' })], 'a1');

    await screen.findByText('Everyday');
    const dialog = await openEditDialog();
    expect(dialog.getByDisplayValue('Everyday')).toBeInTheDocument();

    await userEvent.clear(dialog.getByPlaceholderText('Everyday'));
    await userEvent.type(dialog.getByPlaceholderText('Everyday'), 'Renamed');
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(accountsUpdate).toHaveBeenCalled());
    const [call] = accountsUpdate.mock.calls[0] as [{ path: { id: string } }];
    expect(call.path).toEqual({ id: 'a1' });
  });

  it('prefills existing loan terms and shows rate history for a loan account', async () => {
    loanGetTerms.mockResolvedValue({
      data: {
        data: {
          accountId: 'loan-1',
          originalPrincipal: 500_000,
          annualRatePct: 6.24,
          termMonths: 360,
          monthlyRepayment: 3_100,
          startedOn: '2024-01-01',
          termsEffectiveFrom: '2026-07-01',
          source: 'manual',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      },
      error: undefined,
    });
    loanListRateHistory.mockResolvedValue({
      data: {
        data: [
          {
            id: 'r1',
            loanAccountId: 'loan-1',
            annualRatePct: 6.24,
            effectiveFrom: '2026-07-01',
            source: 'manual',
            createdAt: '2026-07-01T00:00:00.000Z',
          },
        ],
      },
      error: undefined,
    });
    renderDetailPage([account({ id: 'loan-1', name: 'Home loan', kind: 'loan' })], 'loan-1');

    await screen.findByText('Home loan');
    const dialog = await openEditDialog();

    expect(await dialog.findByLabelText('Original principal')).toHaveValue(500_000);
    expect(dialog.getByLabelText('Annual rate')).toHaveValue(6.24);
    expect(await dialog.findByText('6.24%')).toBeInTheDocument();
    expect(dialog.getByText('from 2026-07-01')).toBeInTheDocument();
  });

  /**
   * Regression for the review-findings-gate HIGH finding on POPS-2846:
   * `recordLoanRate` (the "Record rate change" action) never touches
   * `loan_terms.terms_effective_from`, so once a rate change has been
   * recorded, the terms row's `termsEffectiveFrom` the form prefills is
   * earlier than the loan's actual latest rate. Resubmitting it
   * unconditionally on every save of the edit dialog — even a save that only
   * renames the account — used to hit the backend's `LoanRateNotLatestError`
   * (simulated here via `loanWriteTerms` rejecting) after the rename had
   * already committed, leaving the dialog stuck open on every subsequent
   * save. Renaming without touching any loan-terms field must not call
   * `loanWriteTerms` at all.
   */
  it('renames a loan account without resending its (possibly stale) loan-terms snapshot', async () => {
    loanGetTerms.mockResolvedValue({
      data: {
        data: {
          accountId: 'loan-1',
          originalPrincipal: 500_000,
          annualRatePct: 6.24,
          termMonths: 360,
          monthlyRepayment: 3_100,
          startedOn: '2024-01-01',
          termsEffectiveFrom: '2026-01-01',
          source: 'manual',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
      error: undefined,
    });
    loanListRateHistory.mockResolvedValue({
      data: {
        data: [
          {
            id: 'r2',
            loanAccountId: 'loan-1',
            annualRatePct: 6.5,
            effectiveFrom: '2026-07-01',
            source: 'manual',
            createdAt: '2026-07-01T00:00:00.000Z',
          },
        ],
      },
      error: undefined,
    });
    accountsUpdate.mockResolvedValue({
      data: { data: account({ id: 'loan-1', name: 'Renamed', kind: 'loan' }), message: '' },
      error: undefined,
    });
    // A stand-in for the backend's LoanRateNotLatestError: `termsEffectiveFrom`
    // ('2026-01-01') is earlier than the rate history's latest ('2026-07-01').
    // If the fix regresses and this gets called anyway, the update fails.
    loanWriteTerms.mockRejectedValue(new Error('terms effective from is not the latest'));
    renderDetailPage([account({ id: 'loan-1', name: 'Home loan', kind: 'loan' })], 'loan-1');

    await screen.findByText('Home loan');
    const dialog = await openEditDialog();
    await dialog.findByLabelText('Original principal');

    await userEvent.clear(dialog.getByPlaceholderText('Everyday'));
    await userEvent.type(dialog.getByPlaceholderText('Everyday'), 'Renamed');
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(accountsUpdate).toHaveBeenCalled());
    expect(loanWriteTerms).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows a loan’s offset links, closed ones distinctly, and unlinks the active one', async () => {
    loanGetTerms.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));
    loanListRateHistory.mockResolvedValue({ data: { data: [] }, error: undefined });
    loanListOffsetLinks.mockResolvedValue({
      data: {
        data: [
          {
            id: 'off-1',
            loanAccountId: 'loan-1',
            offsetAccountId: 'checking-1',
            linkedFrom: '2024-01-01',
            unlinkedAt: '2024-06-01',
            createdAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'off-2',
            loanAccountId: 'loan-1',
            offsetAccountId: 'checking-1',
            linkedFrom: '2024-07-01',
            unlinkedAt: null,
            createdAt: '2024-07-01T00:00:00.000Z',
          },
        ],
      },
      error: undefined,
    });
    loanUnlinkOffsetAccount.mockResolvedValue({
      data: {
        data: {
          id: 'off-2',
          loanAccountId: 'loan-1',
          offsetAccountId: 'checking-1',
          linkedFrom: '2024-07-01',
          unlinkedAt: '2026-01-01',
          createdAt: '2024-07-01T00:00:00.000Z',
        },
        message: 'Offset account unlinked',
      },
      error: undefined,
    });
    renderDetailPage(
      [
        account({ id: 'loan-1', name: 'Home loan', kind: 'loan' }),
        account({ id: 'checking-1', name: 'Everyday', kind: 'checking' }),
      ],
      'loan-1'
    );

    await screen.findByText('Home loan');
    const dialog = await openEditDialog();

    expect(await dialog.findByText('Closed')).toBeInTheDocument();
    const unlinkButton = await dialog.findByRole('button', { name: 'Unlink' });

    await userEvent.click(unlinkButton);

    await waitFor(() =>
      expect(loanUnlinkOffsetAccount).toHaveBeenCalledWith(
        expect.objectContaining({ path: { id: 'loan-1', linkId: 'off-2' } })
      )
    );
  });

  it('shows an error message when unlinking an offset account fails', async () => {
    loanGetTerms.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));
    loanListRateHistory.mockResolvedValue({ data: { data: [] }, error: undefined });
    loanListOffsetLinks.mockResolvedValue({
      data: {
        data: [
          {
            id: 'off-2',
            loanAccountId: 'loan-1',
            offsetAccountId: 'checking-1',
            linkedFrom: '2024-07-01',
            unlinkedAt: null,
            createdAt: '2024-07-01T00:00:00.000Z',
          },
        ],
      },
      error: undefined,
    });
    loanUnlinkOffsetAccount.mockRejectedValue(new Error('offset link is already closed'));
    renderDetailPage(
      [
        account({ id: 'loan-1', name: 'Home loan', kind: 'loan' }),
        account({ id: 'checking-1', name: 'Everyday', kind: 'checking' }),
      ],
      'loan-1'
    );

    await screen.findByText('Home loan');
    const dialog = await openEditDialog();
    await userEvent.click(await dialog.findByRole('button', { name: 'Unlink' }));

    expect(await dialog.findByText('offset link is already closed')).toBeInTheDocument();
  });

  it('excludes the loan account itself from the offset-account picker and links the one chosen', async () => {
    loanGetTerms.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));
    loanListRateHistory.mockResolvedValue({ data: { data: [] }, error: undefined });
    loanListOffsetLinks.mockResolvedValue({ data: { data: [] }, error: undefined });
    loanLinkOffsetAccount.mockResolvedValue({
      data: {
        data: {
          id: 'off-3',
          loanAccountId: 'loan-1',
          offsetAccountId: 'checking-1',
          linkedFrom: '2026-02-01',
          unlinkedAt: null,
          createdAt: '2026-02-01T00:00:00.000Z',
        },
        message: 'Offset account linked',
      },
      error: undefined,
    });
    renderDetailPage(
      [
        account({ id: 'loan-1', name: 'Home loan', kind: 'loan' }),
        account({ id: 'checking-1', name: 'Everyday', kind: 'checking' }),
      ],
      'loan-1'
    );

    await screen.findByText('Home loan');
    const dialog = await openEditDialog();
    await userEvent.click(await dialog.findByRole('button', { name: 'Link offset account' }));
    await userEvent.click(dialog.getByRole('combobox', { name: 'Offset account' }));

    expect(await screen.findByRole('option', { name: /Everyday/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Home loan/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('option', { name: /Everyday/ }));
    await userEvent.type(dialog.getByLabelText('Linked from'), '2026-02-01');
    await userEvent.click(dialog.getByRole('button', { name: 'Link account' }));

    await waitFor(() =>
      expect(loanLinkOffsetAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: 'loan-1' },
          body: { offsetAccountId: 'checking-1', linkedFrom: '2026-02-01' },
        })
      )
    );
  });

  it('archives an active account by patching archivedAt to a timestamp', async () => {
    accountsUpdate.mockResolvedValue({
      data: { data: account({ id: 'a1', archivedAt: '2026-02-01T00:00:00.000Z' }), message: '' },
      error: undefined,
    });
    renderDetailPage([account({ id: 'a1', name: 'Everyday', archivedAt: null })], 'a1');

    await screen.findByText('Everyday');
    const dialog = await openEditDialog();
    expect(dialog.queryByText(/Archived, not deleted/)).not.toBeInTheDocument();

    await userEvent.click(dialog.getByRole('button', { name: 'Archive account' }));

    await waitFor(() => expect(accountsUpdate).toHaveBeenCalled());
    const [call] = accountsUpdate.mock.calls[0] as [
      { path: { id: string }; body: { archivedAt: string | null } },
    ];
    expect(call.path).toEqual({ id: 'a1' });
    expect(call.body.archivedAt).toEqual(expect.any(String));
  });

  it('offers unarchive and explains what survived for an already-archived account', async () => {
    accountsUpdate.mockResolvedValue({
      data: { data: account({ id: 'a1', archivedAt: null }), message: '' },
      error: undefined,
    });
    renderDetailPage(
      [account({ id: 'a1', name: 'Old savings', archivedAt: '2026-01-01T00:00:00.000Z' })],
      'a1'
    );

    await screen.findByText('Old savings');
    const dialog = await openEditDialog();
    expect(dialog.getByText(/Archived, not deleted/)).toBeInTheDocument();

    await userEvent.click(dialog.getByRole('button', { name: 'Unarchive account' }));

    await waitFor(() => expect(accountsUpdate).toHaveBeenCalled());
    const [call] = accountsUpdate.mock.calls[0] as [{ body: { archivedAt: string | null } }];
    expect(call.body.archivedAt).toBeNull();
  });
});
