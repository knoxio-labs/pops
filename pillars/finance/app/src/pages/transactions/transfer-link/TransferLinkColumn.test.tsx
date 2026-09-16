import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTranslation } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';

const transactionsGetMock = vi.hoisted(() => vi.fn());

/**
 * Mocked at the generated-SDK boundary, same as `TransferLinkIndicator.test`
 * and `PurchaseLinkColumn.test` beside it, so `unwrap` and the row's own
 * fetch-on-open wiring run for real.
 */
vi.mock('../../../finance-api/index.js', () => ({
  transactionsGet: (...args: unknown[]) => transactionsGetMock(...args),
}));

import { DataTable } from '@pops/ui';

import { buildColumns } from '../columns';

import type { AccountOption } from '@pops/ui';

import type { Transaction } from '../types';

const ACCOUNTS: AccountOption[] = [
  { id: 'account-savings', name: 'Everyday Savings', kind: 'savings' },
];

const LINKED_ROW: Transaction = {
  id: 'tx-1',
  description: 'Transfer to Everyday Savings',
  accountId: 'account-checking',
  amount: -250,
  date: '2026-03-05',
  type: 'transfer',
  tags: [],
  entityId: null,
  entityName: null,
  location: null,
  relatedTransactionId: 'tx-2',
};

function counterpart() {
  return {
    data: {
      data: {
        id: 'tx-2',
        accountId: 'account-savings',
        amount: 250,
        date: '2026-03-06',
        description: 'Transfer from Everyday Checking',
        entityId: null,
        entityName: null,
        country: null,
        foreignAmountMinor: null,
        foreignCurrency: null,
        fxCaptureSource: null,
        fxFeeCents: null,
        lastEditedTime: '2026-03-06T00:00:00.000Z',
        location: null,
        notes: null,
        relatedTransactionId: 'tx-1',
        tags: [],
        type: 'transfer',
      },
    },
    error: undefined,
  };
}

function Harness({ transactions }: { transactions: Transaction[] }) {
  const { t } = useTranslation('finance');
  const columns = buildColumns({
    t,
    availableTags: [],
    accounts: ACCOUNTS,
    purchaseLinks: { byTransactionId: new Map(), unavailable: false },
    onTagSave: () => async () => undefined,
    onTagSuggest: () => async () => [],
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onUnlink: vi.fn(),
    onShowPurchase: vi.fn(),
  });
  return <DataTable columns={columns} data={transactions} paginated={false} />;
}

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function renderTable(transactions: Transaction[] = [LINKED_ROW]) {
  return render(<Harness transactions={transactions} />, { wrapper: Wrapper });
}

beforeEach(() => transactionsGetMock.mockReset());
afterEach(cleanup);

describe('the Link2 indicator on a linked transfer row', () => {
  it('shows only an icon until opened, never the counterpart on its own', () => {
    transactionsGetMock.mockResolvedValue(counterpart());
    renderTable();

    const row = screen.getByText('Transfer to Everyday Savings').closest('tr');
    if (row === null) throw new Error('no row rendered for the linked transaction');
    expect(within(row).queryByText('Everyday Savings')).not.toBeInTheDocument();
    expect(transactionsGetMock).not.toHaveBeenCalled();
  });

  it("renders the counterpart's account and amount once the icon is opened", async () => {
    transactionsGetMock.mockResolvedValue(counterpart());
    renderTable();

    const row = screen.getByText('Transfer to Everyday Savings').closest('tr');
    if (row === null) throw new Error('no row rendered for the linked transaction');
    await userEvent.click(
      within(row).getByRole('button', { name: /other side of this transfer/iu })
    );

    await waitFor(() => expect(transactionsGetMock).toHaveBeenCalledWith({ path: { id: 'tx-2' } }));
    expect(await screen.findByText('Everyday Savings')).toBeInTheDocument();
    expect(await screen.findByText('+$250.00')).toBeInTheDocument();
  });

  it('renders no indicator at all on an unlinked row', () => {
    transactionsGetMock.mockResolvedValue(counterpart());
    renderTable([{ ...LINKED_ROW, relatedTransactionId: null }]);

    expect(screen.queryByRole('button', { name: /other side of this transfer/iu })).toBeNull();
  });
});
