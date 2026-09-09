import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { beforeAll, describe, expect, it } from 'vitest';

import { BFM_PAGES } from '@pops/bfm/manifest';

const run = promisify(execFile);

const APP_ROOT = path.resolve(import.meta.dirname, '../..');
const ENTRY = path.join(APP_ROOT, 'dist/remote/bfm.js');

/**
 * The shell's loader narrows a dynamically-imported module to this shape and
 * throws when it does not match. Restated here rather than imported: the app
 * must not depend on the shell, and the point of the assertion is that the two
 * agree without a shared type forcing them to.
 */
interface RemoteUiModule {
  readonly bundles: Readonly<Record<string, unknown>>;
}

function assertRemoteUiModule(value: unknown): RemoteUiModule {
  if (typeof value !== 'object' || value === null || !('bundles' in value)) {
    throw new Error("remote bundle does not export a 'bundles' record");
  }
  const { bundles } = value as { bundles: unknown };
  if (typeof bundles !== 'object' || bundles === null) {
    throw new Error("remote bundle 'bundles' export is not an object");
  }
  return { bundles: bundles as Readonly<Record<string, unknown>> };
}

/**
 * The loader had never loaded anything. Every test around
 * `synthesizeExternalBundleEntry` injects a fake importer resolving an
 * in-memory object, so what was proven was the descriptor synthesis and the
 * failure containment — never that a real build produces a module the loader
 * can read (POPS-3216 §1). This builds the bundle and imports it for real.
 */
describe('bfm remote bundle', () => {
  let imported: unknown;

  beforeAll(async () => {
    await run('pnpm', ['run', 'build:remote'], { cwd: APP_ROOT });
    imported = await import(pathToFileURL(ENTRY).href);
  }, 300_000);

  it('satisfies the module shape the shell narrows to', () => {
    expect(() => assertRemoteUiModule(imported)).not.toThrow();
  });

  it('resolves every advertised slot to a component', () => {
    const { bundles } = assertRemoteUiModule(imported);
    for (const page of BFM_PAGES) {
      const component = bundles[page.bundleSlot];
      expect(component, page.bundleSlot).toBeDefined();
      expect(['function', 'object'], page.bundleSlot).toContain(typeof component);
    }
  });

  it('carries no slot the manifest does not advertise', () => {
    const { bundles } = assertRemoteUiModule(imported);
    const advertised = BFM_PAGES.map((page) => page.bundleSlot).toSorted();
    expect(Object.keys(bundles).toSorted()).toEqual(advertised);
  });

  // Externalised, not merely absent. A build that dropped React by accident —
  // tree-shaken out of a bundle that never rendered anything, say — would pass
  // the "no shared runtime inside" check while shipping a module that cannot
  // reach the shell's instance.
  it('imports React from the host rather than containing it', async () => {
    const source = await readFile(ENTRY, 'utf8');
    // Either spelling counts: whether a specifier keeps a named binding or is
    // reduced to a side-effect import depends on what survived tree-shaking,
    // and both are the module importing React rather than carrying it.
    expect(source).toMatch(/(?:from|import)\s*["']react["']/);
    expect(source).toMatch(/(?:from|import)\s*["']react\/jsx-runtime["']/);
  });

  // Each page keeps its own chunk, so a loader-mounted pillar still fetches a
  // page's code on first navigation to it rather than all four up front. The
  // entry is the whole cost of having the pillar in the rail.
  it('keeps each page in its own lazily-imported chunk', async () => {
    const source = await readFile(ENTRY, 'utf8');
    const dynamicImports = [...source.matchAll(/import\("\.\/([^"]+)"\)/g)];
    expect(dynamicImports.length).toBeGreaterThanOrEqual(BFM_PAGES.length);
  });
});
