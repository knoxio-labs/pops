/**
 * POPS-1801: every guard under `scripts/` gates its own entrypoint so it only
 * calls `main()` when invoked directly, not merely imported. The idiom used
 * to be `resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]
 * ?? '')`. `resolve()` normalises a path string but does not follow symlinks,
 * while Node's ESM loader returns a realpath-resolved `import.meta.url` for a
 * module reached through a symlinked ancestor directory — so on a path like
 * macOS's `/tmp` → `/private/tmp`, the two sides disagreed, the guard
 * silently skipped `main()`, and the process exited 0 with no output at all.
 * `import.meta.main` replaces the comparison outright rather than resolving
 * either side more carefully, so there is nothing left to disagree.
 *
 * Per ADR-045, the degenerate case — invoked, does not run, reports nothing —
 * is exactly what a guard's own tests must not let back in. This file is
 * that case for the entrypoint gate itself, shared by every guard, rather
 * than for any one guard's business logic.
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const scriptsDir = join(repoRoot, 'scripts');

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) rmSync(created.pop() as string, { recursive: true, force: true });
});

/**
 * `huly-partition-plan.mjs --self-test` needs exactly these siblings, and its
 * self-test path (unlike its `--assess`/`--refine` modes) touches none of
 * them via the filesystem — only via `import` — so copying just this set
 * reproduces a real guard's entrypoint gate without dragging in the rest of
 * `scripts/`.
 */
const GUARD_FILES = [
  'huly-partition-plan.mjs',
  'cli-flags.mjs',
  'huly-coverage.mjs',
  'huly-partition.mjs',
];

/**
 * Two ways to reach one set of files: `storeDir` holds the copies directly;
 * `linkDir` is a symlink to `storeDir`, placed as a sibling rather than an
 * ancestor. Node's ESM loader realpath-resolves `import.meta.url` to a
 * `storeDir` path when a script is loaded via `linkDir`, while
 * `resolve(process.argv[1])` does not follow the symlink and stays a
 * `linkDir` path — reproducing macOS's `/tmp` → `/private/tmp` mismatch
 * deterministically on any OS, rather than depending on the platform's own
 * tmpdir happening to sit behind a symlink.
 */
function symlinkedSandbox(): { storeDir: string; linkDir: string } {
  const base = mkdtempSync(join(tmpdir(), 'pops-1801-'));
  created.push(base);
  const storeDir = join(base, 'store');
  const linkDir = join(base, 'link');
  mkdirSync(storeDir);
  for (const file of GUARD_FILES) {
    cpSync(join(scriptsDir, file), join(storeDir, file));
  }
  symlinkSync(storeDir, linkDir, 'dir');
  return { storeDir, linkDir };
}

describe('the entrypoint gate survives a symlinked ancestor path', () => {
  it('the sandbox actually reproduces a literal-vs-realpath mismatch', () => {
    // Sanity check on the fixture: if this ever stopped being true (e.g. a
    // future Node stopped realpath-resolving import.meta.url), the tests
    // below would pass vacuously without exercising anything.
    const { linkDir } = symlinkedSandbox();
    expect(realpathSync(linkDir)).not.toBe(linkDir);
  });

  it('a fixed guard runs to completion when invoked through the symlink', () => {
    const { linkDir } = symlinkedSandbox();
    const stdout = execFileSync(
      process.execPath,
      [join(linkDir, 'huly-partition-plan.mjs'), '--self-test'],
      { encoding: 'utf8' }
    );

    // The exact degenerate case this ticket fixed: a regressed entrypoint
    // gate exits 0 here too (execFileSync only throws on a nonzero exit), so
    // asserting on stdout content — not merely "did not throw" — is what
    // actually catches it.
    expect(stdout).toContain('self-test OK');
  });

  it('produces the same result through the realpath, showing the symlink is incidental to the pass', () => {
    const { storeDir } = symlinkedSandbox();
    const stdout = execFileSync(
      process.execPath,
      [join(storeDir, 'huly-partition-plan.mjs'), '--self-test'],
      { encoding: 'utf8' }
    );
    expect(stdout).toContain('self-test OK');
  });

  it('control: the pre-fix resolve-compare idiom reproduces the silent no-op through the same symlink', () => {
    // Not a test of shipped code — a control proving the sandbox above would
    // actually have caught POPS-1801 before the fix. It rebuilds the exact
    // broken comparison in a throwaway fixture (never in a file under
    // scripts/) and confirms it fails exactly as the ticket describes: exit
    // 0, zero stdout, main() never runs.
    const { linkDir, storeDir } = symlinkedSandbox();
    writeFileSync(
      join(storeDir, 'broken-guard.mjs'),
      [
        "import { resolve } from 'node:path';",
        "import { fileURLToPath } from 'node:url';",
        '',
        "function main() { console.log('main ran'); }",
        '',
        "if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {",
        '  main();',
        '}',
        '',
      ].join('\n')
    );

    const stdout = execFileSync(process.execPath, [join(linkDir, 'broken-guard.mjs')], {
      encoding: 'utf8',
    });
    expect(stdout).toBe('');
  });
});

describe('no guard under scripts/ still uses the symlink-unsafe entrypoint idiom', () => {
  // A regex on the structure, not `includes()` on one exact literal: the
  // idiom's defining shape is comparing a resolve(fileURLToPath(...)) against
  // a resolve(process.argv[1]...), and that shape survives whitespace
  // reflow or a dropped `?? ''` fallback — an exact-string match would not.
  const OLD_IDIOM =
    /resolve\(\s*fileURLToPath\(\s*import\.meta\.url\s*\)\s*\)\s*===\s*resolve\(\s*process\.argv\[1\]/u;

  /** Every `.mjs` file under `scripts/`, walked directly rather than trusting a glob library to be on the guard-tier that can use one. */
  function everyMjsFile(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) files.push(...everyMjsFile(path));
      else if (entry.isFile() && entry.name.endsWith('.mjs')) files.push(path);
    }
    return files;
  }

  it('discovers more than zero .mjs files — the floor a silently-empty walk would hide behind', () => {
    expect(everyMjsFile(scriptsDir).length).toBeGreaterThan(20);
  });

  it('the resolve(argv[1]) comparison does not reappear anywhere under scripts/, in any spacing', () => {
    const offenders = everyMjsFile(scriptsDir).filter((path) =>
      OLD_IDIOM.test(readFileSync(path, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });

  it('the regex actually matches reformatted variants of the idiom, not just the original spacing', () => {
    // A control for the assertion above: proves the regex is not simply a
    // literal string match wearing a regex's syntax.
    const reformatted = 'resolve( fileURLToPath(import.meta.url) )===resolve(process.argv[1])';
    const noFallback = 'resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])';
    expect(OLD_IDIOM.test(reformatted)).toBe(true);
    expect(OLD_IDIOM.test(noFallback)).toBe(true);
    expect(OLD_IDIOM.test('import.meta.main')).toBe(false);
  });
});
