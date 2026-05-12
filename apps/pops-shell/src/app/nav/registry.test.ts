/**
 * Registry-validation tests for the typed nav catalogue (PRD-006 US-01).
 *
 * The compile-time guarantees live in:
 * - `AppNavConfig.icon: IconName` and `AppNavItem.icon: IconName` (`./types`)
 * - `iconMap satisfies Record<IconName, LucideIcon>` (`./icon-map`)
 * - Each app's `navConfig satisfies AppNavConfigShape` (per-app `routes.tsx`)
 *
 * Together those mean an unknown icon name fails the type check before the
 * code reaches the bundler. These runtime tests close the remaining acceptance
 * criterion in `us-01-nav-types-registry.md`: every icon string in every
 * registered `navConfig` must resolve through `iconMap`, no app-id collisions,
 * no `basePath` collisions, and `basePath`s must be rooted. Drift in any of
 * those invariants fails CI rather than silently rendering a fallback letter
 * (see `AppRailIcon.tsx`).
 */
import { describe, expect, it } from 'vitest';

import { iconMap } from './icon-map';
import { registeredApps } from './registry';

describe('nav registry', () => {
  it('registers at least one app', () => {
    expect(registeredApps.length).toBeGreaterThan(0);
  });

  it.each(registeredApps.map((app) => [app.id, app] as const))(
    '%s app icon resolves through iconMap',
    (_, app) => {
      expect(iconMap[app.icon]).toBeDefined();
    }
  );

  it.each(
    registeredApps.flatMap((app) =>
      app.items.map((item) => [`${app.id}${item.path || '/'}`, item.icon] as const)
    )
  )('%s item icon resolves through iconMap', (_, icon) => {
    expect(iconMap[icon]).toBeDefined();
  });

  it('has unique app ids', () => {
    const ids = registeredApps.map((app) => app.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique basePaths', () => {
    const basePaths = registeredApps.map((app) => app.basePath);
    expect(new Set(basePaths).size).toBe(basePaths.length);
  });

  it.each(registeredApps.map((app) => [app.id, app.basePath] as const))(
    '%s basePath is rooted (starts with "/")',
    (_, basePath) => {
      expect(basePath.startsWith('/')).toBe(true);
    }
  );

  it.each(registeredApps.map((app) => [app.id, app] as const))(
    '%s items use rooted paths or the empty string',
    (_, app) => {
      for (const item of app.items) {
        expect(item.path === '' || item.path.startsWith('/')).toBe(true);
      }
    }
  );

  it.each(registeredApps.map((app) => [app.id, app] as const))(
    '%s items have unique paths',
    (_, app) => {
      const paths = app.items.map((item) => item.path);
      expect(new Set(paths).size).toBe(paths.length);
    }
  );
});
