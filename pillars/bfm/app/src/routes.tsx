/**
 * bfm app route definitions and navigation config.
 *
 * Routes are lazy-loaded for code splitting. The shell imports these via
 * `@pops/app-bfm` and mounts them under `/bfm/*`.
 *
 * The rail entry reads "Devices" rather than "BFM": `bfm` is the pillar id
 * and stays the id everywhere in code, but the operator-facing surface is a
 * device list, and the acronym means nothing outside this repo. Same split
 * the `ai` pillar already carries (id `ai`, name "AI Ops").
 */
import { lazy } from 'react';

import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';

import type { BfmPageSlot } from '@pops/bfm/manifest';

const DevicesPage = lazy(() =>
  import('./pages/DevicesPage').then((m) => ({ default: m.DevicesPage }))
);

export { navConfig } from './nav';

/**
 * The component behind each page, keyed by the bundle slot the pillar's
 * manifest advertises for it.
 *
 * Keyed by slot rather than by path because that is the key the shell's
 * runtime loader asks for, and `satisfies` pins the key set in both
 * directions: a page added to `BFM_PAGES` with nothing to render fails to
 * compile here, and a component bound to a slot the contract does not declare
 * fails the same way. `bundles` is this map under the name the wire uses.
 */
export const PAGE_COMPONENTS = {
  'bfm-devices': DevicesPage,
} satisfies Record<BfmPageSlot, ComponentType>;

export const routes: RouteObject[] = [{ index: true, element: <DevicesPage /> }];
