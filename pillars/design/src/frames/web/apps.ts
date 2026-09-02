/**
 * The rail's contents: every in-repo app's real `navConfig`, in the order the
 * shell ranks them (`navOrder` in the shell's bundle map — finance first,
 * bfm last).
 *
 * Read from each package's `./design` entry rather than copied, so a nav item
 * added to an app shows up in the frame with no second edit. The order is the
 * one thing this file states rather than derives: `navOrder` lives in the
 * shell's bundle map, which is shell-internal and off limits here (ISO-R2).
 * A parity test pins the two lists together instead.
 */
import { navConfig as ai } from '@pops/app-ai/design';
import { navConfig as bfm } from '@pops/app-bfm/design';
import { navConfig as cerebrum } from '@pops/app-cerebrum/design';
import { navConfig as finance } from '@pops/app-finance/design';
import { navConfig as food } from '@pops/app-food/design';
import { navConfig as inventory } from '@pops/app-inventory/design';
import { navConfig as lists } from '@pops/app-lists/design';
import { navConfig as media } from '@pops/app-media/design';
import { navConfig as purchases } from '@pops/app-purchases/design';

import type { AppNavConfig } from '@pops/navigation';

export const WEB_APPS: readonly AppNavConfig[] = [
  finance,
  purchases,
  media,
  inventory,
  food,
  lists,
  cerebrum,
  ai,
  bfm,
];

/**
 * The app a screen belongs to. Screens are addressed `s/<area>/<slug>` and
 * the area is the pillar id, so the area names the app whose chrome the
 * screen would ship inside. An area with no app (a cross-cutting screen, a
 * typo) draws the rail with nothing selected rather than guessing.
 */
export function appForArea(area: string | undefined): AppNavConfig | undefined {
  return area === undefined ? undefined : WEB_APPS.find((app) => app.id === area);
}

/**
 * Which page of the app a screen is a design for, matched on the screen's
 * slug: `finance/import` lands on the `/import` nav item, `finance/import-review`
 * on it too (a screen is often one stage of a page, not a page of its own).
 * No match means no page is marked — better than marking the first and
 * quietly asserting something untrue about where the screen belongs.
 */
export function activeItemPath(app: AppNavConfig, slug: string | undefined): string | undefined {
  if (slug === undefined) return undefined;
  const target = `/${slug}`;
  const exact = app.items.find((item) => item.path === target);
  if (exact) return exact.path;
  const prefixed = app.items
    .filter((item) => item.path !== '' && target.startsWith(`${item.path}-`))
    .toSorted((a, b) => b.path.length - a.path.length)[0];
  return prefixed?.path;
}
