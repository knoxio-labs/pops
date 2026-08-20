import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enAUPurchases from '@pops/locales/en-AU/purchases.json';

const merchantSpendMock = vi.hoisted(() => vi.fn());
const purchaseListMock = vi.hoisted(() => vi.fn());

vi.mock('../../purchases-api/index.js', () => ({
  analyticsMerchantSpend: (...args: unknown[]) => merchantSpendMock(...args),
  purchaseList: (...args: unknown[]) => purchaseListMock(...args),
}));

import { MerchantLensPage } from '../MerchantLensPage';

import type {
  CurrencySpend,
  MerchantOrder,
  MerchantSpend,
  SpendAccounting,
  SpendPeriod,
} from '../merchant-lens/types';

/**
 * Mocked at the generated-SDK boundary and no lower, so `unwrap`, the currency
 * fold and the split arithmetic all run for real. A test that stubbed the page
 * model would assert the page renders what it was handed, which is the one
 * thing that was never in doubt.
 */
function renderPage(): ReturnType<typeof userEvent.setup> {
  const user = userEvent.setup();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/purchases/merchants']}>
        <MerchantLensPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return user;
}

function accounting(overrides: Partial<SpendAccounting> = {}): SpendAccounting {
  return {
    totalCents: 1_041_200,
    matchedCents: 890_000,
    awaitingImportCents: 0,
    residualCents: 151_200,
    refundedCents: 0,
    netSpendCents: 1_041_200,
    ...overrides,
  };
}

function namedMerchant(name: string, overrides: Partial<SpendAccounting> = {}): MerchantSpend {
  return {
    merchant: { resolution: 'name', entityId: null, name },
    currency: 'AUD',
    orderCount: 12,
    accounting: accounting(overrides),
  };
}

function entityMerchant(entityId: string, name: string | null): MerchantSpend {
  return {
    merchant: { resolution: 'entity', entityId, name },
    currency: 'AUD',
    orderCount: 3,
    accounting: accounting(),
  };
}

function unattributedMerchant(): MerchantSpend {
  return {
    merchant: { resolution: 'unattributed', entityId: null, name: null },
    currency: 'AUD',
    orderCount: 1,
    accounting: accounting(),
  };
}

function currencyTotal(currency: string, overrides: Partial<SpendAccounting> = {}): CurrencySpend {
  return { currency, orderCount: 12, accounting: accounting(overrides) };
}

const ALL_TIME_PERIOD: SpendPeriod = { from: null, to: null };

function rollupReturns(
  merchants: MerchantSpend[],
  totals: CurrencySpend[] = [currencyTotal('AUD')],
  period: SpendPeriod = ALL_TIME_PERIOD
): void {
  merchantSpendMock.mockResolvedValue({ data: { period, merchants, totals } });
}

function purchaseOrder(overrides: Partial<MerchantOrder> = {}): MerchantOrder {
  return {
    id: 'purchase-1',
    checksum: 'amazon:249-1512883-0105415',
    createdAt: '2026-02-03T00:00:00Z',
    itemCount: 2,
    receiptUri: null,
    currency: 'AUD',
    discountCents: 0,
    ingestMethod: 'export',
    merchantEntityId: null,
    merchantEntityName: 'Amazon',
    orderedAt: '2026-02-02T01:41:21Z',
    // An export states an instant and no place, so there is no offset to
    // record. Null rather than 0, which would claim Greenwich.
    orderedAtOffsetMinutes: null,
    paymentHint: null,
    rawRef: null,
    settlementMode: 'card',
    shippingCents: 0,
    source: 'amazon',
    sourceOrderId: '249-1512883-0105415',
    status: 'linked',
    subtotalCents: 5678,
    surchargeCents: 0,
    taxCents: 0,
    totalCents: 5678,
    updatedAt: '2026-02-03T00:00:00Z',
    ...overrides,
  };
}

function ordersReturn(orders: MerchantOrder[]): void {
  purchaseListMock.mockResolvedValue({ data: { items: orders } });
}

