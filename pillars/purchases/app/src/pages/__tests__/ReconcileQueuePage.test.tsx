import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUPurchases from '@pops/locales/en-AU/purchases.json';

import { ReconcileQueuePage } from '../ReconcileQueuePage';

import type { ReactElement } from 'react';

import type { LinkType, ProposedLink, QueueEntry } from '../reconcile/types';

const reconcileQueueMock = vi.fn();
const reconcileConfirmMock = vi.fn();
const reconcileUnlinkMock = vi.fn();

vi.mock('../../purchases-api/index.js', () => ({
  reconcileQueue: (...args: unknown[]) => reconcileQueueMock(...args),
  reconcileConfirm: (...args: unknown[]) => reconcileConfirmMock(...args),
  reconcileUnlink: (...args: unknown[]) => reconcileUnlinkMock(...args),
}));

function buildLink(overrides: Partial<ProposedLink> = {}): ProposedLink {
  return {
    transactionUri: 'pops:finance/transaction/tx-1',
    amountCents: 4599,
    linkType: 'exact',
    confidence: 0.95,
    ...overrides,
  };
}

function buildEntry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    chargeId: 'charge-1',
    purchaseId: 'order-1',
    source: 'amazon',
    sourceOrderId: '249-0000001',
    merchantEntityName: 'Amazon',
    orderedAt: '2026-05-01T00:00:00.000Z',
    currency: 'AUD',
    amountCents: 4599,
    proposed: [buildLink()],
    deltaCents: 0,
    ...overrides,
  };
}

function entryAt(index: number, overrides: Partial<QueueEntry> = {}): QueueEntry {
  return buildEntry({
    chargeId: `charge-${index}`,
    purchaseId: `order-${index}`,
    proposed: [buildLink({ transactionUri: `pops:finance/transaction/tx-${index}` })],
    ...overrides,
  });
}

function queueReturns(...pages: QueueEntry[][]): void {
  for (const items of pages.slice(0, -1)) {
    reconcileQueueMock.mockResolvedValueOnce({ data: { items }, error: undefined });
  }
  reconcileQueueMock.mockResolvedValue({
    data: { items: pages.at(-1) ?? [] },
    error: undefined,
  });
}

function decisionsSucceed(): void {
  reconcileConfirmMock.mockResolvedValue({ data: { ok: true }, error: undefined });
  reconcileUnlinkMock.mockResolvedValue({ data: { ok: true }, error: undefined });
}

function renderQueue(): ReturnType<typeof render> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <ReconcileQueuePage />
    </QueryClientProvider>
  );
  return render(ui);
}

/** The row the keyboard is pointing at, read the way a screen reader would. */
function activeChargeId(): string | null {
  const active = screen
    .getAllByRole('option')
    .find((o) => o.getAttribute('aria-selected') === 'true');
  return active?.getAttribute('data-charge-id') ?? null;
}

function lastQueueQuery(): Record<string, unknown> | undefined {
  const call = reconcileQueueMock.mock.lastCall;
  if (!call) return undefined;
  const [args] = call as [{ query?: Record<string, unknown> }];
  return args?.query;
}

async function arriveOnQueue(): Promise<void> {
  await waitFor(() => expect(screen.getByRole('listbox')).toHaveFocus());
}

beforeEach(() => {
  reconcileQueueMock.mockReset();
  reconcileConfirmMock.mockReset();
  reconcileUnlinkMock.mockReset();
});

