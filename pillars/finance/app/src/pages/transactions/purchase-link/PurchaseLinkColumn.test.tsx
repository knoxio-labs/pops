import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react';
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
import { fingerprint, usePurchaseLinkSummaries } from './usePurchaseLinkSummaries';

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

function withClient(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** Returns the client, so a test can read what the query was actually keyed on. */
function renderTable(transactions: Transaction[] = TRANSACTIONS): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<Harness transactions={transactions} />, { wrapper: withClient(client) });
  return client;
}

/**
 * The real en-AU copy throughout, so every assertion here is about a word a
 * reader sees and a screen reader announces. Asserting the state through a
 * data attribute instead would leave the label table free to be wrong: swap
 * two entries in it and every row reads as the opposite claim while the suite
 * stays green.
 */
const OPEN_LABEL = 'Show what this transaction bought';
const CONFIRMED = 'Confirmed';
const AUTO_LINKED = 'Auto-linked';
const PART_CONFIRMED = 'Part confirmed';
const AUTO_LINKED_HINT =
  'Matched automatically and confirmed by nobody — a later sweep may withdraw it.';

/**
 * The indicator on one row, or null where the row has none.
 *
 * Found by the action in its accessible name rather than by the whole name, so
 * this helper does not have to know which state the row is in — the state is
 * what each test then asserts.
 */
function indicatorFor(description: string): HTMLElement | null {
  const cell = screen.getByText(description).closest('tr');
  if (cell === null) throw new Error(`no row for ${description}`);
  return within(cell).queryByRole('button', {
    name: (accessibleName) => accessibleName.includes(OPEN_LABEL),
  });
}

