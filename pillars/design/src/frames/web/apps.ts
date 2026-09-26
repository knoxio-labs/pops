/**
 * The rail's contents: every in-repo pillar's nav, projected the way its app
 * projects it, in the order the shell ranks them (finance first, bfm last).
 *
 * Read from each pillar's contract package (`@pops/<pillar>/manifest`), where
 * the nav is declared once (POPS-3359) — the one cross-pillar import ADR-026
 * permits. A nav item added to a pillar shows up in the frame with no second
 * edit, and the playground never builds against a pillar's app.
 *
 * One exception: a pillar under active redesign draws its designed nav from
 * the design surface instead, so its screens are reviewed in the chrome they
 * will ship in. Inventory's designed nav lives with its design fixtures.
 */
import { INVENTORY_DESIGN_NAV, INVENTORY_SCREEN_PAGES } from '@/fixtures/inventory/nav';

import { AI_NAV } from '@pops/ai/manifest';
import { BFM_NAV } from '@pops/bfm/manifest';
import { CEREBRUM_NAV } from '@pops/cerebrum/manifest';
import { FINANCE_NAV } from '@pops/finance/manifest';
import { FOOD_NAV } from '@pops/food/manifest';
import { LISTS_NAV } from '@pops/lists/manifest';
import { MEDIA_NAV } from '@pops/media/manifest';
import { navConfigFromWire } from '@pops/navigation';
import { PURCHASES_NAV } from '@pops/purchases/manifest';

import type { AppNavConfig, WireNavConfig } from '@pops/navigation';

const WIRE_NAVS = [
  AI_NAV,
  BFM_NAV,
  CEREBRUM_NAV,
  FINANCE_NAV,
  FOOD_NAV,
  INVENTORY_DESIGN_NAV,
  LISTS_NAV,
  MEDIA_NAV,
  PURCHASES_NAV,
] as const;

/**
 * Wire navs in rail order: ascending `order`, ties broken on `id`, a nav with
 * no `order` last — the ranking the shell applies to `navOrder`, which it
 * reads from the same wire field.
 */
export function railOrder<T extends WireNavConfig>(navs: readonly T[]): T[] {
  return navs.toSorted((a, b) => {
    const byOrder = (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
    if (byOrder !== 0) return byOrder;
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
  });
}

/** Every in-repo pillar's rail entry and page nav, in rail order. */
export const WEB_APPS: readonly AppNavConfig[] = railOrder(WIRE_NAVS).map((wire) =>
  navConfigFromWire(wire)
);

/**
 * The app a screen belongs to. Screens are addressed `s/<area>/<slug>` and
 * the area is the pillar id, so the area names the app whose chrome the
 * screen would ship inside. An area with no app (a cross-cutting screen, a
 * typo) draws the rail with nothing selected rather than guessing.
 */
export function appForArea(area: string | undefined): AppNavConfig | undefined {
  return area === undefined ? undefined : WEB_APPS.find((app) => app.id === area);
}

/** The playground area for screens of the shell's own apps. */
export const SHELL_AREA = 'shell';

/**
 * Whether a screen is a design for the shell's Settings app: area `shell`,
 * slug `settings` or under it. The frame marks the rail's Settings button
 * for these and draws no page nav, as the shell does at `/settings`.
 */
export function isSettingsScreen(area: string | undefined, slug: string | undefined): boolean {
  return area === SHELL_AREA && slug !== undefined && /^settings(\/|$)/u.test(slug);
}

/**
 * Screens whose slug does not name the page they belong to, per app: a
 * segment of another page, a record under a list. Checked before the slug.
 */
const SCREEN_PAGES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  [INVENTORY_DESIGN_NAV.id]: INVENTORY_SCREEN_PAGES,
};

/**
 * Which page of the app a screen is a design for, matched on the screen's
 * slug: `finance/import` lands on the `/import` nav item, `finance/import-review`
 * on it too (a screen is often one stage of a page, not a page of its own),
 * and a screen in a folder lands on the page its folder names
 * (`inventory/items/item-detail` on `/items`).
 * A screen listed in the app's screen-page map lands on the page named there.
 * No match means no page is marked: better than marking the first and
 * quietly asserting something untrue about where the screen belongs.
 */
export function activeItemPath(
  app: AppNavConfig,
  slug: string | undefined,
  screenPages: Readonly<Record<string, string>> = SCREEN_PAGES[app.id] ?? {}
): string | undefined {
  if (slug === undefined) return undefined;
  const mapped = screenPages[slug];
  if (mapped !== undefined && app.items.some((item) => item.path === mapped)) return mapped;
  const target = `/${slug}`;
  const exact = app.items.find((item) => item.path === target);
  if (exact) return exact.path;
  const folder = app.items.find((item) => item.path !== '' && target.startsWith(`${item.path}/`));
  if (folder) return folder.path;
  const prefixed = app.items
    .filter((item) => item.path !== '' && target.startsWith(`${item.path}-`))
    .toSorted((a, b) => b.path.length - a.path.length)[0];
  return prefixed?.path;
}
