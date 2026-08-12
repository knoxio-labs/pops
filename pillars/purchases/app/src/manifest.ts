import { navConfig, routes } from './routes';

import type { ModuleManifest } from '@pops/types';

/**
 * @pops/app-purchases frontend manifest.
 *
 * **App surface of the `purchases` pillar.** Purchase documents and their
 * line items, reconciled N:M against finance transactions.
 *
 * Frontend-only: this package owns no database. Everything goes over the
 * purchases pillar's REST contract through the generated client in
 * `src/purchases-api/`, served at the shell's `/purchases-api` proxy path.
 */
export const manifest: ModuleManifest<unknown, typeof routes, typeof navConfig> = {
  id: 'purchases',
  name: 'Purchases',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Purchase documents and line items, reconciled N:M against finance transactions.',
  frontend: {
    routes,
    navConfig,
  },
};
