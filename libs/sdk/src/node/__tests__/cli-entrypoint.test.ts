import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { isCliEntrypoint } from '../cli-entrypoint.js';

const here = fileURLToPath(import.meta.url);

describe('isCliEntrypoint', () => {
  it('recognises the entry path the process was actually started with', () => {
    expect(isCliEntrypoint(import.meta.url, here)).toBe(true);
  });

  it('recognises an entry path given relative to the working directory', () => {
    expect(isCliEntrypoint(import.meta.url, relative(process.cwd(), here))).toBe(true);
  });

  it('recognises an entry path that a file URL has to percent-encode', () => {
    const entryPath = join('/srv', 'My Projects', 'pops', 'scripts', 'ingest-amazon.ts');
    const moduleUrl = pathToFileURL(entryPath).href;

    expect(moduleUrl).toContain('My%20Projects');
    // The form this replaced: an unencoded path against an encoded URL, which
    // never matches and leaves the CLI doing nothing at all.
    expect(moduleUrl === `file://${entryPath}`).toBe(false);
    expect(isCliEntrypoint(moduleUrl, entryPath)).toBe(true);
  });

  it('stays false when the module is imported by some other entry point', () => {
    expect(isCliEntrypoint(import.meta.url, join(dirname(here), 'some-other-script.ts'))).toBe(
      false
    );
  });

  it('stays false when there is no entry path at all', () => {
    expect(isCliEntrypoint(import.meta.url, undefined)).toBe(false);
    expect(isCliEntrypoint(import.meta.url, '')).toBe(false);
  });

  describe('a symlinked ancestor directory', () => {
    const created: string[] = [];

    afterEach(() => {
      while (created.length > 0) rmSync(created.pop() as string, { recursive: true, force: true });
    });

    /**
     * Reproduces the mismatch a real symlinked checkout hits on its own
     * (macOS's `/tmp` → `/private/tmp` is the common case) deterministically,
     * the same way `scripts/__tests__/entrypoint-symlink.test.ts` does for
     * POPS-1801: `storeDir` holds a file directly, `linkDir` is a sibling
     * symlink to it. Node's ESM loader would realpath-resolve
     * `import.meta.url` to a `storeDir` path for a module loaded through
     * `linkDir`; `resolve(process.argv[1])` alone stays a `linkDir` path.
     * `moduleUrl` here stands in for that realpath-resolved `import.meta.url`
     * without actually spawning a subprocess to get one — built by
     * realpath-resolving `storeDir` itself too, since `tmpdir()` is commonly
     * a symlink on its own (macOS's `/var/folders` → `/private/var/folders`),
     * and `mkdtempSync` does not normalise that away.
     */
    function symlinkedEntry(): { moduleUrl: string; entryPath: string } {
      const base = mkdtempSync(join(tmpdir(), 'pops-2082-'));
      created.push(base);
      const storeDir = join(base, 'store');
      const linkDir = join(base, 'link');
      mkdirSync(storeDir);
      const file = 'entry.mjs';
      writeFileSync(join(storeDir, file), '');
      symlinkSync(storeDir, linkDir, 'dir');

      return {
        moduleUrl: pathToFileURL(realpathSync(join(storeDir, file))).href,
        entryPath: join(linkDir, file),
      };
    }

    it('matches once the entry path is realpath-resolved', () => {
      const { moduleUrl, entryPath } = symlinkedEntry();
      expect(isCliEntrypoint(moduleUrl, entryPath)).toBe(true);
    });

    it('control: resolving without following the symlink misses the match — the gap the purchases helper this replaces did not cover', () => {
      const { moduleUrl, entryPath } = symlinkedEntry();
      const unfollowed = pathToFileURL(resolve(entryPath)).href;
      expect(unfollowed).not.toBe(moduleUrl);
    });
  });
});
