import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  attachPublishedReleaseReload,
  isPublishedReleasePointer,
  parseUiRequest,
  publishedBundleFile,
  reloadForPublishedRelease,
  releasePathFor,
  releaseUrl,
  sourceModuleId,
  sourceModuleSource,
  sourcePillarsFrom,
} from './vite-plugin-pillar-ui-dev.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('parseUiRequest', () => {
  it('reads a pillar id and a file out of the UI path', () => {
    expect(parseUiRequest('/purchases-ui/purchases.js')).toEqual({
      pillarId: 'purchases',
      file: 'purchases.js',
    });
  });

  it('reads a hashed chunk beside the entry', () => {
    expect(parseUiRequest('/purchases-ui/MerchantLensPage-DnlaGGLo.js')).toEqual({
      pillarId: 'purchases',
      file: 'MerchantLensPage-DnlaGGLo.js',
    });
  });

  it('ignores the query string a module request may carry', () => {
    expect(parseUiRequest('/purchases-ui/purchases.js?t=123')?.file).toBe('purchases.js');
  });

  it('accepts a hyphenated pillar id', () => {
    expect(parseUiRequest('/some-pillar-ui/x.js')?.pillarId).toBe('some-pillar');
  });

  it('passes through anything that is not a UI request', () => {
    expect(parseUiRequest('/src/main.tsx')).toBeUndefined();
    expect(parseUiRequest('/purchases-api/orders')).toBeUndefined();
    expect(parseUiRequest('/purchases-ui/')).toBeUndefined();
    expect(parseUiRequest('/-ui/x.js')).toBeUndefined();
  });

  // The file segment reaches the filesystem. A traversal would serve anything
  // the dev server's user can read, which is the whole repo and then some.
  it('refuses a path that climbs out of the bundle directory', () => {
    expect(parseUiRequest('/purchases-ui/../../../../etc/passwd')).toBeUndefined();
  });

  // `req.url` arrives percent-encoded, so the check has to happen on the
  // decoded segment — otherwise this reads as an ordinary filename.
  it('refuses an encoded traversal', () => {
    expect(parseUiRequest('/purchases-ui/..%2F..%2Fetc/passwd')).toBeUndefined();
    expect(parseUiRequest('/purchases-ui/%2e%2e%2f%2e%2e%2fetc/passwd')).toBeUndefined();
  });

  it('refuses a segment that will not decode', () => {
    expect(parseUiRequest('/purchases-ui/%ZZ.js')).toBeUndefined();
  });

  it('refuses a NUL byte in the file segment', () => {
    expect(parseUiRequest('/purchases-ui/x%00.js')).toBeUndefined();
  });

  it('refuses encoded backslash and interior traversal before platform path handling', () => {
    expect(parseUiRequest('/purchases-ui/..%5C..%5Cetc%5Cpasswd')).toBeUndefined();
    expect(parseUiRequest('/purchases-ui/chunks/../entry.js')).toBeUndefined();
  });

  it('allows a nested file and refuses normalised traversal segments', () => {
    expect(parseUiRequest('/purchases-ui/chunks/a.js')?.file).toBe('chunks/a.js');
    expect(parseUiRequest('/purchases-ui/a/../b.js')).toBeUndefined();
  });

  it('decodes an ordinary encoded character', () => {
    expect(parseUiRequest('/purchases-ui/a%20b.js')?.file).toBe('a b.js');
  });
});

describe('sourcePillarsFrom', () => {
  it('selects valid source-mode pillars without making malformed values routes', () => {
    expect(sourcePillarsFrom('inventory, media, ../secrets')).toEqual(
      new Set(['inventory', 'media'])
    );
  });

  it('uses a stable virtual module id for a selected pillar', () => {
    expect(sourceModuleId('inventory')).toBe('\0pops-pillar-ui-source:inventory');
  });
});

describe('isPublishedReleasePointer', () => {
  it('reloads only a completed remote-build pointer', () => {
    expect(
      isPublishedReleasePointer('/repo', '/repo/pillars/media/app/dist/.ui-dev-current.json')
    ).toBe(true);
    expect(isPublishedReleasePointer('/repo', '/repo/pillars/media/app/src/page.tsx')).toBe(false);
    expect(
      isPublishedReleasePointer('/repo', '/repo/pillars/media/dist/.ui-dev-current.json')
    ).toBe(false);
  });

  it('attaches both Vite pointer events to a reload without reacting to other files', () => {
    const listeners = new Map<string, (changedPath: string) => void>();
    const watcher = {
      on(event: 'add' | 'change', listener: (changedPath: string) => void) {
        listeners.set(event, listener);
      },
    };
    const reload = vi.fn();
    attachPublishedReleaseReload(watcher, '/repo', reload);

    listeners.get('add')?.('/repo/pillars/ai/app/dist/.ui-dev-current.json');
    listeners.get('change')?.('/repo/pillars/ai/app/dist/.ui-dev-current.json');
    listeners.get('change')?.('/repo/pillars/ai/app/src/page.tsx');

    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('reloads for both initial pointer publication and pointer replacement only', () => {
    const reload = vi.fn();
    reloadForPublishedRelease('/repo', '/repo/pillars/media/app/dist/.ui-dev-current.json', reload);
    reloadForPublishedRelease('/repo', '/repo/pillars/media/app/dist/remote/media.js', reload);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('release URLs', () => {
  it('pins a stable entry to a single release so its lazy chunks keep that release', () => {
    const request = parseUiRequest('/media-ui/media.js');
    if (request === undefined) throw new Error('expected a valid entry URL');
    const chunkRequest = parseUiRequest('/media-ui/__pops-release/session-1/chunk.js');
    if (chunkRequest === undefined) throw new Error('expected a valid chunk URL');
    expect(releaseUrl(request, 'session-1')).toBe('/media-ui/__pops-release/session-1/media.js');
    expect(releasePathFor(chunkRequest)).toEqual({
      release: 'session-1',
      file: 'chunk.js',
    });
  });

  it('does not treat an arbitrary nested URL as a release-qualified bundle', () => {
    const chunkRequest = parseUiRequest('/media-ui/chunks/page.js');
    if (chunkRequest === undefined) throw new Error('expected a valid chunk URL');
    expect(releasePathFor(chunkRequest)).toBeUndefined();
    expect(parseUiRequest('/media-ui/__pops-release/../../secret')).toBeUndefined();
  });

  it('uses a manually built remote bundle when no watcher pointer exists', async () => {
    const temporaryRoot = path.resolve(import.meta.dirname, '../..', 'tmp');
    await mkdir(temporaryRoot, { recursive: true });
    const repoRoot = await mkdtemp(path.join(temporaryRoot, 'pillar-ui-dev-'));
    temporaryDirectories.push(repoRoot);
    const bundle = path.join(repoRoot, 'pillars', 'media', 'app', 'dist', 'remote', 'media.js');
    await mkdir(path.dirname(bundle), { recursive: true });
    await writeFile(bundle, 'export {};');
    const request = parseUiRequest('/media-ui/media.js');
    if (request === undefined) throw new Error('expected a valid bundle URL');
    expect(publishedBundleFile(repoRoot, request)).toBe(bundle);
  });
});

describe('source stylesheet module', () => {
  it('imports remote CSS in the virtual module so Vite owns source and Tailwind updates', () => {
    const source = sourceModuleSource('/repo', 'finance');
    expect(source).toContain('import "/repo/pillars/finance/app/remote.css";');
    expect(source).toContain('export * from "/repo/pillars/finance/app/src/remote-entry.ts";');
  });
});
