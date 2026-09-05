import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NO_BALANCE, NO_IMPORT_STATUS, NO_TRANSACTION_COUNT } from '../test-utils.js';
import { AccountCheckpointsPage } from './AccountCheckpointsPage';

import type { CheckpointsListResponse } from '../finance-api/index.js';
import type { Account } from './accounts/types';

type Checkpoint = NonNullable<CheckpointsListResponse['data']>[number];

const accountsList = vi.fn();
const institutionsList = vi.fn();
const currenciesList = vi.fn();
const checkpointsList = vi.fn();
const checkpointsCreate = vi.fn();
const checkpointsRemove = vi.fn();

vi.mock('../finance-api/index.js', () => ({
  accountsList: (...args: unknown[]) => accountsList(...args),
  institutionsList: (...args: unknown[]) => institutionsList(...args),
  currenciesList: (...args: unknown[]) => currenciesList(...args),
  checkpointsList: (...args: unknown[]) => checkpointsList(...args),
  checkpointsCreate: (...args: unknown[]) => checkpointsCreate(...args),
  checkpointsRemove: (...args: unknown[]) => checkpointsRemove(...args),
}));

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));

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
    importStatus: NO_IMPORT_STATUS,
    transactionCount: NO_TRANSACTION_COUNT,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const AUD = { code: 'AUD', name: 'Australian Dollar', symbol: '$', decimals: 2, kind: 'fiat' as const, createdAt: '' }; // prettier-ignore

function checkpoint(overrides: Partial<Checkpoint>): Checkpoint {
  return {
    id: 'c1',
    accountId: 'a1',
    balanceCents: 100_000,
    asOf: '2026-08-01',
    source: 'manual',
    sourceRef: null,
    note: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    expectedBalanceCents: null,
    deltaCents: null,
    ...overrides,
  };
}

