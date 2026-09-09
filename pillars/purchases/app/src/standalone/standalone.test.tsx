import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@pops/ui';

import { client as purchasesApiClient } from '../purchases-api/client.gen';
import { routes } from '../routes';
import { ORDER_ID } from './fixtures/order';
import { handlers } from './mock/handlers';
import { installPurchasesApiMock } from './mock/install';

/**
 * The standalone harness, booted the way `main.tsx` boots it.
 *
 * What this asserts is the claim the ticket makes and nothing weaker: with no
 * backend and no shell, each page renders its own content. "Renders" is the
 * trap — a page showing its loading spinner, its empty state or its retry
 * button has rendered, and all three are what a broken mock produces. So each
 * case waits for something only the fixture can have put on screen.
 *
 * Two things differ from what a person sees, both forced by the runner and
 * neither a behaviour difference: a memory router rather than the browser one
 * `main.tsx` builds, and an absolute base URL on the generated client. The
 * second is jsdom's doing — the client issues `new Request(url)` with the
 * relative `/purchases-api/…` a browser resolves against the document, and
 * undici's `Request` refuses a URL with no origin. The mock matches on the
 * path either way, so the requests it answers are the same ones.
 *
 * The route table, the components, the client, the mock layer and the
 * providers are all the real ones.
 */

/** An origin for jsdom's benefit; only the path is ever matched against. */
const TEST_ORIGIN = 'http://standalone.invalid';

function renderStandaloneAt(path: string) {
  purchasesApiClient.setConfig({
    ...purchasesApiClient.getConfig(),
    baseUrl: `${TEST_ORIGIN}/purchases-api`,
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: '/purchases',
        element: (
          <Suspense fallback={<div>Loading…</div>}>
            <Outlet />
          </Suspense>
        ),
        children: routes,
      },
    ],
    { initialEntries: [path] }
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

describe('purchases standalone, on mocks alone', () => {
  let uninstall: (() => void) | undefined;

  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
    vi.restoreAllMocks();
  });

  function withMocks(): void {
    uninstall = installPurchasesApiMock({ handlers });
  }

  it('renders the reconcile queue from fixture charges', async () => {
    withMocks();
    renderStandaloneAt('/purchases');

    expect(await screen.findByText('Hardware Barn', undefined, { timeout: 3000 })).toBeVisible();
    expect(await screen.findByText(/Grocer & Co/)).toBeVisible();
  });

  it('renders merchant spend from fixture roll-ups', async () => {
    withMocks();
    renderStandaloneAt('/purchases/merchants');

    expect(await screen.findByText('Hardware Barn', undefined, { timeout: 3000 })).toBeVisible();
    expect(await screen.findByText('Parts Direct')).toBeVisible();
  });

  it('renders the product dictionary from fixture wordings', async () => {
    withMocks();
    renderStandaloneAt('/purchases/products');

    // By role, not by text: a product's name is also an `<option>` in the
    // "point this wording at another product" select on every alias row, so a
    // text query matches it several times over and fails for being ambiguous
    // rather than for being absent.
    expect(
      await screen.findByRole('heading', { name: 'Cordless hammer drill, 18V' }, { timeout: 3000 })
    ).toBeVisible();
    // A wording only the fixture supplies, and only the dictionary renders.
    expect(await screen.findByText(/matches on milk full cream 2 litre/i)).toBeVisible();
  });

  it('renders the receipt drop zone, which needs no read at all', async () => {
    withMocks();
    renderStandaloneAt('/purchases/receipts');

    expect(
      await screen.findByRole('heading', { name: /add a receipt/i }, { timeout: 3000 })
    ).toBeVisible();
    expect(await screen.findByText(/drop a receipt here/i)).toBeVisible();
  });

  it('renders one order whole', async () => {
    withMocks();
    renderStandaloneAt(`/purchases/${ORDER_ID}`);

    expect(
      await screen.findByText('Cordless hammer drill, 18V', undefined, { timeout: 3000 })
    ).toBeVisible();
    expect(await screen.findByText(/Southbound Freight/)).toBeVisible();
  });

  // The mock honours the id, so the page's own "no such order" answer is
  // reachable. A mock returning the one fixture for every id would render a
  // page that looks right for an order that does not exist.
  it('renders the not-found answer for an order the fixtures do not hold', async () => {
    withMocks();
    renderStandaloneAt('/purchases/pur_does_not_exist');

    expect(await screen.findByText(/no such order/i, undefined, { timeout: 3000 })).toBeVisible();
  });

  /**
   * The degradation case the ticket asks for, in the only form this pillar
   * can produce it.
   *
   * Purchases makes no cross-pillar HTTP calls — every request its UI issues
   * goes to its own contract, and the references it holds to finance,
   * inventory and documents are rendered as `pops://` URIs it deliberately
   * does not resolve. So there is no sibling to knock over. What there IS is
   * an operation the harness fails to answer, which is the same shape of
   * failure from the page's point of view: a request that comes back
   * unusable. It must reach the page's error path, not throw past it.
   */
  it('renders the page error path when an operation has no mock', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const unhandled = vi.fn();
    const withoutQueue: Record<string, (typeof handlers)[string]> = { ...handlers };
    delete withoutQueue['GET /reconcile/queue'];
    uninstall = installPurchasesApiMock({ handlers: withoutQueue, onUnhandled: unhandled });

    renderStandaloneAt('/purchases');

    await waitFor(() => expect(unhandled).toHaveBeenCalledWith('GET', '/reconcile/queue'), {
      timeout: 5000,
    });
    // The page is still there and says something went wrong; it did not throw
    // out to a blank frame.
    expect(await screen.findByRole('button', { name: /retry/i })).toBeVisible();
  });
});