async function openTheOrdersOf(
  user: ReturnType<typeof userEvent.setup>,
  merchant: string
): Promise<void> {
  await user.click(screen.getByRole('button', { name: `Show the orders behind ${merchant}` }));
}

/** `noUncheckedIndexedAccess` makes indexing optional; assert rather than cast. */
function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`expected an element at index ${index}`);
  return item;
}

/**
 * Queried by its accessible NAME, not by bare role. `@pops/ui`'s `Select`
 * renders its label as a sibling with no `htmlFor`, so a control that relies
 * on the `label` prop alone announces as an unnamed combobox — a bare
 * `getByRole('combobox')` would pass right through that.
 */
function periodPicker(): HTMLElement {
  return screen.getByRole('combobox', { name: enAUPurchases['merchants.period.label'] });
}

async function settled(): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByRole('status')).toBeNull();
  });
}

beforeEach(() => {
  merchantSpendMock.mockReset();
  purchaseListMock.mockReset();
  ordersReturn([]);
});

afterEach(() => {
  cleanup();
});

describe('MerchantLensPage — the unexplained bucket', () => {
  it('renders the ticket headline: total, explained with its share, unexplained', async () => {
    rollupReturns([namedMerchant('Amazon')]);
    renderPage();
    await settled();

    const row = nth(screen.getAllByRole('article'), 0);
    expect(within(row).getByText('Amazon')).toBeVisible();
    // The headline total and the net-spend figure are both $10,412.00 here,
    // because nothing was refunded.
    expect(within(row).getAllByText('$10,412.00')).toHaveLength(2);
    expect(within(row).getByText('$8,900.00 explained (85%)')).toBeVisible();
    expect(within(row).getByText('$1,512.00 unexplained')).toBeVisible();
  });

  // The acceptance criterion. A view that drops the residual converts a known
  // unknown into a false certainty, so every non-zero shape must reach screen.
  it.each([
    { label: 'a large residual', residualCents: 151_200, expected: '$1,512.00 unexplained' },
    { label: 'one cent', residualCents: 1, expected: '$0.01 unexplained' },
    { label: 'the entire total', residualCents: 1_041_200, expected: '$10,412.00 unexplained' },
    { label: 'an over-link', residualCents: -2500, expected: '-$25.00 unexplained' },
  ])('shows the residual when it is $label', async ({ residualCents, expected }) => {
    rollupReturns(
      [namedMerchant('Amazon', { residualCents })],
      [currencyTotal('AUD', { residualCents })]
    );
    renderPage();
    await settled();

    const row = nth(screen.getAllByRole('article'), 0);
    expect(within(row).getByText(expected)).toBeVisible();
  });

  it('still shows the split for a merchant whose spend is fully explained', async () => {
    const settledUp = {
      totalCents: 5000,
      matchedCents: 5000,
      residualCents: 0,
      netSpendCents: 5000,
    };
    rollupReturns([namedMerchant('Woolworths', settledUp)], [currencyTotal('AUD', settledUp)]);
    renderPage();
    await settled();

    const row = nth(screen.getAllByRole('article'), 0);
    expect(within(row).getByText('$50.00 explained (100%)')).toBeVisible();
    expect(within(row).getByText('$0.00 unexplained')).toBeVisible();
  });

  it('does not claim 100% explained while a cent is unexplained', async () => {
    const almost = { totalCents: 1_000_000, matchedCents: 999_999, residualCents: 1 };
    rollupReturns([namedMerchant('Amazon', almost)], [currencyTotal('AUD', almost)]);
    renderPage();
    await settled();

    const row = nth(screen.getAllByRole('article'), 0);
    expect(within(row).getByText('$9,999.99 explained (99%)')).toBeVisible();
    expect(within(row).getByText('$0.01 unexplained')).toBeVisible();
    expect(screen.queryByText(/explained \(100%\)/)).toBeNull();
    expect(within(row).getByRole('meter')).toHaveAttribute('aria-valuenow', '99');
  });

  it('offers no share at all when more has been linked than was spent', async () => {
    const over = { totalCents: 5000, matchedCents: 6000, residualCents: -1000 };
    rollupReturns([namedMerchant('Bunnings', over)], [currencyTotal('AUD', over)]);
    renderPage();
    await settled();

    const row = nth(screen.getAllByRole('article'), 0);
    expect(within(row).getByText('$60.00 explained')).toBeVisible();
    expect(within(row).getByText('-$10.00 unexplained')).toBeVisible();
    expect(within(row).queryByRole('meter')).toBeNull();
    expect(within(row).getByText(enAUPurchases['merchants.split.overLinked'])).toBeVisible();
  });
});

