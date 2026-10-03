import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Transaction } from './types';

const transactionsGetMock = vi.hoisted(() => vi.fn());

vi.mock('../../finance-api/index.js', () => ({
  transactionsGet: (...args: unknown[]) => transactionsGetMock(...args),
}));

import { useDeepLinkedTransaction } from './useDeepLinkedTransaction';

const TRANSACTION: Transaction = {
  id: 'txn-1',
  date: '2026-09-24',
  amount: -24.5,
  description: 'Coffee',
  accountId: 'account-1',
  type: 'purchase',
  tags: ['Eating out'],
  entityId: null,
  entityName: null,
  location: null,
};

function HookHarness({ onOpen }: { onOpen: (transaction: Transaction) => void }) {
  useDeepLinkedTransaction(onOpen);
  return null;
}

function SearchProbe() {
  const location = useLocation();
  return <output data-testid="search">{location.search}</output>;
}

function makePage(url: string, onOpen: (transaction: Transaction) => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return () =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        MemoryRouter,
        { initialEntries: [url] },
        createElement(HookHarness, { onOpen }),
        createElement(SearchProbe)
      )
    );
}

function success(data: Transaction) {
  return { data: { data }, error: undefined };
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('useDeepLinkedTransaction', () => {
  it('opens a fetched transaction once and removes only its parameter', async () => {
    transactionsGetMock.mockResolvedValue(success(TRANSACTION));
    const onOpen = vi.fn();
    const makePageElement = makePage(
      '/finance/transactions?transaction=txn-1&account=account-1&view=compact',
      onOpen
    );
    const view = render(makePageElement());

    await waitFor(() => expect(onOpen).toHaveBeenCalledExactlyOnceWith(TRANSACTION));
    await waitFor(() =>
      expect(screen.getByTestId('search').textContent).toBe('?account=account-1&view=compact')
    );

    view.rerender(makePageElement());
    expect(onOpen).toHaveBeenCalledOnce();
    expect(transactionsGetMock).toHaveBeenCalledWith({ path: { id: 'txn-1' } });
  });

  it('clears an unknown transaction without opening it', async () => {
    transactionsGetMock.mockResolvedValue({
      data: undefined,
      error: { message: 'not found' },
      response: new Response(null, { status: 404 }),
    });
    const onOpen = vi.fn();
    render(makePage('/finance/transactions?transaction=missing&account=account-1', onOpen)());

    await waitFor(() =>
      expect(screen.getByTestId('search').textContent).toBe('?account=account-1')
    );
    expect(onOpen).not.toHaveBeenCalled();
    expect(transactionsGetMock).toHaveBeenCalledWith({ path: { id: 'missing' } });
  });

  it('does nothing when the transaction parameter is absent', () => {
    const onOpen = vi.fn();
    render(makePage('/finance/transactions?account=account-1', onOpen)());

    expect(transactionsGetMock).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByTestId('search').textContent).toBe('?account=account-1');
  });
});
