import { navConfigFromWire } from '@pops/navigation';
/**
 * This app's navigation declaration: what the rail shows for it and which
 * pages its page nav lists.
 *
 * Projected from `@pops/purchases`'s contract rather than written out a second
 * time. The pillar used to declare its nav twice — here in PascalCase and
 * again as a `NavConfigDescriptor` on the wire in kebab — with a guard making
 * the two literals agree. `navConfigFromWire` makes the second declaration
 * unnecessary, and projects at the type level too, so
 * `satisfies AppNavConfigShape` still checks every icon against `IconName`
 * and a typo in the contract's kebab spelling now reddens this build as well
 * (POPS-3359).
 *
 * Its own module rather than part of `routes.tsx` so that reading the nav
 * does not pull the route table's lazy page imports in with it — the design
 * playground draws the POPS chrome from these configs and has no use for
 * every page of every app.
 */
import { PURCHASES_NAV } from '@pops/purchases/manifest';

import type { IconName } from '@pops/navigation';

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

export const navConfig = navConfigFromWire(PURCHASES_NAV) satisfies AppNavConfigShape;
