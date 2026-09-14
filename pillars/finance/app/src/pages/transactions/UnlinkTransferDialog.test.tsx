import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';

const transactionsGetMock = vi.hoisted(() => vi.fn());

vi.mock('../../finance-api/index.js', () => ({
  transactionsGet: (...args: unknown[]) => transactionsGetMock(...args),
}));

import { UnlinkTransferDialog } from './UnlinkTransferDialog';

import type { AccountOption } from '@pops/ui';

import type { Transaction } from './types';

const ACCOUNTS: AccountOption[] = [
  { id: 'account-savings', name: 'Everyday Savings', kind: 'savings' },
];

const UNLINKING_TX: Transaction = {
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

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function renderDialog(unlinkingTx: Transaction | null = UNLINKING_TX) {
  return render(
    <Wrapper>
      <UnlinkTransferDialog
        unlinkingTx={unlinkingTx}
        setUnlinkingTx={() => {}}
        isUnlinking={false}
        accounts={ACCOUNTS}
        onConfirm={() => {}}
      />
    </Wrapper>
  );
}

beforeEach(() => transactionsGetMock.mockReset());
afterEach(cleanup);

describe('UnlinkTransferDialog', () => {
  it('names the pair being broken before the confirm button is trusted', async () => {
    transactionsGetMock.mockResolvedValue(counterpart());
    renderDialog();

    expect(screen.getByText('Unlink this transfer?')).toBeInTheDocument();
    expect(await screen.findByText('Everyday Savings')).toBeInTheDocument();
    expect(await screen.findByText('+$250.00')).toBeInTheDocument();
    expect(screen.getByText('Transfer from Everyday Checking')).toBeInTheDocument();
  });

  it('renders nothing while there is no transfer to unlink', () => {
    renderDialog(null);

    expect(screen.queryByText('Unlink this transfer?')).not.toBeInTheDocument();
    expect(transactionsGetMock).not.toHaveBeenCalled();
  });
});
