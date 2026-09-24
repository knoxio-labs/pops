import { iconMap } from '@pops/navigation';

import type { NavConfigDescriptor } from '@pops/pillar-sdk';

import type { AppNavConfig, AppNavItem, IconName } from './types';

const FALLBACK_NAV_ICON: IconName = 'Compass';

/**
 * Resolve a wire-format icon id to a shell `IconName`.
 *
 * The wire spells icons in kebab-case — `KebabIdentifierSchema` rejects the
 * PascalCase `iconMap` is keyed by — so a bare `icon in iconMap` lookup could
 * not resolve anything a pillar is allowed to send, and every loader-mounted
 * pillar rendered the fallback on its rail entry and every page-nav item. The
 * kebab id is converted to the map's key form; a PascalCase id is still
 * accepted ahead of that, since an in-repo descriptor may carry one.
 *
 * An id that is neither degrades to a neutral fallback rather than failing
 * the nav build: a pillar naming an icon this shell build does not ship must
 * still mount.
 */
function resolveNavIcon(icon: string): IconName {
  if (icon in iconMap) return icon as IconName;
  const pascalCase = icon
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return pascalCase in iconMap ? (pascalCase as IconName) : FALLBACK_NAV_ICON;
}

function navItemFromDescriptor(item: NavConfigDescriptor['items'][number]): AppNavItem {
  return {
    path: item.path,
    label: item.label,
    labelKey: item.labelKey,
    icon: resolveNavIcon(item.icon),
  };
}

/**
 * Project a wire `NavConfigDescriptor` onto the runtime `AppNavConfig` the
 * app rail consumes. Icons resolve to `IconName` with a fallback; everything
 * else is a structural copy.
 */
export function navConfigFromDescriptor(nav: NavConfigDescriptor): AppNavConfig {
  return {
    id: nav.id,
    label: nav.label,
    labelKey: nav.labelKey,
    icon: resolveNavIcon(nav.icon),
    color: nav.color,
    basePath: nav.basePath,
    items: nav.items.map(navItemFromDescriptor),
  };
}
