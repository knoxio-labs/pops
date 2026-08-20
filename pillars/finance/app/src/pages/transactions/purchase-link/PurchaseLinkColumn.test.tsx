import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTranslation } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';

const reconcileLinksBatchMock = vi.hoisted(() => vi.fn());

/**
 * Mocked at the generated-SDK boundary and no lower, so the URIs the pillar is
 * asked for, the chunking, `unwrap` and the id-to-summary keying all run for
 * real. A test that stubbed the hook would assert the column renders what it
 * was handed, which is the one thing that was never in doubt.
 */
vi.mock('../../../purchases-api/index.js', () => ({
  reconcileLinksBatch: (...args: unknown[]) => reconcileLinksBatchMock(...args),
}));

import { DataTable } from '@pops/ui';

import { buildColumns } from '../columns';
import { usePurchaseLinkSummaries } from './usePurchaseLinkSummaries';

import type { Transaction } from '../types';
import type { TransactionLinkSummary } from './types';

function transaction(id: string, description: string): Transaction {
  return {
    account: 'Up Everyday',
    amount: -41.28,
    date: '2026-03-06',
    description,
    entityId: null,
    entityName: null,
    id,
    location: null,
    tags: [],
    type: 'purchase',
  };
}

const TRANSACTIONS = [
  transaction('tx-plain', 'ATM WITHDRAWAL'),
  transaction('tx-confirmed', 'AMAZON MKTPLACE AU'),
  transaction('tx-derived', 'WOOLWORTHS 1234'),
  transaction('tx-combined', 'ALIEXPRESS'),
];

function summary(
  id: string,
  counts: { purchaseCount?: number; confirmed?: number; derived?: number }
): TransactionLinkSummary {
  return {
    transactionUri: `pops://finance/transaction/${id}`,
    purchaseCount: counts.purchaseCount ?? 1,
    confirmedChargeCount: counts.confirmed ?? 0,
    derivedChargeCount: counts.derived ?? 0,
  };
}

/** What the producer answers for the fixture above: three linked, one absent. */
const SUMMARIES = [
  summary('tx-confirmed', { confirmed: 1 }),
  summary('tx-derived', { derived: 1 }),
  summary('tx-combined', { purchaseCount: 2, derived: 2 }),
];

const onShowPurchase = vi.fn();

function Harness({ transactions }: { transactions: Transaction[] }) {
  const { t } = useTranslation('finance');
  const columns = buildColumns({
    t,
    availableTags: [],
    purchaseLinks: usePurchaseLinkSummaries(transactions),
    onTagSave: () => async () => undefined,
    onTagSuggest: () => async () => [],
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onUnlink: vi.fn(),
    onShowPurchase,
  });
  return <DataTable columns={columns} data={transactions} paginated={false} />;
}

function renderTable(transactions: Transaction[] = TRANSACTIONS): ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harness transactions={transactions} />
    </QueryClientProvider>
  );
  return null;
}

/** The real en-AU copy, so the test asserts on what a reader sees. */
const OPEN_LABEL = 'Show what this transaction bought';

/** The indicator on one row, or null where the row has none. */
function indicatorFor(description: string): HTMLElement | null {
  const cell = screen.getByText(description).closest('tr');
  if (cell === null) throw new Error(`no row for ${description}`);
  return within(cell).queryByRole('button', { name: OPEN_LABEL });
}

afterEach(() => {
  cleanup();
  reconcileLinksBatchMock.mockReset();
  onShowPurchase.mockReset();
});