describe('MerchantLensPage — attribution', () => {
  it('distinguishes an entity group from a label group and from an unattributed one', async () => {
    rollupReturns([
      entityMerchant('ent-1', 'Woolworths'),
      namedMerchant('Amazon'),
      unattributedMerchant(),
    ]);
    renderPage();
    await settled();

    const rows = screen.getAllByRole('article');
    expect(
      within(nth(rows, 0)).getByText(enAUPurchases['merchants.attribution.entity'])
    ).toBeVisible();
    expect(
      within(nth(rows, 1)).getByText(enAUPurchases['merchants.attribution.name'])
    ).toBeVisible();
    expect(
      within(nth(rows, 2)).getByText(enAUPurchases['merchants.attribution.unattributed'])
    ).toBeVisible();
    expect(within(nth(rows, 2)).getByText(enAUPurchases['merchants.unattributed'])).toBeVisible();
  });

  it('says on screen that a label group is a label total, not an entity total', async () => {
    rollupReturns([namedMerchant('Amazon')]);
    renderPage();
    await settled();

    expect(screen.getByText(enAUPurchases['merchants.attribution.explain.name'])).toBeVisible();
    expect(screen.getByText(enAUPurchases['merchants.attribution.explain.entity'])).toBeVisible();
    expect(
      screen.getByText(enAUPurchases['merchants.attribution.explain.unattributed'])
    ).toBeVisible();
  });

  it('falls back to the entity id when an entity group carries no label', async () => {
    rollupReturns([entityMerchant('ent-77', null)]);
    renderPage();
    await settled();

    expect(screen.getByText('Unnamed merchant (ent-77)')).toBeVisible();
  });
});

describe('MerchantLensPage — currency', () => {
  it('renders one section per currency and no total across them', async () => {
    rollupReturns(
      [namedMerchant('Amazon'), { ...namedMerchant('Steam'), currency: 'USD' }],
      [currencyTotal('AUD'), currencyTotal('USD')]
    );
    renderPage();
    await settled();

    expect(screen.getByRole('heading', { name: 'AUD' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'USD' })).toBeVisible();
    expect(screen.getAllByRole('list', { name: /Merchants paid in/ })).toHaveLength(2);
  });

  // Dropping a merchant because the roll-up gave no total for its currency is
  // the same failure as dropping the residual: spend that exists stops showing.
  it('renders a merchant whose currency the totals never mentioned', async () => {
    rollupReturns([{ ...namedMerchant('Steam'), currency: 'NZD' }], [currencyTotal('AUD')]);
    renderPage();
    await settled();

    expect(screen.getByRole('heading', { name: 'NZD' })).toBeVisible();
    expect(screen.getByText('Steam')).toBeVisible();
    expect(screen.getByText(enAUPurchases['merchants.currency.noTotal'])).toBeVisible();
  });

  it('renders an unrecognised currency code instead of failing the page', async () => {
    rollupReturns([{ ...namedMerchant('Amazon'), currency: 'XYZZY' }], [currencyTotal('XYZZY')]);
    renderPage();
    await settled();

    const row = nth(screen.getAllByRole('article'), 0);
    expect(within(row).getByText('1512.00 XYZZY unexplained')).toBeVisible();
  });
});

