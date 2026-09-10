import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { beforeAll, describe, expect, it } from 'vitest';

import { AI_PAGES } from '@pops/ai/manifest';

const run = promisify(execFile);

const APP_ROOT = path.resolve(import.meta.dirname, '../..');
const ENTRY = path.join(APP_ROOT, 'dist/remote/ai.js');

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
describe('ai remote bundle', () => {
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
    for (const page of AI_PAGES) {
      const component = bundles[page.bundleSlot];
      expect(component, page.bundleSlot).toBeDefined();
      expect(['function', 'object'], page.bundleSlot).toContain(typeof component);
    }
  });

  it('carries no slot the manifest does not advertise', () => {
    const { bundles } = assertRemoteUiModule(imported);
    const advertised = AI_PAGES.map((page) => page.bundleSlot).toSorted();
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

  /**
   * The dashboard stays behind a lazy boundary, so having ai in the rail costs
   * the entry rather than the page — and the page is the expensive half, being
   * the only one that pulls a charting library in.
   *
   * The other three pages are redirects and are deliberately NOT lazy: a
   * network round-trip to find out where to send the reader is worse than the
   * two lines it saves. So the count is bounded on both sides. One chunk means
   * the dashboard is still split out; fewer than one per page means the
   * redirects have not quietly grown chunks of their own.
   */
  it('splits the dashboard out without giving each redirect a chunk', async () => {
    const source = await readFile(ENTRY, 'utf8');
    const dynamicImports = [...source.matchAll(/import\("\.\/([^"]+)"\)/g)];
    expect(dynamicImports.length).toBeGreaterThanOrEqual(1);
    expect(dynamicImports.length).toBeLessThan(AI_PAGES.length);
  });
});