describe('ReconcileQueuePage — copy', () => {
  it('renders the heading and intro from the catalog', async () => {
    queueReturns([buildEntry()]);
    renderQueue();

    expect(
      await screen.findByRole('heading', { name: enAUPurchases['reconcile.title'] })
    ).toBeVisible();
    expect(screen.getByText(enAUPurchases['reconcile.intro'])).toBeVisible();
    expect(screen.getByText(enAUPurchases['reconcile.keys.hint'])).toBeVisible();
    expect(
      screen.getByRole('button', { name: enAUPurchases['reconcile.action.accept'] })
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: enAUPurchases['reconcile.action.reject'] })
    ).toBeVisible();
  });

  // The valuable half. i18next echoes a key it cannot resolve, so a `t()` call
  // naming a key that is not in the catalog renders `reconcile.something` on
  // screen. Matching the key SHAPE rather than the catalog's own values is
  // what makes this catch the case that matters — a key the page emits and the
  // catalog has never heard of would not appear in `Object.values` at all.
  it('never renders a raw catalog key', async () => {
    queueReturns([
      buildEntry(),
      entryAt(2, { proposed: [], deltaCents: -4599 }),
      entryAt(3, { merchantEntityName: null, sourceOrderId: null, deltaCents: 100 }),
    ]);
    renderQueue();
    await screen.findByRole('listbox');

    expect(document.body.textContent).not.toMatch(/reconcile\.[a-zA-Z]/);
  });

  it('has a label for every link type the contract allows', async () => {
    const linkTypes: LinkType[] = ['exact', 'split', 'combined', 'partial', 'rule', 'manual'];
    queueReturns(
      linkTypes.map((linkType, index) =>
        entryAt(index, { proposed: [buildLink({ linkType, transactionUri: `pops:x/y/${index}` })] })
      )
    );
    renderQueue();
    await screen.findByRole('listbox');

    for (const linkType of linkTypes) {
      const label = enAUPurchases[`reconcile.linkType.${linkType}` as const];
      expect(screen.getByText(new RegExp(`^${label} ·`))).toBeVisible();
    }
  });
});

describe('ReconcileQueuePage — keyboard', () => {
  it('lands focus on the queue so j works without a click', async () => {
    queueReturns([entryAt(1), entryAt(2)]);
    renderQueue();
    await arriveOnQueue();

    expect(activeChargeId()).toBe('charge-1');
  });

  it('moves the cursor with j and k', async () => {
    const user = userEvent.setup();
    queueReturns([entryAt(1), entryAt(2), entryAt(3)]);
    renderQueue();
    await arriveOnQueue();

    await user.keyboard('j');
    expect(activeChargeId()).toBe('charge-2');
    await user.keyboard('j');
    expect(activeChargeId()).toBe('charge-3');
    await user.keyboard('k');
    expect(activeChargeId()).toBe('charge-2');
  });

  it('clamps at both ends rather than wrapping', async () => {
    const user = userEvent.setup();
    queueReturns([entryAt(1), entryAt(2)]);
    renderQueue();
    await arriveOnQueue();

    await user.keyboard('k');
    expect(activeChargeId()).toBe('charge-1');
    await user.keyboard('jjj');
    expect(activeChargeId()).toBe('charge-2');
  });

  it('reflects the cursor in aria-activedescendant', async () => {
    const user = userEvent.setup();
    queueReturns([entryAt(1), entryAt(2)]);
    renderQueue();
    await arriveOnQueue();

    await user.keyboard('j');
    expect(screen.getByRole('listbox')).toHaveAttribute(
      'aria-activedescendant',
      'reconcile-entry-charge-2'
    );
  });

  it('leaves the cursor alone for a chord the shell owns', async () => {
    const user = userEvent.setup();
    queueReturns([entryAt(1), entryAt(2)]);
    renderQueue();
    await arriveOnQueue();

    await user.keyboard('{Control>}j{/Control}');
    expect(activeChargeId()).toBe('charge-1');
  });
});

