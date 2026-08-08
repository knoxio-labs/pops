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

import type { RouteObject } from 'react-router';

import type { IconName } from '@pops/navigation';

const DevicesPage = lazy(() =>
  import('./pages/DevicesPage').then((m) => ({ default: m.DevicesPage }))
);

/** Local type mirror for compile-time safety (shell owns the canonical types). */
interface AppNavConfigShape {
  id: string;
  label: string;
  labelKey: string;
  icon: IconName;
  color?: 'emerald' | 'indigo' | 'amber' | 'rose' | 'sky' | 'violet';
  basePath: string;
  items: { path: string; label: string; labelKey: string; icon: IconName }[];
}

export const navConfig = {
  id: 'bfm',
  label: 'Devices',
  labelKey: 'bfm',
  icon: 'Smartphone',
  color: 'indigo',
  basePath: '/bfm',
  items: [{ path: '', label: 'Devices', labelKey: 'bfm.devices', icon: 'Smartphone' }],
} satisfies AppNavConfigShape;

export const routes: RouteObject[] = [{ index: true, element: <DevicesPage /> }];
