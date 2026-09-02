/**
 * purchases app route definitions and navigation config.
 *
 * Routes are lazy-loaded for code splitting. The shell imports these via
 * `@pops/app-purchases` and mounts them under `/purchases/*`.
 *
 * The pillar serves more than these surfaces render, but a nav item or a page
 * descriptor without a route behind it is the dead link this pillar's manifest
 * spent its whole life avoiding — each further view arrives with its route.
 */
import { lazy } from 'react';

import type { RouteObject } from 'react-router';

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