describe('MerchantLensPage — period', () => {
  it('asks for every order by default and says so', async () => {
    rollupReturns([namedMerchant('Amazon')]);
    renderPage();
    await settled();

    expect(merchantSpendMock).toHaveBeenCalledWith({ query: {} });
    expect(screen.getByText(enAUPurchases['merchants.period.coveringAll'])).toBeVisible();
    expect(periodPicker()).toBeVisible();
  });

  // The year comes off the rendered option rather than from the clock. The
  // component captures its `now` at mount and this assertion runs later, so
  // recomputing the year here would disagree with the picker for the one
  // render that straddles a UTC New Year.
  it('puts a chosen year on the wire as an inclusive window', async () => {
    rollupReturns([namedMerchant('Amazon')]);
    const user = renderPage();
    await settled();

    const picker = periodPicker();
    const year = nth(within(picker).getAllByRole('option'), 1).textContent ?? '';
    expect(year).toMatch(/^\d{4}$/);

    await user.selectOptions(picker, year);

    await waitFor(() => {
      expect(merchantSpendMock).toHaveBeenCalledWith({
        query: {
          from: `${year}-01-01T00:00:00.000000000Z`,
          to: `${year}-12-31T23:59:59Z`,
        },
      });
    });
  });

  it('echoes the window the figures were actually computed over', async () => {
    rollupReturns([namedMerchant('Amazon')], [currencyTotal('AUD')], {
      from: '2026-06-15T12:00:00Z',
      to: '2026-06-20T12:00:00Z',
    });
    renderPage();
    await settled();

    expect(screen.getByText('Covering 15 June 2026 to 20 June 2026')).toBeVisible();
  });
});

/**
 * The reach the lens was missing. A merchant row is where a reader forms the
 * question the order detail page answers, so what matters here is that the
 * request carries the row's OWN identity — a label group asked for by label,
 * an entity group by id — and that the answer is a set of links to
 * `/purchases/:purchaseId`.
 */
