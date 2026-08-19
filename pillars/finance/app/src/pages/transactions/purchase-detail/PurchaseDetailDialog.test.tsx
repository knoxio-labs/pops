import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';

const reconcileLinksMock = vi.hoisted(() => vi.fn());

/**
 * Mocked at the generated-SDK boundary and no lower, so the URI the pillar is
 * asked for, `unwrap`, the unavailability classification and every formatter
 * run for real. A test that stubbed the hook would assert the dialog renders
 * what it was handed.
 */
vi.mock('../../../purchases-api/index.js', () => ({
  reconcileLinks: (...args: unknown[]) => reconcileLinksMock(...args),
}));

import { PurchaseDetailDialog } from './PurchaseDetailDialog';

import type { Transaction } from '../types';
import type { LinkedCharge, LinkedPurchase } from './types';

const TRANSACTION: Transaction = {
  account: 'Up Everyday',
  amount: -41.28,
  date: '2026-03-06',
  description: 'AMAZON MKTPLACE AU',
  entityId: null,
  entityName: null,
  id: 'tx-1',
  location: null,
  tags: [],
  type: 'purchase',
};

function charge(overrides: {
  id?: string;
  amountCents?: number;
  linkCents?: number;
  currency?: string;
  confirmedAt?: string | null;
  linkType?: LinkedCharge['link']['linkType'];
}): LinkedCharge {
  const amountCents = overrides.amountCents ?? 4128;
  return {
    charge: {
      amountCents,
      chargedAt: '2026-03-05T00:00:00.000Z',
      createdAt: '2026-03-05T00:00:00.000Z',
      currency: overrides.currency ?? 'AUD',
      id: overrides.id ?? 'chg-1',
      orderAmountCents: amountCents,
      origin: 'merchant',
      paymentHint: null,
      position: 0,
      purchaseId: 'order-1',
      role: 'capture',
      shipmentId: null,
      sourceChargeRef: null,
      updatedAt: '2026-03-05T00:00:00.000Z',
    },
    link: {
      amountCents: overrides.linkCents ?? amountCents,
      chargeId: overrides.id ?? 'chg-1',
      confidence: 0.92,
      confirmedAt: overrides.confirmedAt === undefined ? null : overrides.confirmedAt,
      createdAt: '2026-03-06T00:00:00.000Z',
      id: `lnk-${overrides.id ?? 'chg-1'}`,
      linkType: overrides.linkType ?? 'exact',
      matchRuleId: null,
      transactionUri: 'pops://finance/transaction/tx-1',
    },
  };
}

function entry(id: string, charges: LinkedCharge[], totalCents = 4128): LinkedPurchase {
  return {
    charges,
    linkedCents: charges.reduce((sum, c) => sum + c.link.amountCents, 0),
    purchase: {
      checksum: `sha256-${id}`,
      createdAt: '2026-03-05T00:00:00.000Z',
      currency: 'AUD',
      discountCents: 0,
      id,
      ingestMethod: 'export',
      merchantEntityId: null,
      merchantEntityName: 'Amazon',
      orderedAt: '2026-03-04T00:00:00.000Z',
      paymentHint: null,
      rawRef: null,
      settlementMode: 'card',
      shippingCents: 0,
      source: 'amazon-dsar',
      sourceOrderId: `ORD-${id}`,
      status: 'linked',
      subtotalCents: totalCents,
      surchargeCents: 0,
      taxCents: 0,
      totalCents,
      updatedAt: '2026-03-05T00:00:00.000Z',
    },
  };
}

function answers(purchases: LinkedPurchase[]) {
  return {
    data: { purchases, transactionUri: 'pops://finance/transaction/tx-1' },
    error: undefined,
  };
}

/**
 * Deliberately not `retry: false`: react-query's default of three retries is
 * what the shell's client actually gives this hook, so overriding it here
 * would test a policy the app does not run.
 */
function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** The dialog renders in a portal, so the card is found on the document, not the container. */
function orderCard(purchaseId: string): HTMLElement {
  const card = document.querySelector<HTMLElement>(`[data-purchase-id="${purchaseId}"]`);
  if (card === null) throw new Error(`no order card rendered for ${purchaseId}`);
  return card;
}

function renderDialog(transaction: Transaction | null = TRANSACTION) {
  return render(
    <Wrapper>
      <PurchaseDetailDialog transaction={transaction} onClose={() => {}} />
    </Wrapper>
  );
}

