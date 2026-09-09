import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { beforeAll, describe, expect, it } from 'vitest';

import { allPageSlots } from './page-slots';

const run = promisify(execFile);

const APP_ROOT = path.resolve(import.meta.dirname, '../..');
const ENTRY = path.join(APP_ROOT, 'dist/remote/inventory.js');

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
describe('inventory remote bundle', () => {
  let imported: unknown;

  beforeAll(async () => {
    await run('pnpm', ['run', 'build:remote'], { cwd: APP_ROOT });
    imported = await import(pathToFileURL(ENTRY).href);
  }, 300_000);

  it('satisfies the module shape the shell narrows to', () => {
    expect(() => assertRemoteUiModule(imported)).not.toThrow();
  });

  // Walked, not mapped over the top level: a top-level loop would pass while
  // both report pages were missing from the built bundle.
  it('resolves every advertised slot to a component, nested ones included', () => {
    const { bundles } = assertRemoteUiModule(imported);
    for (const slot of allPageSlots()) {
      const component = bundles[slot];
      expect(component, slot).toBeDefined();
      expect(['function', 'object'], slot).toContain(typeof component);
    }
  });

  it('carries no slot the manifest does not advertise', () => {
    const { bundles } = assertRemoteUiModule(imported);
    expect(Object.keys(bundles).toSorted()).toEqual([...new Set(allPageSlots())].toSorted());
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

  /**
   * Every real page keeps its own chunk, so a loader-mounted pillar still
   * fetches a page's code on first navigation rather than all of them up
   * front. The count is bounded below by the pages that are lazy and above by
   * the slot count: the group passthrough and the two redirects are each a
   * line or two and deliberately eager, since a network round-trip to learn
   * where to send the reader is worse than the bytes.
   */
  it('splits the real pages out without giving the redirects chunks', async () => {
    const source = await readFile(ENTRY, 'utf8');
    const dynamicImports = [...source.matchAll(/import\("\.\/([^"]+)"\)/g)];
    const slots = new Set(allPageSlots()).size;
    expect(dynamicImports.length).toBeGreaterThanOrEqual(slots - 3);
    expect(dynamicImports.length).toBeLessThan(slots);
  });
});