describe('MerchantLensPage — opening a merchant row', () => {
  it('opens a label group by its label, and no other way', async () => {
    rollupReturns([namedMerchant('Amazon')]);
    ordersReturn([purchaseOrder()]);
    const user = renderPage();
    await settled();

    await openTheOrdersOf(user, 'Amazon');

    await waitFor(() => {
      expect(purchaseListMock).toHaveBeenCalledWith({
        query: {
          merchantEntityName: 'Amazon',
          currency: 'AUD',
          limit: 500,
        },
      });
    });
  });

  it('opens an entity group by its id, never by the label it is wearing', async () => {
    rollupReturns([entityMerchant('ent-1', 'Woolworths')]);
    ordersReturn([purchaseOrder({ merchantEntityId: 'ent-1', merchantEntityName: 'Woolworths' })]);
    const user = renderPage();
    await settled();

    await openTheOrdersOf(user, 'Woolworths');

    await waitFor(() => {
      expect(purchaseListMock).toHaveBeenCalledWith({
        query: { merchantEntityId: 'ent-1', currency: 'AUD', limit: 500 },
      });
    });
    const [[sent]] = purchaseListMock.mock.calls as [[{ query: Record<string, unknown> }]];
    expect(sent.query).not.toHaveProperty('merchantEntityName');
  });

  it('opens the unattributed bucket as a bucket, not as a merchant named nothing', async () => {
    rollupReturns([unattributedMerchant()]);
    ordersReturn([purchaseOrder({ merchantEntityName: null })]);
    const user = renderPage();
    await settled();

    await openTheOrdersOf(user, enAUPurchases['merchants.unattributed']);

    await waitFor(() => {
      expect(purchaseListMock).toHaveBeenCalledWith({
        query: { merchantUnattributed: true, currency: 'AUD', limit: 500 },
      });
    });
  });

  // The window the figures were computed over, not the one the picker is
  // showing: a list read over a different window than its headline is a
  // disagreement a reader cannot see.
  it('reads the orders over the window the roll-up reported', async () => {
    rollupReturns([namedMerchant('Amazon')], [currencyTotal('AUD')], {
      from: '2026-01-01T00:00:00.000000000Z',
      to: '2026-12-31T23:59:59Z',
    });
    ordersReturn([purchaseOrder()]);
    const user = renderPage();
    await settled();

    await openTheOrdersOf(user, 'Amazon');

    await waitFor(() => {
      expect(purchaseListMock).toHaveBeenCalledWith({
        query: {
          merchantEntityName: 'Amazon',
          currency: 'AUD',
          from: '2026-01-01T00:00:00.000000000Z',
          to: '2026-12-31T23:59:59Z',
          limit: 500,
        },
      });
    });
  });

  it('gives each order a link to its own detail page', async () => {
    rollupReturns([namedMerchant('Amazon')]);
    ordersReturn([
      purchaseOrder({ id: 'order-a', sourceOrderId: 'A-1', totalCents: 5678 }),
      purchaseOrder({ id: 'order-b', sourceOrderId: 'B-2', totalCents: 1200 }),
    ]);
    const user = renderPage();
    await settled();

    await openTheOrdersOf(user, 'Amazon');

    const list = await screen.findByRole('list', { name: 'Orders paid to Amazon' });
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/purchases/order-a',
      '/purchases/order-b',
    ]);
    expect(within(list).getByText('A-1')).toBeVisible();
    expect(within(list).getByText('$56.78')).toBeVisible();
  });

  it('does not ask for any orders until the row is opened', async () => {
    rollupReturns([namedMerchant('Amazon'), namedMerchant('Bunnings')]);
    renderPage();
    await settled();

    expect(purchaseListMock).not.toHaveBeenCalled();
  });

  it('blames the page cap for a short list only when the list is at the cap', async () => {
    rollupReturns([{ ...namedMerchant('Amazon'), orderCount: 748 }]);
    ordersReturn(
      Array.from({ length: 500 }, (_unused, index) => purchaseOrder({ id: `order-${index}` }))
    );
    const user = renderPage();
    await settled();

    await openTheOrdersOf(user, 'Amazon');

    expect(
      await screen.findByText(/Showing the first 500 of the 748 orders in this total/)
    ).toBeVisible();
  });

  // A shortfall nowhere near the cap has a cause this page never observed —
  // an order deleted between the roll-up read and this one produces it — so
  // it must be reported as a disagreement, not as the cap.
  it('does not blame the page cap for a shortfall nowhere near it', async () => {
    rollupReturns([{ ...namedMerchant('Amazon'), orderCount: 3 }]);
    ordersReturn([purchaseOrder({ id: 'order-a' })]);
    const user = renderPage();
    await settled();

    await openTheOrdersOf(user, 'Amazon');

    expect(
      await screen.findByText(/Showing 1 orders, and the roll-up counted 3.*two reads disagree/)
    ).toBeVisible();
    expect(screen.queryByText(/page limit, so the rest are past it/)).toBeNull();
  });

  // The direction the label filter's `IS NULL` exists to prevent: a list
  // holding more than the headline above it was computed from.
  it('names a list longer than the count the row carries', async () => {
    rollupReturns([{ ...namedMerchant('Amazon'), orderCount: 1 }]);
    ordersReturn([purchaseOrder({ id: 'order-a' }), purchaseOrder({ id: 'order-b' })]);
    const user = renderPage();
    await settled();

    await openTheOrdersOf(user, 'Amazon');

    expect(
      await screen.findByText(/holds more orders than the figures above were computed from/)
    ).toBeVisible();
  });

  it('points the disclosure control at a region only while that region exists', async () => {
    rollupReturns([namedMerchant('Amazon')]);
    ordersReturn([purchaseOrder()]);
    const user = renderPage();
    await settled();

    const closed = screen.getByRole('button', { name: 'Show the orders behind Amazon' });
    expect(closed).not.toHaveAttribute('aria-controls');

    await openTheOrdersOf(user, 'Amazon');

    const opened = await screen.findByRole('button', { name: 'Hide the orders behind Amazon' });
    const controlled = opened.getAttribute('aria-controls');
    expect(controlled).not.toBeNull();
    expect(document.getElementById(controlled ?? '')).not.toBeNull();
  });

  // The row exists because the roll-up counted orders here, so an empty
  // answer is two reads disagreeing rather than an ordinary empty state.
  it('calls an empty answer a disagreement rather than "nothing to show"', async () => {
    rollupReturns([{ ...namedMerchant('Amazon'), orderCount: 12 }]);
    ordersReturn([]);
    const user = renderPage();
    await settled();

    await openTheOrdersOf(user, 'Amazon');

    expect(await screen.findByText(/The two reads disagree/)).toBeVisible();
  });

  it('surfaces the server explanation and retries from the drill-down error', async () => {
    rollupReturns([namedMerchant('Amazon')]);
    purchaseListMock.mockResolvedValue({ error: { message: 'purchases is down' } });
    const user = renderPage();
    await settled();

    await openTheOrdersOf(user, 'Amazon');

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('purchases is down')).toBeVisible();

    ordersReturn([purchaseOrder({ id: 'order-a' })]);
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('link', { name: /A-1|249/ })).toHaveAttribute(
      'href',
      '/purchases/order-a'
    );
  });

  it('closes again, and says so on the control', async () => {
    rollupReturns([namedMerchant('Amazon')]);
    ordersReturn([purchaseOrder()]);
    const user = renderPage();
    await settled();

    await openTheOrdersOf(user, 'Amazon');
    const control = await screen.findByRole('button', {
      name: 'Hide the orders behind Amazon',
    });
    expect(control).toHaveAttribute('aria-expanded', 'true');

    await user.click(control);

    expect(screen.queryByRole('list', { name: 'Orders paid to Amazon' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Show the orders behind Amazon' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });
});

describe('MerchantLensPage — states', () => {
  it('says the period is empty rather than rendering nothing', async () => {
    rollupReturns([], []);
    renderPage();
    await settled();

    expect(screen.getByText(enAUPurchases['merchants.empty.title'])).toBeVisible();
  });

  it('surfaces the server explanation and retries from the error state', async () => {
    merchantSpendMock.mockResolvedValue({ error: { message: 'purchases is down' } });
    const user = renderPage();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('purchases is down')).toBeVisible();

    rollupReturns([namedMerchant('Amazon')]);
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(await screen.findAllByText('$1,512.00 unexplained')).not.toHaveLength(0);
  });

  it('names the drill-down layers that have no route behind them', async () => {
    rollupReturns([namedMerchant('Amazon')]);
    renderPage();
    await settled();

    expect(screen.getByText(enAUPurchases['merchants.absent.tags'])).toBeVisible();
    expect(screen.getByText(enAUPurchases['merchants.absent.items'])).toBeVisible();
    expect(screen.getByText(enAUPurchases['merchants.absent.inventory'])).toBeVisible();
  });

  // i18next echoes a key it cannot resolve, so a `t()` naming a key the
  // catalog has never heard of renders `merchants.something` on screen —
  // which asserting against the catalog's own values could never catch.
  it('never renders a raw catalog key', async () => {
    rollupReturns([
      namedMerchant('Amazon'),
      entityMerchant('ent-1', 'Woolworths'),
      unattributedMerchant(),
    ]);
    ordersReturn([purchaseOrder()]);
    const user = renderPage();
    await settled();

    // Opened, because the drill-down's whole catalog is unreachable while
    // every row is closed.
    await openTheOrdersOf(user, 'Amazon');
    await screen.findByRole('list', { name: 'Orders paid to Amazon' });

    expect(document.body.textContent).not.toMatch(/merchants\.[a-zA-Z]/);
  });
});
