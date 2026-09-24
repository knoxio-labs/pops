import { existsSync, rmSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { build, loadConfigFromFile } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installApiMock, type MockHandler } from '@pops/pillar-sdk/testing/api-mock';
import { TooltipProvider } from '@pops/ui';

import { client as purchasesApiClient } from '../purchases-api/client.gen';
import { routes } from '../routes';
import { ORDER_ID } from './fixtures/order';
import { handlers } from './mock/handlers';

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
    uninstall = installApiMock({ handlers, baseUrl: '/purchases-api' });
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
    const withoutQueue: Record<string, MockHandler> = { ...handlers };
    delete withoutQueue['GET /reconcile/queue'];
    uninstall = installApiMock({
      handlers: withoutQueue,
      baseUrl: '/purchases-api',
      onUnhandled: unhandled,
    });

    renderStandaloneAt('/purchases');

    await waitFor(() => expect(unhandled).toHaveBeenCalledWith('GET', '/reconcile/queue'), {
      timeout: 5000,
    });
    // The page is still there and says something went wrong; it did not throw
    // out to a blank frame.
    expect(await screen.findByRole('button', { name: /retry/i })).toBeVisible();
  });
});

/**
 * The standalone build must not wipe the remote bundle, and vice versa
 * (POPS-4632). Both `vite.remote.config.ts` and `vite.standalone.config.ts`
 * run with `emptyOutDir`, so each output must live under its own directory —
 * this fails against a standalone config left on the default `dist/`, which
 * the remote build's `dist/remote/` sits inside of.
 *
 * Both builds here write under a per-test temp directory rather than the
 * real `dist/`. Building for real, in-process, inside `NODE_ENV=test`
 * produces a development bundle (`react/jsx-dev-runtime`) — fine for
 * asserting this suite's own claim, but wrong to leave sitting in `dist/`,
 * where `remote-bundle.test.ts` builds and reads the same file for its own,
 * unrelated assertion. Two tests racing to write and read one shared path
 * is what made that suite flaky; giving every run its own directory removes
 * the shared path rather than trying to order around it.
 *
 * Redirecting `outDir` means the two `it`s below no longer exercise the
 * `dist/remote` / `dist/standalone` strings the config files actually
 * declare — a regression that reintroduced the original collision (e.g.
 * `vite.standalone.config.ts` going back to plain `dist`) would build fine
 * against two fresh temp directories and slip past them. The first `it`
 * below reads the two config files with no build at all and asserts on
 * those exact strings, so that specific regression is still caught; the two
 * that follow keep proving the behavioural claim — that one build's
 * `emptyOutDir` cannot take out the other's output — without the shared
 * path.
 */
describe('build and build:standalone coexist regardless of order (POPS-4632)', () => {
  const APP_ROOT = path.resolve(import.meta.dirname, '..', '..');

  let tmpRoot: string;
  let remoteOutDir: string;
  let standaloneOutDir: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'pops-purchases-build-order-'));
    remoteOutDir = path.join(tmpRoot, 'remote');
    standaloneOutDir = path.join(tmpRoot, 'standalone');
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  /** Whether `child` is `parent` itself or sits somewhere underneath it. */
  function isInside(child: string, parent: string): boolean {
    const relative = path.relative(parent, child);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }

  it('declares outDirs that cannot collide, per the real config files', async () => {
    const remoteConfig = await loadConfigFromFile(
      { command: 'build', mode: 'production' },
      path.join(APP_ROOT, 'vite.remote.config.ts'),
      APP_ROOT,
      'silent'
    );
    const standaloneConfig = await loadConfigFromFile(
      { command: 'build', mode: 'production' },
      path.join(APP_ROOT, 'vite.standalone.config.ts'),
      APP_ROOT,
      'silent'
    );

    const remoteDeclaredOutDir = remoteConfig?.config.build?.outDir;
    const standaloneDeclaredOutDir = standaloneConfig?.config.build?.outDir;

    expect(remoteDeclaredOutDir).toBe('dist/remote');
    expect(standaloneDeclaredOutDir).toBe('dist/standalone');

    const remoteResolved = path.resolve(APP_ROOT, remoteDeclaredOutDir ?? '');
    const standaloneResolved = path.resolve(APP_ROOT, standaloneDeclaredOutDir ?? '');

    // Neither declared outDir may sit inside the other: that nesting is what
    // let one build's `emptyOutDir` wipe the other's output (POPS-4632).
    expect(isInside(remoteResolved, standaloneResolved)).toBe(false);
    expect(isInside(standaloneResolved, remoteResolved)).toBe(false);
  });

  async function buildRemote(): Promise<void> {
    await build({
      configFile: path.join(APP_ROOT, 'vite.remote.config.ts'),
      root: APP_ROOT,
      mode: 'production',
      logLevel: 'silent',
      build: { outDir: remoteOutDir, emptyOutDir: true },
    });
  }

  async function buildStandalone(): Promise<void> {
    await build({
      configFile: path.join(APP_ROOT, 'vite.standalone.config.ts'),
      root: APP_ROOT,
      mode: 'production',
      logLevel: 'silent',
      build: { outDir: standaloneOutDir, emptyOutDir: true },
    });
  }

  it('keeps the remote bundle when the standalone build runs after it', async () => {
    await buildRemote();
    expect(existsSync(path.join(remoteOutDir, 'purchases.js'))).toBe(true);

    await buildStandalone();

    // The standalone build, targeting its own directory, must not have
    // touched the remote build's output — that's the bug (POPS-4632).
    expect(existsSync(path.join(remoteOutDir, 'purchases.js'))).toBe(true);
    expect(existsSync(path.join(standaloneOutDir, 'index.html'))).toBe(true);
  }, 60_000);

  it('keeps the standalone bundle when the remote build runs after it', async () => {
    await buildStandalone();
    expect(existsSync(path.join(standaloneOutDir, 'index.html'))).toBe(true);

    await buildRemote();

    // The remote build, targeting its own directory, must not have touched
    // the standalone build's output — that's the bug (POPS-4632).
    expect(existsSync(path.join(standaloneOutDir, 'index.html'))).toBe(true);
    expect(existsSync(path.join(remoteOutDir, 'purchases.js'))).toBe(true);
  }, 60_000);
});
