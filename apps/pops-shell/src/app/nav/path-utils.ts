/**
 * Shared path-matching utilities for navigation components.
 *
 * All nav components (AppRail, PageNav, Sidebar) must use these helpers
 * to avoid prefix-collision bugs (e.g. /fin matching /finance) and the
 * sibling-prefix double-highlight bug (e.g. /cerebrum/admin/prompts
 * matching both `/admin` and `/admin/prompts`).
 */
import type { AppNavConfig, AppNavItem } from './types.js';

/** Check if pathname matches a prefix at a path-segment boundary. */
export function matchesAtBoundary(pathname: string, prefix: string): boolean {
  if (!pathname.startsWith(prefix)) return false;
  return pathname.length === prefix.length || pathname[prefix.length] === '/';
}

/** Find the active app by matching the current pathname against registered base paths. */
export function findActiveApp(pathname: string, apps: AppNavConfig[]): AppNavConfig | undefined {
  return apps.find((app) => matchesAtBoundary(pathname, app.basePath));
}

/**
 * Pick the active item for an app given the current pathname.
 *
 * Returns the item whose `basePath + itemPath` matches the pathname at a
 * segment boundary and whose full path is the longest among matching
 * siblings. This is what keeps `/admin/prompts` from also highlighting
 * the `/admin` item.
 *
 * Empty `itemPath` is the app's index/default page; it only wins when
 * the pathname is exactly the basePath (or basePath + '/').
 */
/**
 * The "match length" of an item against the current pathname, or -1 if the
 * item doesn't match. Longer match wins, which keeps `/admin/prompts` from
 * also highlighting the parent `/admin` item.
 */
function itemMatchLength(pathname: string, basePath: string, itemPath: string): number {
  if (itemPath === '') {
    const indexMatches = pathname === basePath || pathname === `${basePath}/`;
    return indexMatches ? basePath.length : -1;
  }
  const fullPath = `${basePath}${itemPath}`;
  return matchesAtBoundary(pathname, fullPath) ? fullPath.length : -1;
}

export function findActiveItem(
  pathname: string,
  basePath: string,
  items: readonly AppNavItem[]
): AppNavItem | undefined {
  let best: AppNavItem | undefined;
  let bestLength = -1;
  for (const item of items) {
    const length = itemMatchLength(pathname, basePath, item.path);
    if (length > bestLength) {
      best = item;
      bestLength = length;
    }
  }
  return bestLength >= 0 ? best : undefined;
}
