import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';

const transactionsGetMock = vi.hoisted(() => vi.fn());

/**
 * Mocked at the generated-SDK boundary and no lower, so `unwrap` and the
 * fetch-on-open gating both run for real. A test that stubbed the hook would
 * only prove the popover renders what it was handed, never that it asked the
 * pillar for the counterpart at all.
 */
vi.mock('../../../finance-api/index.js', () => ({
  transactionsGet: (...args: unknown[]) => transactionsGetMock(...args),
}));

import { TransferLinkIndicator } from './TransferLinkIndicator';

import type { AccountOption } from '@pops/ui';

const ACCOUNTS: AccountOption[] = [
  { id: 'account-savings', name: 'Everyday Savings', kind: 'savings' },
  { id: 'account-checking', name: 'Everyday Checking', kind: 'checking' },
];

function counterpart(overrides: Partial<Record<string, unknown>> = {}) {
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
        ...overrides,
      },
    },
    error: undefined,
  };
}

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function renderIndicator() {
  return render(
    <Wrapper>
      <TransferLinkIndicator relatedTransactionId="tx-2" accounts={ACCOUNTS} />
    </Wrapper>
  );
}

beforeEach(() => transactionsGetMock.mockReset());
afterEach(cleanup);

describe('TransferLinkIndicator', () => {
  it('asks the pillar nothing until the popover is opened', () => {
    transactionsGetMock.mockResolvedValue(counterpart());
    renderIndicator();

    expect(transactionsGetMock).not.toHaveBeenCalled();
  });

  it('shows the counterpart account and amount once opened, which the icon alone never did', async () => {
    transactionsGetMock.mockResolvedValue(counterpart());
    renderIndicator();

    await userEvent.click(screen.getByRole('button', { name: /other side of this transfer/iu }));

    await waitFor(() => expect(transactionsGetMock).toHaveBeenCalledWith({ path: { id: 'tx-2' } }));
    expect(await screen.findByText('Everyday Savings')).toBeInTheDocument();
    expect(await screen.findByText('+$250.00')).toBeInTheDocument();
    expect(screen.getByText('Transfer from Everyday Checking')).toBeInTheDocument();
  });

  it('reports a failed lookup rather than showing nothing', async () => {
    transactionsGetMock.mockResolvedValue({
      data: undefined,
      error: { message: 'not found' },
      response: { status: 404 } as Response,
    });
    renderIndicator();

    await userEvent.click(screen.getByRole('button', { name: /other side of this transfer/iu }));

    expect(
      await screen.findByText('Could not load the other side of this transfer')
    ).toBeInTheDocument();
  });
});
