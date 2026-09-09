import { describe, expect, it } from 'vitest';

// CI guardrail against silent nav drift: missing icon mappings would otherwise
// render a fallback letter instead of failing the build.
import { iconMap } from '@pops/navigation';

import { registeredApps } from './registry';

describe('nav registry', () => {
  it('registers at least one app', () => {
    expect(registeredApps.length).toBeGreaterThan(0);
  });

  // Parity gate — the bundle-mapped pillars must render in this exact order;
  // drift here is an observable app-rail regression.
  //
  // `finance` and `purchases` are absent, and their absence is the point
  // rather than a regression: both reach the shell through its runtime loader
  // (POPS-3217, POPS-3219), so they arrive on the rail from the live registry
  // at their own `nav.order` — 10 and 15, ahead of media (20), where they have
  // always sat. `registeredApps` is built from the static bundle map alone, which is
  // also the registry-outage floor, so this list is what renders when the
  // registry cannot be reached. `src/app/registry-walk.test.ts` asserts the
  // wire position it takes when it can.
  it('renders the bundle-mapped pillars in their pinned order', () => {
    expect(registeredApps.map((app) => app.id)).toEqual(['media', 'cerebrum']);
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
