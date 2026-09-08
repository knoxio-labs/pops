/**
 * purchases app route definitions and navigation config.
 *
 * Routes are lazy-loaded for code splitting. The shell imports these via
 * `@pops/app-purchases` and mounts them under `/purchases/*`.
 *
 * The pillar serves more than these surfaces render, but a nav item or a page
 * descriptor without a route behind it is the dead link this pillar's manifest
 * spent its whole life avoiding — each further view arrives with its route.
 *
 * There are two ways into these components. The shell's static bundle map
 * mounts `routes` directly; the runtime loader resolves a
 * `PageDescriptor.bundleSlot` against the `bundles` record in `./bundles`.
 * Both read `PAGE_COMPONENTS` below, so the two mount paths cannot disagree
 * about which component a page is.
 */
import { lazy } from 'react';

import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';

import type { PurchasesPageSlot } from '@pops/purchases/manifest';

const ReconcileQueuePage = lazy(() =>
  import('./pages/ReconcileQueuePage').then((m) => ({ default: m.ReconcileQueuePage }))
);

const MerchantLensPage = lazy(() =>
  import('./pages/MerchantLensPage').then((m) => ({ default: m.MerchantLensPage }))
);

const ReceiptDropZonePage = lazy(() =>
  import('./pages/ReceiptDropZonePage').then((m) => ({ default: m.ReceiptDropZonePage }))
);

const PurchaseDetailPage = lazy(() =>
  import('./pages/PurchaseDetailPage').then((m) => ({ default: m.PurchaseDetailPage }))
);

const ProductDictionaryPage = lazy(() =>
  import('./pages/ProductDictionaryPage').then((m) => ({ default: m.ProductDictionaryPage }))
);

export { navConfig } from './nav';

/**
 * The component behind each rail-reachable page, keyed by the bundle slot the
 * pillar's manifest advertises for it.
 *
 * Keyed by slot rather than by path because that is the key the shell's
 * runtime loader asks for, and `satisfies` then pins the key set in both
 * directions: a page added to `PURCHASES_PAGES` with nothing to render fails
 * to compile here, and a component bound to a slot the contract does not
 * declare fails the same way. `routes` and `bundles` are both derived from
 * this, so neither has to assert an exhaustiveness the compiler already has.
 */
export const PAGE_COMPONENTS = {
  'purchases-reconcile': ReconcileQueuePage,
  'purchases-merchants': MerchantLensPage,
  'purchases-receipts': ReceiptDropZonePage,
  'purchases-products': ProductDictionaryPage,
  'purchases-order': PurchaseDetailPage,
} satisfies Record<PurchasesPageSlot, ComponentType>;

/**
 * Spelled out rather than mapped over `PURCHASES_PAGES`, and the repetition is
 * the price of a route table that can be read without being executed:
 * `scripts/check-title-icon-consistency.mjs` resolves a nav item to its page
 * by parsing this array's `element` tags, and a derived table resolves nothing
 * — the gate would go on passing while checking no purchases page at all.
 * `__tests__/bundles.test.ts` holds the two in step instead, path for path and
 * component for component.
 *
 * The order detail route carries no nav item, and that is the difference
 * between the two lists: the rail names places a reader can go from nothing,
 * and an order is reached from something that already holds its id — a queue
 * row, an upload, a search hit. It sits last because react-router ranks a
 * static segment above a dynamic one regardless, and reading it in the order
 * it is matched is one less thing to hold in mind.
 */
export const routes: RouteObject[] = [
  { index: true, element: <ReconcileQueuePage /> },
  { path: 'merchants', element: <MerchantLensPage /> },
  { path: 'receipts', element: <ReceiptDropZonePage /> },
  { path: 'products', element: <ProductDictionaryPage /> },
  { path: ':purchaseId', element: <PurchaseDetailPage /> },
];