function renderPage(accounts: Account[], id: string, checkpoints: Checkpoint[] = []) {
  accountsList.mockResolvedValue({
    data: {
      data: accounts,
      pagination: { total: accounts.length, limit: 500, offset: 0, hasMore: false },
    },
    error: undefined,
  });
  institutionsList.mockResolvedValue({ data: { data: [] }, error: undefined });
  currenciesList.mockResolvedValue({ data: { data: [AUD] }, error: undefined });
  checkpointsList.mockResolvedValue({ data: { data: checkpoints }, error: undefined });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/finance/accounts/${id}/checkpoints`]}>
        <Routes>
          <Route path="/finance/accounts/:id/checkpoints" element={<AccountCheckpointsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function openAddDialog() {
  await userEvent.click(await screen.findByRole('button', { name: 'Add checkpoint' }));
}

describe('AccountCheckpointsPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the not-found state for an unknown id, not a crash', async () => {
    renderPage([account({ id: 'a1' })], 'does-not-exist');
    expect(await screen.findByText('No such account')).toBeInTheDocument();
  });

  it('shows the empty state with no checkpoints, then a Manual row once one is added', async () => {
    checkpointsCreate.mockResolvedValue({
      data: {
        data: checkpoint({ id: 'new', balanceCents: 50_000, asOf: '2026-09-01' }),
        message: '',
      },
      error: undefined,
    });
    renderPage([account({ id: 'a1' })], 'a1', []);
    expect(await screen.findByText('No checkpoints yet')).toBeInTheDocument();

    checkpointsList.mockResolvedValue({
      data: { data: [checkpoint({ id: 'new', balanceCents: 50_000, asOf: '2026-09-01' })] },
      error: undefined,
    });

    await openAddDialog();
    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.type(dialog.getByPlaceholderText('0.00'), '500');
    await userEvent.click(dialog.getByRole('button', { name: 'Save checkpoint' }));

    await waitFor(() => expect(checkpointsCreate).toHaveBeenCalled());
    expect(await screen.findByText('Manual')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete the/ })).toBeInTheDocument();
  });

  it('never offers delete on an import or statement row — only manual is deletable', async () => {
    renderPage([account({ id: 'a1' })], 'a1', [
      checkpoint({ id: 'c1', source: 'import', asOf: '2026-06-01' }),
      checkpoint({ id: 'c2', source: 'statement', asOf: '2026-08-15' }),
    ]);
    await screen.findByText('Import');
    expect(screen.getByText('Statement')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete the/ })).not.toBeInTheDocument();
  });

  it('shows the inconsistency banner and the row callout with the right numbers', async () => {
    renderPage([account({ id: 'a2', kind: 'credit-card', currency: 'AUD' })], 'a2', [
      checkpoint({
        id: 'c1',
        accountId: 'a2',
        balanceCents: -213_755,
        asOf: '2026-09-02',
        source: 'statement',
        expectedBalanceCents: -208_920,
        deltaCents: -4_835,
      }),
    ]);

    expect(await screen.findByText(/checkpoint says/)).toBeInTheDocument();
    expect(screen.getAllByText('-$2,137.55').length).toBeGreaterThan(0);
    expect(screen.getAllByText('-$2,089.20').length).toBeGreaterThan(0);
    expect(screen.getByText('$48.35', { exact: false })).toBeInTheDocument();
  });

  it('does not flag a checkpoint whose delta is exactly zero', async () => {
    renderPage([account({ id: 'a1' })], 'a1', [
      checkpoint({ id: 'c1', expectedBalanceCents: 100_000, deltaCents: 0 }),
    ]);
    await screen.findByText('Manual');
    expect(screen.queryByText(/checkpoint says/)).not.toBeInTheDocument();
    expect(screen.queryByText(/predicted/)).not.toBeInTheDocument();
  });

  it('negates a liability entry before POST — the user types what the card app shows', async () => {
    checkpointsCreate.mockResolvedValue({
      data: {
        data: checkpoint({ id: 'new', accountId: 'a2', balanceCents: -50_000 }),
        message: '',
      },
      error: undefined,
    });
    renderPage([account({ id: 'a2', kind: 'credit-card' })], 'a2', []);

    await openAddDialog();
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText(/Amount owed/)).toBeInTheDocument();
    await userEvent.type(dialog.getByPlaceholderText('0.00'), '500');
    await userEvent.click(dialog.getByRole('button', { name: 'Save checkpoint' }));

    await waitFor(() => expect(checkpointsCreate).toHaveBeenCalled());
    const [call] = checkpointsCreate.mock.calls[0] as [{ body: { balanceCents: number } }];
    expect(call.body.balanceCents).toBe(-50_000);
  });

  it('refuses a future date client-side, without calling the API', async () => {
    renderPage([account({ id: 'a1' })], 'a1', []);
    await openAddDialog();
    const dialogElement = await screen.findByRole('dialog');
    const dialog = within(dialogElement);
    await userEvent.type(dialog.getByPlaceholderText('0.00'), '100');
    const dateInput = dialogElement.querySelector('input[type="date"]');
    if (!dateInput) throw new Error('expected a date input in the dialog');
    fireEvent.change(dateInput, { target: { value: '2099-01-01' } });
    await userEvent.click(dialog.getByRole('button', { name: 'Save checkpoint' }));

    expect(await dialog.findByText('Date cannot be in the future')).toBeInTheDocument();
    expect(checkpointsCreate).not.toHaveBeenCalled();
  });

  it('surfaces a 409 delete refusal by its own message, not a generic one', async () => {
    checkpointsRemove.mockResolvedValue({
      data: undefined,
      error: { message: 'a statement checkpoint cannot be deleted by hand' },
      response: { status: 409 },
    });
    renderPage([account({ id: 'a1' })], 'a1', [checkpoint({ id: 'c1', source: 'manual' })]);

    await userEvent.click(await screen.findByRole('button', { name: /Delete the/ }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('a statement checkpoint cannot be deleted by hand')
    );
  });
});