/** The whole announced name for a row in one state: the state, then the action. */
function announced(state: string): RegExp {
  return new RegExp(`^${state}\\s*${OPEN_LABEL}$`);
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

  it('says in words which rows a human decided and which the matcher guessed', async () => {
    reconcileLinksBatchMock.mockResolvedValue({ data: { transactions: SUMMARIES } });
    renderTable();

    await waitFor(() => expect(indicatorFor('AMAZON MKTPLACE AU')).not.toBeNull());

    // The distinction `confirmedAt` exists for: one is a decision somebody
    // made, the other is what the matcher currently believes.
    expect(indicatorFor('AMAZON MKTPLACE AU')).toHaveTextContent(CONFIRMED);
    expect(indicatorFor('WOOLWORTHS 1234')).toHaveTextContent(AUTO_LINKED);
    expect(indicatorFor('WOOLWORTHS 1234')).not.toHaveTextContent(CONFIRMED);
  });

  it('announces the state to a screen reader, not only the action', async () => {
    reconcileLinksBatchMock.mockResolvedValue({ data: { transactions: SUMMARIES } });
    renderTable();

    await waitFor(() => expect(indicatorFor('AMAZON MKTPLACE AU')).not.toBeNull());

    // A name that were only the action would be identical on every row, which
    // is the confirmed-as-derived collapse this column exists to avoid.
    expect(indicatorFor('AMAZON MKTPLACE AU')).toHaveAccessibleName(announced(CONFIRMED));
    expect(indicatorFor('WOOLWORTHS 1234')).toHaveAccessibleName(announced(AUTO_LINKED));
  });

  it("explains a derived link in the panel's own wording", async () => {
    reconcileLinksBatchMock.mockResolvedValue({ data: { transactions: SUMMARIES } });
    renderTable();

    await waitFor(() => expect(indicatorFor('WOOLWORTHS 1234')).not.toBeNull());

    // The hint is the panel's key, not this column's. Renaming it there leaves
    // i18next echoing the raw key, which this assertion catches.
    expect(indicatorFor('WOOLWORTHS 1234')).toHaveAttribute('title', AUTO_LINKED_HINT);
  });

  it('says the number of orders on a combined settlement', async () => {
    reconcileLinksBatchMock.mockResolvedValue({ data: { transactions: SUMMARIES } });
    renderTable();

    await waitFor(() => expect(indicatorFor('ALIEXPRESS')).not.toBeNull());

    expect(indicatorFor('ALIEXPRESS')).toHaveTextContent('2 orders');
    // The rows settling one order each say nothing about a count, so the
    // reader is not asked to read "1 order" on nearly every row.
    expect(indicatorFor('AMAZON MKTPLACE AU')).not.toHaveTextContent('orders');
  });

  it('reports a part-confirmed transaction as neither', async () => {
    reconcileLinksBatchMock.mockResolvedValue({
      data: { transactions: [summary('tx-confirmed', { confirmed: 1, derived: 1 })] },
    });
    renderTable();

    await waitFor(() => expect(indicatorFor('AMAZON MKTPLACE AU')).not.toBeNull());
    expect(indicatorFor('AMAZON MKTPLACE AU')).toHaveTextContent(PART_CONFIRMED);
    expect(indicatorFor('AMAZON MKTPLACE AU')).toHaveAccessibleName(announced(PART_CONFIRMED));
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

  it('draws no indicators when the pillar refuses, rather than failing the page', async () => {
    // A column is decoration on a page that is fully useful without it. The
    // reader who wants to know why opens the row, where the panel names the
    // failure and offers the retry. The column itself stays, and today a
    // refusal and "no order explains any of these" render alike.
    reconcileLinksBatchMock.mockResolvedValue({ error: {}, response: { status: 503 } });
    renderTable();

    await waitFor(() => expect(reconcileLinksBatchMock).toHaveBeenCalled());
    expect(screen.getByText('ATM WITHDRAWAL')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Purchase' })).toBeInTheDocument();
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

describe('what the query is keyed on', () => {
  const ids = (count: number): string[] =>
    Array.from({ length: count }, (_, index) => `1f0a5c9e-0000-4000-8000-${index}`);

  it('separates any two sets of transactions', () => {
    expect(fingerprint(['a', 'b'])).not.toEqual(fingerprint(['b', 'a']));
    expect(fingerprint(['ab', 'c'])).not.toEqual(fingerprint(['a', 'bc']));
    expect(fingerprint(['a'])).not.toEqual(fingerprint(['a', 'a']));
    expect(fingerprint([])).not.toEqual(fingerprint(['']));
  });

  it('answers the same for the same set, so a refetch is not a new question', () => {
    // The list re-fetches whenever a tag is edited. The rows come back as new
    // objects holding the same ids, and re-asking purchases about an unchanged
    // set on every edit is what keying on the set rather than the fetch avoids.
    expect(fingerprint(ids(50))).toEqual(fingerprint(ids(50)));
  });

  it('stays the same size however much history the page is holding', () => {
    // React Query re-derives a key's hash on every render, and this page
    // re-renders on every keystroke in its search box. A key carrying the ids
    // themselves would stringify all of them, per keystroke.
    expect(fingerprint(ids(100_000)).length).toBeLessThan(40);
  });

  it('is what the query is actually keyed on', async () => {
    reconcileLinksBatchMock.mockResolvedValue({ data: { transactions: [] } });
    const many = Array.from({ length: 600 }, (_, index) =>
      transaction(`tx-${index}`, `ROW ${index}`)
    );

    const client = renderTable(many);

    await waitFor(() => expect(reconcileLinksBatchMock).toHaveBeenCalled());
    const [query] = client.getQueryCache().getAll();
    expect(query?.queryHash.length).toBeLessThan(100);
  });

  it('hands the same map back on a re-render nothing changed', async () => {
    reconcileLinksBatchMock.mockResolvedValue({ data: { transactions: SUMMARIES } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(() => usePurchaseLinkSummaries(TRANSACTIONS), {
      wrapper: withClient(client),
    });

    await waitFor(() => expect(result.current.size).toBe(SUMMARIES.length));
    const first = result.current;
    rerender();

    // Rebuilding it would walk every summary on every keystroke, on a page
    // that re-renders per keystroke.
    expect(result.current).toBe(first);
  });
});