describe('ReconcileQueuePage — decisions', () => {
  it('enter confirms every proposal on the charge, not just the first', async () => {
    const user = userEvent.setup();
    decisionsSucceed();
    // A split settlement: two links that together settle one charge. Pinning
    // one and leaving the other would confirm half a partition.
    queueReturns([
      entryAt(1, {
        amountCents: 10_000,
        proposed: [
          buildLink({ transactionUri: 'pops:finance/transaction/tx-a', amountCents: 6000 }),
          buildLink({
            transactionUri: 'pops:finance/transaction/tx-b',
            amountCents: 4000,
            linkType: 'split',
          }),
        ],
      }),
    ]);
    renderQueue();
    await arriveOnQueue();

    await user.keyboard('{Enter}');

    await waitFor(() => expect(reconcileConfirmMock).toHaveBeenCalledTimes(2));
    expect(reconcileConfirmMock).toHaveBeenCalledWith({
      body: { chargeId: 'charge-1', transactionUri: 'pops:finance/transaction/tx-a' },
    });
    expect(reconcileConfirmMock).toHaveBeenCalledWith({
      body: { chargeId: 'charge-1', transactionUri: 'pops:finance/transaction/tx-b' },
    });
    expect(reconcileUnlinkMock).not.toHaveBeenCalled();
  });

  it('x unlinks the charge instead of confirming it', async () => {
    const user = userEvent.setup();
    decisionsSucceed();
    queueReturns([entryAt(1)]);
    renderQueue();
    await arriveOnQueue();

    await user.keyboard('x');

    await waitFor(() =>
      expect(reconcileUnlinkMock).toHaveBeenCalledWith({
        body: { chargeId: 'charge-1', transactionUri: 'pops:finance/transaction/tx-1' },
      })
    );
    expect(reconcileConfirmMock).not.toHaveBeenCalled();
  });

  it('advances past a confirmed charge without skipping the one after it', async () => {
    const user = userEvent.setup();
    decisionsSucceed();
    // A confirmed link stops being a proposal, so the entry leaves the queue.
    queueReturns([entryAt(1), entryAt(2), entryAt(3)], [entryAt(2), entryAt(3)]);
    renderQueue();
    await arriveOnQueue();

    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
    expect(activeChargeId()).toBe('charge-2');
  });

  it('advances past a rejected charge even though it stays in the queue', async () => {
    const user = userEvent.setup();
    decisionsSucceed();
    // `unlink` deletes the link and remembers nothing, so the charge comes
    // back as unexplained rather than leaving. The cursor must still move on.
    queueReturns([entryAt(1), entryAt(2)], [entryAt(1, { proposed: [] }), entryAt(2)]);
    renderQueue();
    await arriveOnQueue();

    await user.keyboard('x');

    await waitFor(() => expect(reconcileUnlinkMock).toHaveBeenCalled());
    await waitFor(() => expect(activeChargeId()).toBe('charge-2'));
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('decides nothing on an unexplained charge', async () => {
    const user = userEvent.setup();
    decisionsSucceed();
    queueReturns([entryAt(1, { proposed: [], deltaCents: -4599 })]);
    renderQueue();
    await arriveOnQueue();

    await user.keyboard('{Enter}');
    await user.keyboard('x');

    expect(reconcileConfirmMock).not.toHaveBeenCalled();
    expect(reconcileUnlinkMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: enAUPurchases['reconcile.action.accept'] })
    ).toBeDisabled();
  });

  it('ignores a second enter while the first is still in flight', async () => {
    const user = userEvent.setup();
    reconcileConfirmMock.mockImplementation(() => new Promise(() => undefined));
    queueReturns([entryAt(1)]);
    renderQueue();
    await arriveOnQueue();

    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');

    expect(reconcileConfirmMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces the server explanation when a decision does not stick', async () => {
    const user = userEvent.setup();
    reconcileConfirmMock.mockResolvedValue({
      data: undefined,
      error: { message: 'No link between charge charge-1 and tx-1.', code: 'link_not_found' },
    });
    queueReturns([entryAt(1)]);
    renderQueue();
    await arriveOnQueue();

    await user.keyboard('{Enter}');

    expect(await screen.findByText(/No link between charge charge-1/)).toBeVisible();
  });

  it('says what accepting and rejecting actually persist', async () => {
    queueReturns([entryAt(1)]);
    renderQueue();
    await screen.findByRole('listbox');

    expect(screen.getByText(enAUPurchases['reconcile.action.caveat'])).toBeVisible();
  });
});

describe('ReconcileQueuePage — the money', () => {
  it('shows the delta state for balanced, short and over-linked charges', async () => {
    queueReturns([
      entryAt(1, { deltaCents: 0 }),
      entryAt(2, { deltaCents: -1500 }),
      entryAt(3, { deltaCents: 250 }),
    ]);
    const { container } = renderQueue();
    await screen.findByRole('listbox');

    const states = [...container.querySelectorAll('[data-delta-state]')].map((node) =>
      node.getAttribute('data-delta-state')
    );
    expect(states).toEqual(['balanced', 'short', 'over']);
  });

  it('marks a charge with no proposals as unexplained rather than short', async () => {
    // `deltaCents` is `Σ proposed − charge`, so an unexplained charge is short
    // by its whole amount. Reporting that as a shortfall would read as a
    // partial payment the engine found, which is the opposite of the truth.
    queueReturns([entryAt(1, { proposed: [], deltaCents: -4599 })]);
    const { container } = renderQueue();
    await screen.findByRole('listbox');

    expect(container.querySelector('[data-delta-state]')).toHaveAttribute(
      'data-delta-state',
      'unexplained'
    );
    expect(screen.getByText(enAUPurchases['reconcile.entry.noProposals'])).toBeVisible();
  });

  it('renders an unrecognised currency instead of failing the whole queue', async () => {
    queueReturns([entryAt(1, { currency: 'NOT-A-CODE', amountCents: 1234 })]);
    renderQueue();
    await screen.findByRole('listbox');

    expect(screen.getByText('12.34 NOT-A-CODE')).toBeVisible();
  });
});

describe('ReconcileQueuePage — filters and states', () => {
  it('puts the kind filter on the wire and omits it for "all"', async () => {
    const user = userEvent.setup();
    queueReturns([entryAt(1)]);
    renderQueue();
    await screen.findByRole('listbox');

    expect(lastQueueQuery()?.kind).toBeUndefined();

    await user.click(
      screen.getByRole('button', { name: enAUPurchases['reconcile.filter.kind.unexplained'] })
    );
    await waitFor(() => expect(lastQueueQuery()?.kind).toBe('unexplained'));
  });

  it('keeps auto-linked sources out until asked for them', async () => {
    const user = userEvent.setup();
    queueReturns([entryAt(1)]);
    renderQueue();
    await screen.findByRole('listbox');

    expect(lastQueueQuery()?.includeAuto).toBe(false);

    await user.click(
      screen.getByRole('checkbox', { name: enAUPurchases['reconcile.filter.includeAuto'] })
    );
    await waitFor(() => expect(lastQueueQuery()?.includeAuto).toBe(true));
  });

  it('says the queue is truncated when the page comes back full', async () => {
    queueReturns(Array.from({ length: 50 }, (_, index) => entryAt(index)));
    renderQueue();
    await screen.findByRole('listbox');

    expect(screen.getByText(/Showing the first 50 charges/)).toBeVisible();
  });

  it('does not claim truncation when the page is short', async () => {
    queueReturns([entryAt(1)]);
    renderQueue();
    await screen.findByRole('listbox');

    expect(screen.queryByText(/Showing the first/)).toBeNull();
  });

  it('renders the empty state when nothing is waiting', async () => {
    queueReturns([]);
    renderQueue();

    expect(await screen.findByText(enAUPurchases['reconcile.empty.title'])).toBeVisible();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('renders the error state and retries from it', async () => {
    const user = userEvent.setup();
    reconcileQueueMock.mockResolvedValue({ data: undefined, error: { message: 'boom' } });
    renderQueue();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('boom')).toBeVisible();

    const before = reconcileQueueMock.mock.calls.length;
    await user.click(
      within(alert).getByRole('button', { name: enAUPurchases['reconcile.error.retry'] })
    );
    await waitFor(() => expect(reconcileQueueMock.mock.calls.length).toBeGreaterThan(before));
  });
});