describe('the purchase column', () => {
  it('draws nothing on a transaction no order explains', async () => {
    reconcileLinksBatchMock.mockResolvedValue({ data: { transactions: SUMMARIES } });
    renderTable();

    await waitFor(() => expect(indicatorFor('AMAZON MKTPLACE AU')).not.toBeNull());
    // Most of a statement is this case; a column of "no" would be a column of
    // noise, and the absence is the answer.
    expect(indicatorFor('ATM WITHDRAWAL')).toBeNull();
  });

  it('marks a confirmed link apart from a derived one', async () => {
    reconcileLinksBatchMock.mockResolvedValue({ data: { transactions: SUMMARIES } });
    renderTable();

    await waitFor(() => expect(indicatorFor('AMAZON MKTPLACE AU')).not.toBeNull());

    // The distinction `confirmedAt` exists for: one is a decision somebody
    // made, the other is what the matcher currently believes.
    expect(indicatorFor('AMAZON MKTPLACE AU')).toHaveAttribute('data-link-state', 'confirmed');
    expect(indicatorFor('WOOLWORTHS 1234')).toHaveAttribute('data-link-state', 'autoLinked');
  });

  it('says the number of orders on a combined settlement', async () => {
    reconcileLinksBatchMock.mockResolvedValue({ data: { transactions: SUMMARIES } });
    renderTable();

    await waitFor(() => expect(indicatorFor('ALIEXPRESS')).not.toBeNull());

    const combined = indicatorFor('ALIEXPRESS');
    expect(combined).toHaveAttribute('data-purchase-count', '2');
    expect(combined?.textContent).toContain('2 orders');
    // The rows settling one order each say nothing about a count, so the
    // reader is not asked to read "1 order" on nearly every row.
    expect(indicatorFor('AMAZON MKTPLACE AU')?.textContent).not.toContain('orders');
  });

  it('reports a part-confirmed transaction as neither', async () => {
    reconcileLinksBatchMock.mockResolvedValue({
      data: { transactions: [summary('tx-confirmed', { confirmed: 1, derived: 1 })] },
    });
    renderTable();

    await waitFor(() => expect(indicatorFor('AMAZON MKTPLACE AU')).not.toBeNull());
    expect(indicatorFor('AMAZON MKTPLACE AU')).toHaveAttribute(
      'data-link-state',
      'partlyConfirmed'
    );
  });

  it('opens the detail panel for the row it was clicked on', async () => {
    reconcileLinksBatchMock.mockResolvedValue({ data: { transactions: SUMMARIES } });
    renderTable();
    await waitFor(() => expect(indicatorFor('WOOLWORTHS 1234')).not.toBeNull());

    const indicator = indicatorFor('WOOLWORTHS 1234');
    if (indicator === null) throw new Error('expected an indicator');
    await userEvent.click(indicator);

    expect(onShowPurchase).toHaveBeenCalledWith(expect.objectContaining({ id: 'tx-derived' }));
  });

  it('draws no column at all when the pillar refuses, rather than failing the page', async () => {
    // A column is decoration on a page that is fully useful without it. The
    // reader who wants to know why opens the row, where the panel names the
    // failure and offers the retry.
    reconcileLinksBatchMock.mockResolvedValue({ error: {}, response: { status: 503 } });
    renderTable();

    await waitFor(() => expect(reconcileLinksBatchMock).toHaveBeenCalled());
    expect(screen.getByText('ATM WITHDRAWAL')).toBeInTheDocument();
    expect(indicatorFor('AMAZON MKTPLACE AU')).toBeNull();
  });
});

describe('the batched request', () => {
  it('asks for every loaded transaction as a finance URI, in one request', async () => {
    reconcileLinksBatchMock.mockResolvedValue({ data: { transactions: SUMMARIES } });
    renderTable();

    await waitFor(() => expect(reconcileLinksBatchMock).toHaveBeenCalledTimes(1));
    expect(reconcileLinksBatchMock).toHaveBeenCalledWith({
      body: {
        transactionUris: [
          'pops://finance/transaction/tx-plain',
          'pops://finance/transaction/tx-confirmed',
          'pops://finance/transaction/tx-derived',
          'pops://finance/transaction/tx-combined',
        ],
      },
    });
  });

  it('splits a list past the producer cap rather than sending one refused request', async () => {
    reconcileLinksBatchMock.mockResolvedValue({ data: { transactions: [] } });
    const many = Array.from({ length: 501 }, (_, index) =>
      transaction(`tx-${index}`, `ROW ${index}`)
    );

    renderTable(many);

    await waitFor(() => expect(reconcileLinksBatchMock).toHaveBeenCalledTimes(2));
    const sizes = reconcileLinksBatchMock.mock.calls.map((call) => {
      const [request] = call as [{ body: { transactionUris: string[] } }];
      return request.body.transactionUris.length;
    });
    expect(sizes).toEqual([500, 1]);
  });

  it('asks nothing at all while the transactions list is still empty', async () => {
    renderTable([]);

    await waitFor(() => expect(screen.queryByText('ATM WITHDRAWAL')).toBeNull());
    expect(reconcileLinksBatchMock).not.toHaveBeenCalled();
  });
});
