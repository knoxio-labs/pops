import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enAUPurchases from '@pops/locales/en-AU/purchases.json';

const purchaseGetMock = vi.hoisted(() => vi.fn());

/**
 * Mocked at the generated-SDK boundary and no lower, so `unwrap`, the 404
 * classification and every formatter run for real. A test that stubbed the
 * page model would assert the page renders what it was handed.
 */
vi.mock('../../purchases-api/index.js', () => ({
  purchaseGet: (...args: unknown[]) => purchaseGetMock(...args),
}));

import { navConfig, routes } from '../../routes';
import { PurchaseDetailPage } from '../PurchaseDetailPage';

import type { PurchaseDetail, PurchaseLine } from '../purchase-detail/types';

function line(overrides: Partial<PurchaseLine['item']> = {}): PurchaseLine {
  return {
    item: {
      allocatedAdjustmentCents: 0,
      allocatedShippingCents: 0,
      createdAt: '2026-08-12T09:30:00.000Z',
      gstApplicable: null,
      id: 'line-1',
      imageUrl: null,
      kind: null,
      lineTotalCents: 4995,
      merchantCategory: null,
      merchantCondition: null,
      name: 'Dosing funnel 58mm',
      position: 0,
      promotionalPrice: null,
      purchaseId: 'order-1',
      quantity: 1,
      refundedCents: 0,
      shipmentId: null,
      sku: { value: 'B07XYZ1234', scheme: 'asin' },
      unitPriceCents: 4995,
      url: null,
      ...overrides,
    },
    landedCostCents: 5495,
    notes: [],
    tags: [],
    units: [],
  };
}

function detail(overrides: Partial<PurchaseDetail> = {}): PurchaseDetail {
  return {
    accounting: {
      awaitingImportCents: 0,
      matchedCents: 4995,
      netSpendCents: 5495,
      refundedCents: 0,
      residualCents: 500,
      totalCents: 5495,
    },
    charges: [],
    documents: [],
    items: [line()],
    purchase: {
      checksum: 'sha256-abc',
      createdAt: '2026-08-12T10:00:00.000Z',
      currency: 'AUD',
      discountCents: 0,
      id: 'order-1',
      ingestMethod: 'export',
      merchantEntityId: null,
      merchantEntityName: 'Amazon',
      orderedAt: '2026-08-12T09:30:00.000Z',
      paymentHint: null,
      rawRef: null,
      settlementMode: 'card',
      shippingCents: 500,
      source: 'amazon',
      sourceOrderId: '249-1512883-0105415',
      status: 'awaiting_settlement',
      subtotalCents: 4995,
      surchargeCents: 0,
      taxCents: 0,
      totalCents: 5495,
      updatedAt: '2026-08-12T10:00:00.000Z',
    },
    shipments: [],
    tags: [],
    ...overrides,
  };
}

/**
 * The shipped route's own pattern, so the parameter this page reads is the one
 * the route table declares. A page mounted on a pattern written beside its test
 * passes happily while the real table names its parameter something else — and
 * the page would then render every order as missing.
 */
const detailRoutePattern = `${navConfig.basePath}/${
  routes.find((route) => route.path?.startsWith(':') === true)?.path ?? ''
}`;

