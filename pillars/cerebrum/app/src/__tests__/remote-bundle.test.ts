import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { beforeAll, describe, expect, it } from 'vitest';

import { CEREBRUM_CAPTURE_SLOT } from '@pops/cerebrum/manifest';

import { allPageSlots } from './page-slots';

const run = promisify(execFile);

const APP_ROOT = path.resolve(import.meta.dirname, '../..');
const ENTRY = path.join(APP_ROOT, 'dist/remote/cerebrum.js');

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
describe('cerebrum remote bundle', () => {
  let imported: unknown;

  beforeAll(async () => {
    await run('pnpm', ['run', 'build:remote'], { cwd: APP_ROOT });
    imported = await import(pathToFileURL(ENTRY).href);
  }, 300_000);

  it('satisfies the module shape the shell narrows to', () => {
    expect(() => assertRemoteUiModule(imported)).not.toThrow();
  });

  // Walked rather than mapped, so a page tree that grows a layout later keeps
  // its children in this assertion.
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
    // The overlay slot is in the bundle and not in `pages` — it is a surface,
    // not a route — so the expected set is the pages plus it.
    const expected = [...new Set(allPageSlots()), CEREBRUM_CAPTURE_SLOT];
    expect(Object.keys(bundles).toSorted()).toEqual(expected.toSorted());
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

  // Every page is lazy, so each keeps its own chunk and having cerebrum in the
  // rail costs the entry alone.
  it('keeps every page in its own lazily-imported chunk', async () => {
    const source = await readFile(ENTRY, 'utf8');
    const dynamicImports = [...source.matchAll(/import\("\.\/([^"]+)"\)/g)];
    expect(dynamicImports.length).toBeGreaterThanOrEqual(allPageSlots().length);
  });

  /**
   * The overlay is imported eagerly by the entry rather than split out, and
   * that is deliberate: the capture modal is opened by a global hotkey from
   * anywhere in the shell, so a round-trip before the form appears would be
   * felt every time.
   */
  it('resolves the capture-overlay slot to a component', async () => {
    const { bundles } = assertRemoteUiModule(imported);
    const overlay = bundles[CEREBRUM_CAPTURE_SLOT];
    expect(overlay).toBeDefined();
    expect(['function', 'object']).toContain(typeof overlay);
  });
});