beforeEach(() => {
  reconcileLinksMock.mockReset();
});

afterEach(cleanup);

describe('PurchaseDetailDialog', () => {
  it('asks the pillar for the transaction as a pops:// URI', async () => {
    reconcileLinksMock.mockResolvedValue(answers([]));
    renderDialog();

    await waitFor(() => expect(reconcileLinksMock).toHaveBeenCalled());
    expect(reconcileLinksMock).toHaveBeenCalledWith({
      query: { transactionUri: 'pops://finance/transaction/tx-1' },
    });
  });

  it('asks the pillar nothing while no transaction is being viewed', () => {
    reconcileLinksMock.mockResolvedValue(answers([]));
    renderDialog(null);

    expect(reconcileLinksMock).not.toHaveBeenCalled();
  });

  it('says a transaction no order explains is ordinary, not a failure', async () => {
    reconcileLinksMock.mockResolvedValue(answers([]));
    renderDialog();

    expect(await screen.findByText(/not a fault/u)).toBeInTheDocument();
    expect(screen.queryByTestId('settlement-summary')).not.toBeInTheDocument();
  });

  it('renders the order behind a transaction with its share and its own total', async () => {
    reconcileLinksMock.mockResolvedValue(answers([entry('order-1', [charge({})], 5495)]));
    renderDialog();

    await screen.findByText('Amazon');
    const order = orderCard('order-1');
    expect(within(order).getByTestId('purchase-share')).toHaveTextContent('$41.28');
    expect(within(order).getByText(/Order total \$54\.95/u)).toBeInTheDocument();
  });

  it('lists every order of a combined settlement rather than the first', async () => {
    reconcileLinksMock.mockResolvedValue(
      answers([
        entry('order-1', [charge({ id: 'chg-1', amountCents: 4128 })]),
        entry('order-2', [charge({ id: 'chg-2', amountCents: 1872 })]),
      ])
    );
    renderDialog();

    const orders = await screen.findByRole('list', { name: 'Orders linked to this transaction' });
    expect(orders.querySelectorAll(':scope > [data-purchase-id]')).toHaveLength(2);
    expect(screen.getByText('Combined settlement — 2 orders')).toBeInTheDocument();
  });

  it('shows the part of the transaction no order accounts for', async () => {
    reconcileLinksMock.mockResolvedValue(
      answers([entry('order-1', [charge({ amountCents: 3000 })])])
    );
    renderDialog();

    const summary = await screen.findByTestId('settlement-summary');
    expect(within(summary).getByText(/Orders account for \$30\.00 of/u)).toBeInTheDocument();
    expect(
      within(summary).getByText(/\$11\.28 of this transaction is not accounted for/u)
    ).toBeInTheDocument();
  });

  it('says so out loud when the orders explain the whole transaction', async () => {
    reconcileLinksMock.mockResolvedValue(answers([entry('order-1', [charge({})])]));
    renderDialog();

    const summary = await screen.findByTestId('settlement-summary');
    expect(
      within(summary).getByText('Every cent of this transaction is accounted for.')
    ).toBeInTheDocument();
  });

  it('says the orders claim more than the transaction is worth', async () => {
    reconcileLinksMock.mockResolvedValue(
      answers([entry('order-1', [charge({ amountCents: 5000 })])])
    );
    renderDialog();

    const summary = await screen.findByTestId('settlement-summary');
    expect(within(summary).getByText(/Orders claim \$8\.72 more/u)).toBeInTheDocument();
  });

  it('states no total when the orders settled in different currencies', async () => {
    reconcileLinksMock.mockResolvedValue(
      answers([
        entry('order-1', [charge({ id: 'chg-1', amountCents: 4128, currency: 'AUD' })]),
        entry('order-2', [charge({ id: 'chg-2', amountCents: 1872, currency: 'USD' })]),
      ])
    );
    renderDialog();

    const summary = await screen.findByTestId('settlement-summary');
    expect(within(summary).getByText(/more than one currency \(AUD, USD\)/u)).toBeInTheDocument();
    expect(within(summary).queryByText(/Orders account for/u)).not.toBeInTheDocument();
    expect(within(summary).queryByText(/not accounted for by any order/u)).not.toBeInTheDocument();
  });

  it('tells a confirmed link apart from one the matcher merely believes', async () => {
    reconcileLinksMock.mockResolvedValue(
      answers([
        entry('order-1', [
          charge({ id: 'chg-1', amountCents: 3000, confirmedAt: '2026-03-07T00:00:00.000Z' }),
          charge({ id: 'chg-2', amountCents: 1128, confirmedAt: null }),
        ]),
      ])
    );
    renderDialog();

    const confirmed = await screen.findByText('Confirmed');
    expect(confirmed).toBeInTheDocument();
    expect(screen.getByText('Auto-linked')).toBeInTheDocument();
    expect(screen.getByText(/a later sweep may withdraw it/u)).toBeInTheDocument();
  });

  it('marks the order card when any one of its links is unconfirmed', async () => {
    reconcileLinksMock.mockResolvedValue(
      answers([
        entry('order-1', [
          charge({ id: 'chg-1', amountCents: 3000, confirmedAt: '2026-03-07T00:00:00.000Z' }),
          charge({ id: 'chg-2', amountCents: 1128, confirmedAt: null }),
        ]),
      ])
    );
    renderDialog();

    await screen.findByText('Amazon');
    expect(orderCard('order-1')).toHaveAttribute('data-unconfirmed', 'true');
  });

  it('leaves the order card unmarked when every link was confirmed', async () => {
    reconcileLinksMock.mockResolvedValue(
      answers([
        entry('order-1', [charge({ id: 'chg-1', confirmedAt: '2026-03-07T00:00:00.000Z' })]),
      ])
    );
    renderDialog();

    await screen.findByText('Amazon');
    expect(orderCard('order-1')).toHaveAttribute('data-unconfirmed', 'false');
  });

  it('says a partially applied charge was only partly paid by this transaction', async () => {
    reconcileLinksMock.mockResolvedValue(
      answers([
        entry('order-1', [charge({ amountCents: 6000, linkCents: 4128, linkType: 'partial' })]),
      ])
    );
    renderDialog();

    expect(await screen.findByText(/Part of a \$60\.00 charge/u)).toBeInTheDocument();
  });

  it('blames the pillar, not the transaction, when purchases is unreachable', async () => {
    reconcileLinksMock.mockResolvedValue({
      data: undefined,
      error: { message: 'upstream unreachable' },
      response: { status: 503 } as Response,
    });
    renderDialog();

    expect(await screen.findByText(/purchases pillar could not be reached/u)).toBeInTheDocument();
    expect(screen.queryByText('Could not load purchase detail')).not.toBeInTheDocument();
    expect(screen.queryByText('upstream unreachable')).not.toBeInTheDocument();
  });

  it('reports a refused request as a failure rather than an outage', async () => {
    reconcileLinksMock.mockResolvedValue({
      data: undefined,
      error: { message: 'transactionUri is required' },
      response: { status: 400 } as Response,
    });
    renderDialog();

    expect(await screen.findByText('Could not load purchase detail')).toBeInTheDocument();
    expect(screen.getByText('transactionUri is required')).toBeInTheDocument();
    expect(screen.queryByText(/could not be reached/u)).not.toBeInTheDocument();
  });

  it('does not replay a refusal at the other pillar', async () => {
    reconcileLinksMock.mockResolvedValue({
      data: undefined,
      error: { message: 'transactionUri is required' },
      response: { status: 400 } as Response,
    });
    renderDialog();

    await screen.findByText('Could not load purchase detail');
    expect(reconcileLinksMock).toHaveBeenCalledTimes(1);
  });

  it('treats a proxy answering 200 with the SPA shell as the outage it is', async () => {
    reconcileLinksMock.mockResolvedValue({
      data: undefined,
      error: new SyntaxError('Unexpected token < in JSON at position 0'),
      response: { status: 200 } as Response,
    });
    renderDialog();

    expect(await screen.findByText(/purchases pillar could not be reached/u)).toBeInTheDocument();
    expect(screen.queryByText('Could not load purchase detail')).not.toBeInTheDocument();
  });

  it('keeps a transport failure’s own wording off the screen', async () => {
    reconcileLinksMock.mockResolvedValue({
      data: undefined,
      error: new TypeError('Failed to fetch'),
      response: undefined,
    });
    renderDialog();

    await screen.findByText(/purchases pillar could not be reached/u);
    expect(screen.queryByText(/Failed to fetch/u)).not.toBeInTheDocument();
  });
});
