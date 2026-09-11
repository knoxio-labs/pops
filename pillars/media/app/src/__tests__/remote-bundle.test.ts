import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { beforeAll, describe, expect, it } from 'vitest';

import { MEDIA_PAGES, MEDIA_SETTINGS_WIDGET_SLOTS } from '@pops/media/manifest';

const run = promisify(execFile);

const APP_ROOT = path.resolve(import.meta.dirname, '../..');
const ENTRY = path.join(APP_ROOT, 'dist/remote/media.js');

/**
 * The shell's loader narrows a dynamically-imported module to this shape and
 * throws when it does not match. Restated here rather than imported: the app
 * must not depend on the shell.
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

const PAGE_SLOTS = MEDIA_PAGES.map((page) => page.bundleSlot);

/**
 * The page slots that are one-line `<Navigate>` redirects rather than pages:
 * plex, arr and rotation send the reader to their settings sections, calendar
 * to discover. They are bound eagerly in `routes.tsx`, since a network
 * round-trip to learn where to send someone costs more than the bytes.
 */
const EAGER_REDIRECT_SLOTS = 4;

/**
 * `bundles.test.ts` reads the in-process record. What the shell loads is the
 * built `media.js`, so a slot the build drops, or a shared runtime it bundles,
 * is only visible here (POPS-3444).
 */
describe('media remote bundle', () => {
  let imported: unknown;

  beforeAll(async () => {
    await run('pnpm', ['run', 'build:remote'], { cwd: APP_ROOT });
    imported = await import(pathToFileURL(ENTRY).href);
  }, 300_000);

  it('satisfies the module shape the shell narrows to', () => {
    expect(() => assertRemoteUiModule(imported)).not.toThrow();
  });

  it('resolves every page slot to a component', () => {
    const { bundles } = assertRemoteUiModule(imported);
    for (const slot of PAGE_SLOTS) {
      expect(bundles[slot], slot).toBeDefined();
      expect(['function', 'object'], slot).toContain(typeof bundles[slot]);
    }
  });

  it('resolves both settings-widget slots to a component', () => {
    const { bundles } = assertRemoteUiModule(imported);
    for (const slot of MEDIA_SETTINGS_WIDGET_SLOTS) {
      expect(bundles[slot], slot).toBeDefined();
      expect(['function', 'object'], slot).toContain(typeof bundles[slot]);
    }
  });

  it('carries no slot the manifest does not advertise', () => {
    const { bundles } = assertRemoteUiModule(imported);
    const expected = [...PAGE_SLOTS, ...MEDIA_SETTINGS_WIDGET_SLOTS];
    expect(Object.keys(bundles).toSorted()).toEqual([...new Set(expected)].toSorted());
  });

  // Externalised, not merely absent: a bundle that dropped React by accident
  // would pass a "no shared runtime inside" check and still never reach the
  // shell's instance.
  it('imports React from the host rather than containing it', async () => {
    const source = await readFile(ENTRY, 'utf8');
    expect(source).toMatch(/(?:from|import)\s*["']react["']/);
    expect(source).toMatch(/(?:from|import)\s*["']react\/jsx-runtime["']/);
  });

  // Every real page keeps its own chunk, so the pillar being in the rail costs
  // the entry alone and each page's code arrives on first navigation to it.
  // Counted against the manifest minus the eager redirects, so a build that
  // inlines even one lazy page into the entry fails here.
  it('keeps each page in its own lazily-imported chunk', async () => {
    const source = await readFile(ENTRY, 'utf8');
    const dynamicImports = [...source.matchAll(/import\("\.\/([^"]+)"\)/g)];
    expect(dynamicImports.length).toBeGreaterThanOrEqual(PAGE_SLOTS.length - EAGER_REDIRECT_SLOTS);
  });
});
