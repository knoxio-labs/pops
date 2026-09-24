import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FINANCE_PAGES } from '@pops/finance/manifest';
import PROMPTS from '@pops/finance/prompt-catalog';
import { TooltipProvider } from '@pops/ui';

import { client as contactsApiClient } from '../contacts-api/client.gen';
import { client as financeApiClient } from '../finance-api/client.gen';
import { client as purchasesApiClient } from '../purchases-api/client.gen';
import { routes } from '../routes';
import { EVERYDAY_ACCOUNT_ID, REWARDS_CARD_ID } from './fixtures/accounts';
import { GROCER_ENTITY_ID } from './fixtures/entities';
import { installFinanceMocks } from './mock/install';

/**
 * The standalone harness, booted the way `main.tsx` boots it, over every page
 * on finance's wire `pages` list.
 *
 * "Renders" is the trap — a page showing its spinner, its empty state or its
 * retry button has rendered, and all three are what a broken mock produces. So
 * each page waits for something only a fixture can have put on screen, and the
 * run fails on any `console.error` along the way.
 *
 * Two things differ from what a person sees, both forced by the runner: a
 * memory router rather than the browser one, and absolute base URLs on the
 * generated clients (undici's `Request` refuses the relative `/finance-api/…`
 * a browser resolves against the document). The mocks match on the path
 * either way. Routes, components, clients, mocks and providers are the real
 * ones.
 */

const TEST_ORIGIN = 'http://standalone.invalid';

function pointClientsAtTestOrigin(): void {
  for (const [client, prefix] of [
    [financeApiClient, '/finance-api'],
    [contactsApiClient, '/contacts-api'],
    [purchasesApiClient, '/purchases-api'],
  ] as const) {
    client.setConfig({ ...client.getConfig(), baseUrl: `${TEST_ORIGIN}${prefix}` });
  }
}

function renderStandaloneAt(path: string) {
  pointClientsAtTestOrigin();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: '/finance',
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
  render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  );
  return queryClient;
}

/** Wait for every query the page started to finish, so a late failure still counts. */
async function settled(queryClient: QueryClient): Promise<void> {
  await waitFor(() => expect(queryClient.isFetching()).toBe(0), { timeout: 3000 });
}

/** The fixture id each parameterised page is opened with. */
const PARAMS: Record<string, string> = {
  'entities/:id': GROCER_ENTITY_ID,
  'accounts/:id': REWARDS_CARD_ID,
  'accounts/:id/checkpoints': REWARDS_CARD_ID,
  'accounts/:id/imports': EVERYDAY_ACCOUNT_ID,
};

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Text only the fixtures (or, for the prompt catalogue, the bundled catalogue) supply. */
const EXPECTED: Record<string, RegExp> = {
  '': /PAYROLL LANTERN STUDIOS/,
  transactions: /PAYROLL LANTERN STUDIOS/,
  entities: /Northside Fuel/,
  'entities/:id': /The corner shop on Wharf Street/,
  accounts: /Rewards card/,
  'accounts/:id': /Rewards card/,
  'accounts/:id/checkpoints': /August statement/,
  'accounts/:id/imports': /kestrel-2026-08\.csv/,
  budgets: /Transport/,
  wishlist: /Commuter bike/,
  import: /kestrel-2026-09\.csv/,
  rules: /\^PAYROLL/,
  'tag-rules': /FUEL/,
  prompts: new RegExp(escapeRegExp(PROMPTS[0]?.title ?? 'no prompt in the catalogue')),
  settings: /New Zealand dollar/,
};

function urlFor(pagePath: string): string {
  const id = PARAMS[pagePath];
  const concrete = id === undefined ? pagePath : pagePath.replace(':id', id);
  return concrete === '' ? '/finance' : `/finance/${concrete}`;
}

describe('finance standalone, on mocks alone', () => {
  let uninstall: (() => void) | undefined;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error');
  });

  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
    vi.restoreAllMocks();
  });

  it('smokes every page on the wire list', () => {
    expect(FINANCE_PAGES.map((page) => page.path).toSorted()).toEqual(
      Object.keys(EXPECTED).toSorted()
    );
  });

  it.each(FINANCE_PAGES.map((page) => page.path))(
    'renders /finance/%s from fixtures with no console errors',
    async (pagePath) => {
      uninstall = installFinanceMocks({ contacts: 'present' });
      const queryClient = renderStandaloneAt(urlFor(pagePath));

      const expected = EXPECTED[pagePath];
      if (expected === undefined) throw new Error(`no expectation for ${pagePath}`);
      const [first] = await screen.findAllByText(expected, undefined, { timeout: 3000 });
      expect(first).toBeVisible();
      await settled(queryClient);
      expect(consoleError).not.toHaveBeenCalled();
    }
  );
});

/**
 * `VITE_CONTACTS_API=absent`: every contacts operation answers the registry's
 * `pillar-unavailable` under a 503, and finance and purchases keep answering.
 *
 * What finance holds about an entity it still shows — the name it stored
 * with each transaction, the transactions themselves, the purchases linked to
 * them — and what only contacts holds (aliases, ABN, notes, the edit form) it
 * does not. Nothing throws and nothing goes blank.
 */
describe('finance standalone, with contacts absent', () => {
  let uninstall: (() => void) | undefined;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error');
    uninstall = installFinanceMocks({ contacts: 'absent' });
  });

  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
    vi.restoreAllMocks();
  });

  /** The entity page's contacts-only line is replaced by what finance stored. */
  const ABSENT_EXPECTED: Record<string, RegExp> = {
    ...EXPECTED,
    'entities/:id': /HARBOUR GROCER WHARF ST/,
  };

  it.each(FINANCE_PAGES.map((page) => page.path))(
    'renders /finance/%s from fixtures with no console errors',
    async (pagePath) => {
      const queryClient = renderStandaloneAt(urlFor(pagePath));

      const expected = ABSENT_EXPECTED[pagePath];
      if (expected === undefined) throw new Error(`no expectation for ${pagePath}`);
      const [first] = await screen.findAllByText(expected, undefined, { timeout: 3000 });
      expect(first).toBeVisible();
      await settled(queryClient);
      expect(consoleError).not.toHaveBeenCalled();
    }
  );

  it('labels transactions with the stored entity name and links no entity', async () => {
    const queryClient = renderStandaloneAt('/finance/transactions');

    expect(
      await screen.findAllByText('Harbour Grocer', undefined, { timeout: 3000 })
    ).not.toHaveLength(0);
    await settled(queryClient);
    expect(document.querySelector('a[href^="/finance/entities"]')).toBeNull();
  });

  it('shows an entity from what finance and purchases hold, not an error', async () => {
    const queryClient = renderStandaloneAt(`/finance/entities/${GROCER_ENTITY_ID}`);

    expect(
      await screen.findByRole('heading', { name: 'Harbour Grocer' }, { timeout: 3000 })
    ).toBeVisible();
    await settled(queryClient);
    expect(screen.getAllByText('HARBOUR GROCER WHARF ST')).not.toHaveLength(0);
    expect(screen.getByText('$84.35', { selector: 'td' })).toBeVisible();
    expect(screen.getByText(/contact details are unavailable/i)).toBeVisible();
    expect(screen.queryByText(/failed to load this entity/i)).toBeNull();
    expect(screen.queryByText('The corner shop on Wharf Street.')).toBeNull();
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
