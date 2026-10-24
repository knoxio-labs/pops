import { routes } from './routes';

import type { ModuleManifest } from '@pops/types';

/** Runtime contacts module; navigation is advertised by the Rust pillar manifest. */
export const manifest: ModuleManifest<unknown, typeof routes> = {
  id: 'contacts',
  name: 'Contacts',
  version: '0.1.0',
  surfaces: ['app'],
  frontend: { routes },
};