function renderAt(path: string): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={detailRoutePattern} element={<PurchaseDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/**
 * The value rendered against one label, read the way the markup pairs them.
 * Several figures on this page share a value, so matching on text alone would
 * pass while the page printed the total under "net spend".
 */
function factValue(container: HTMLElement, label: string): string | null {
  const term = within(container).getByText(label);
  return term.parentElement?.querySelector('dd')?.textContent ?? null;
}

function answers(payload: PurchaseDetail): void {
  purchaseGetMock.mockResolvedValue({
    data: payload,
    error: undefined,
    response: { status: 200 },
  });
}

beforeEach(() => {
  purchaseGetMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('PurchaseDetailPage', () => {
  it('reads the order the route names', async () => {
    answers(detail());
    renderAt('/purchases/order-1');

    expect(await screen.findByText('Amazon')).toBeVisible();
    expect(purchaseGetMock).toHaveBeenCalledWith({ path: { id: 'order-1' } });
  });

  it('renders each figure against its own label, in the order’s currency', async () => {
    answers(detail());
    renderAt('/purchases/order-1');

    const accounting = await screen.findByTestId('purchase-accounting');
    expect(factValue(accounting, enAUPurchases['purchase.accounting.total'])).toBe('$54.95');
    expect(factValue(accounting, enAUPurchases['purchase.accounting.matched'])).toBe('$49.95');
    expect(factValue(accounting, enAUPurchases['purchase.accounting.residual'])).toBe('$5.00');
  });

  // The same rule the merchant lens holds one level up: the residual is on
  // screen even at zero, so its absence never means two things at once.
  it('shows the unexplained figure even when nothing is unexplained', async () => {
    answers(
      detail({
        accounting: {
          awaitingImportCents: 0,
          matchedCents: 5495,
          netSpendCents: 5495,
          refundedCents: 0,
          residualCents: 0,
          totalCents: 5495,
        },
      })
    );
    renderAt('/purchases/order-1');

    const accounting = await screen.findByTestId('purchase-accounting');
    expect(
      within(accounting).getByText(enAUPurchases['purchase.accounting.residual'])
    ).toBeVisible();
  });

  it('names a merchant label that resolved to no entity, rather than leaving it blank', async () => {
    answers(detail());
    renderAt('/purchases/order-1');

    expect(
      await screen.findByText(enAUPurchases['purchase.field.merchantUnresolved'])
    ).toBeVisible();
  });

  it('lists the lines with their tags and units', async () => {
    answers(
      detail({
        items: [
          {
            ...line(),
            tags: [
              { tag: 'coffee', confirmedAt: '2026-08-12T10:00:00.000Z' },
              { tag: 'kitchen', confirmedAt: null },
            ],
            units: [
              {
                createdAt: '2026-08-12T10:00:00.000Z',
                id: 'unit-1',
                inventoryItemStaleAt: null,
                inventoryItemUri: 'pops://inventory/item/inv-9',
                itemId: 'line-1',
                serialNumber: 'SN-42',
              },
            ],
          },
        ],
      })
    );
    renderAt('/purchases/order-1');

    const lines = await screen.findByRole('list', {
      name: enAUPurchases['purchase.items.ariaLabel'],
    });
    expect(within(lines).getByText('Dosing funnel 58mm')).toBeVisible();
    expect(within(lines).getByText('coffee')).toBeVisible();
    // An inferred tag and a confirmed one are different claims, and the view
    // must not present the first as the second.
    expect(within(lines).getByText('kitchen (unconfirmed)')).toBeVisible();
    expect(within(lines).getByText('SN-42')).toBeVisible();
    expect(within(lines).getByText('pops://inventory/item/inv-9')).toBeVisible();
  });

  it('tells a proposed link apart from a confirmed one', async () => {
    answers(
      detail({
        charges: [
          {
            allocations: [
              {
                amountCents: 4995,
                chargeId: 'charge-1',
                createdAt: '2026-08-12T10:00:00.000Z',
                id: 'alloc-1',
                itemId: 'line-1',
              },
            ],
            charge: {
              amountCents: 5495,
              chargedAt: '2026-08-13T00:00:00.000Z',
              createdAt: '2026-08-12T10:00:00.000Z',
              currency: 'AUD',
              id: 'charge-1',
              orderAmountCents: 5495,
              origin: 'merchant',
              paymentHint: 'visa-4242',
              position: 0,
              purchaseId: 'order-1',
              role: 'capture',
              shipmentId: null,
              sourceChargeRef: null,
              updatedAt: '2026-08-12T10:00:00.000Z',
            },
            links: [
              {
                amountCents: 5495,
                chargeId: 'charge-1',
                confidence: 0.92,
                confirmedAt: null,
                createdAt: '2026-08-12T10:00:00.000Z',
                id: 'link-1',
                linkType: 'exact',
                matchRuleId: null,
                transactionUri: 'pops://finance/transaction/tx-7',
              },
            ],
          },
        ],
      })
    );
    renderAt('/purchases/order-1');

    const charges = await screen.findByRole('list', {
      name: enAUPurchases['purchase.charges.ariaLabel'],
    });
    expect(within(charges).getByText('pops://finance/transaction/tx-7')).toBeVisible();
    const link = charges.querySelector('[data-link-type="exact"]');
    expect(link).toHaveAttribute('data-confirmed', 'false');
  });

  it('says which sections are empty rather than rendering nothing at all', async () => {
    answers(detail());
    renderAt('/purchases/order-1');

    expect(await screen.findByText(enAUPurchases['purchase.charges.empty'])).toBeVisible();
    expect(screen.getByText(enAUPurchases['purchase.shipments.empty'])).toBeVisible();
    expect(screen.getByText(enAUPurchases['purchase.documents.empty'])).toBeVisible();
    expect(screen.getByText(enAUPurchases['purchase.tags.empty'])).toBeVisible();
  });

  it('offers the way back to the queue', async () => {
    answers(detail());
    renderAt('/purchases/order-1');

    const back = await screen.findByRole('link', {
      name: enAUPurchases['purchase.backToQueue'],
    });
    expect(back).toHaveAttribute('href', '/purchases');
  });
});

describe('PurchaseDetailPage — the line a search hit asked for', () => {
  it('marks the line named in the query, and only that one', async () => {
    answers(detail({ items: [line(), line({ id: 'line-2', name: 'Coffee beans' })] }));
    renderAt('/purchases/order-1?item=line-2');

    const lines = await screen.findByRole('list', {
      name: enAUPurchases['purchase.items.ariaLabel'],
    });
    const marked = within(lines)
      .getAllByRole('listitem')
      .filter((item) => item.getAttribute('aria-current') === 'true');

    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveAttribute('data-item-id', 'line-2');
  });

  // A line can be gone while the order remains — the highlight is a courtesy,
  // not a precondition, so a stale one must not cost the reader the order.
  it('still renders the order when the named line is no longer on it', async () => {
    answers(detail());
    renderAt('/purchases/order-1?item=line-vanished');

    const lines = await screen.findByRole('list', {
      name: enAUPurchases['purchase.items.ariaLabel'],
    });
    expect(
      within(lines)
        .getAllByRole('listitem')
        .filter((item) => item.getAttribute('aria-current') === 'true')
    ).toHaveLength(0);
    expect(screen.getByText('Amazon')).toBeVisible();
  });
});

describe('PurchaseDetailPage — an order that is not there', () => {
  it('says the order is gone rather than reporting a failed request', async () => {
    purchaseGetMock.mockResolvedValue({
      data: undefined,
      error: { message: 'purchase not found' },
      response: { status: 404 },
    });
    renderAt('/purchases/order-that-never-was');

    expect(await screen.findByText(enAUPurchases['purchase.absent.title'])).toBeVisible();
    // A retry would ask the same question and get the same answer.
    expect(screen.queryByText(enAUPurchases['purchase.error.retry'])).toBeNull();
    expect(screen.getByRole('link', { name: enAUPurchases['purchase.backToQueue'] })).toBeVisible();
  });

  it('reports a real failure as one, with the server’s own words and a retry', async () => {
    purchaseGetMock.mockResolvedValue({
      data: undefined,
      error: { message: 'purchases API is down' },
      response: { status: 503 },
    });
    renderAt('/purchases/order-1');

    expect(await screen.findByRole('alert')).toHaveTextContent('purchases API is down');
    expect(screen.getByText(enAUPurchases['purchase.error.retry'])).toBeVisible();
    expect(screen.queryByText(enAUPurchases['purchase.absent.title'])).toBeNull();
  });
});
