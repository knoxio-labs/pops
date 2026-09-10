/**
 * The catch-all's three-way decision, which used to be a two-way one.
 *
 * `UnmatchedRoute` rendered `NotInstalledPage` for any first path segment
 * naming a known module with no mounted route. Before the FE-isolation epic
 * that was only ever true of a module the operator had excluded, because the
 * static bundle map mounted in-repo pillars whether or not the registry
 * answered. POPS-3227 empties that map, so "no mounted route" acquired a
 * second and much more common cause — the registry was unreachable at boot
 * and this device had no cached snapshot — and the reader was told their
 * deploy does not include finance while finance was running (POPS-3250).
 *
 * The cases are told apart by what the reader is shown, not by which
 * component was picked, because the whole defect was one component being
 * shown for two different situations.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { KNOWN_MODULES } from '@pops/module-registry';

import { BootRegistryProvider } from './BootRegistryProvider';
import { UnmatchedRoute } from './router';

import type { BootRegistry } from './boot-snapshot';

function bootRegistry(source: BootRegistry['source']): BootRegistry {
  return { manifests: [], registeredApps: [], remoteBundleUrls: [], bundleMap: {}, source };
}

function renderAt(pathname: string, source: BootRegistry['source']) {
  return render(
    <BootRegistryProvider value={bootRegistry(source)}>
      <MemoryRouter initialEntries={[pathname]}>
        <UnmatchedRoute />
      </MemoryRouter>
    </BootRegistryProvider>
  );
}

/** A module id this build could ship, taken from the same set the route reads. */
const KNOWN = KNOWN_MODULES[0] ?? 'finance';

describe('UnmatchedRoute', () => {
  it('has a known module to pose these cases with', () => {
    // Every case below turns on a first segment that names a known module. An
    // empty `KNOWN_MODULES` would send all three to the 404 and pass them for
    // the wrong reason.
    expect(KNOWN_MODULES.length).toBeGreaterThan(0);
  });

  it('says the registry is unreachable when nothing answered at boot', () => {
    renderAt(`/${KNOWN}/anything`, 'empty');

    expect(screen.getByRole('heading', { name: /reach the registry/iu })).toBeInTheDocument();
    expect(screen.queryByText(/module not installed/iu)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/iu })).toBeInTheDocument();
  });

  it('still says not installed when the registry answered and excluded it', () => {
    renderAt(`/${KNOWN}/anything`, 'registry');

    expect(screen.getByRole('heading', { name: /module not installed/iu })).toBeInTheDocument();
    expect(screen.queryByText(/reach the registry/iu)).not.toBeInTheDocument();
  });

  it('says not installed off a cached snapshot too — an answer is an answer', () => {
    renderAt(`/${KNOWN}/anything`, 'cached-snapshot');

    expect(screen.getByRole('heading', { name: /module not installed/iu })).toBeInTheDocument();
  });

  it('404s a path that names no module, whatever the boot source', () => {
    for (const source of ['empty', 'registry', 'cached-snapshot'] as const) {
      const { unmount } = renderAt('/not-a-module-at-all', source);
      expect(screen.queryByText(/module not installed/iu)).not.toBeInTheDocument();
      expect(screen.queryByText(/reach the registry/iu)).not.toBeInTheDocument();
      unmount();
    }
  });
});
