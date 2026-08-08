import { navConfig, routes } from './routes';

import type { ModuleManifest } from '@pops/types';

/**
 * @pops/app-bfm frontend manifest.
 *
 * **App surface of the `bfm` pillar.** The operator surface for device
 * pairing lives in the shell rather than the phone, because the shell is
 * already behind Cloudflare Access — that is what makes "only the operator
 * can mint a pairing code" true.
 *
 * Frontend-only: this package owns no database. Everything goes over the bfm
 * pillar's REST contract through the generated client in `src/bfm-api/`,
 * served at the shell's `/bfm-api` proxy path.
 */
export const manifest: ModuleManifest<unknown, typeof routes, typeof navConfig> = {
  id: 'bfm',
  name: 'Devices',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Pair, list and revoke the native mobile clients the bfm pillar serves.',
  frontend: {
    routes,
    navConfig,
  },
};
