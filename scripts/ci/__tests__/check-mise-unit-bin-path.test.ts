import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  bareToolsIn,
  checkUnitBinPaths,
  declaresOwnBinPath,
  extractTaskRuns,
  WATCHED_TOOLS,
} from '../check-mise-unit-bin-path.mjs';
import { parseToml } from '../config-parse.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

describe('bareToolsIn', () => {
  it('finds a single bare watched tool', () => {
    expect(bareToolsIn('tsc --noEmit')).toEqual(['tsc']);
  });

  it('finds every watched tool across && segments, once each', () => {
    expect(bareToolsIn('oxlint src && oxfmt --check .')).toEqual(['oxlint', 'oxfmt']);
  });

  it('ignores a tool name that is not the first token of its segment', () => {
    // `pnpm exec tsc` — the segment's first token is `pnpm`, not `tsc`.
    expect(bareToolsIn('pnpm exec tsc --noEmit')).toEqual([]);
  });

  it('ignores pnpm run, node and mise run invocations entirely', () => {
    expect(bareToolsIn('pnpm run build:remote')).toEqual([]);
    expect(bareToolsIn('node dist/api/server.js')).toEqual([]);
    expect(bareToolsIn('mise run -C ../types build')).toEqual([]);
  });

  it('finds a bare tool split across a newline-joined multi-line run string', () => {
    expect(bareToolsIn('tsc -b tsconfig.build.json\n&& oxlint src')).toEqual(['tsc', 'oxlint']);
  });

  it('does not confuse "vite" and "vitest" — each is only matched as its own leading token', () => {
    expect(bareToolsIn('vite build')).toEqual(['vite']);
    expect(bareToolsIn('vitest run')).toEqual(['vitest']);
  });
});

describe('extractTaskRuns', () => {
  it('reads a plain [tasks.name] run string', () => {
    const doc = parseToml('[tasks.test]\nrun = "vitest run"\n', 'test');
    expect(extractTaskRuns(doc)).toEqual([{ task: 'test', run: 'vitest run' }]);
  });

  it('reads every element of an array-form run', () => {
    const doc = parseToml(
      '[tasks.typecheck]\nrun = ["mise run -C ../x build", "tsc --noEmit"]\n',
      'test'
    );
    expect(extractTaskRuns(doc)).toEqual([
      { task: 'typecheck', run: 'mise run -C ../x build' },
      { task: 'typecheck', run: 'tsc --noEmit' },
    ]);
  });

  it('reads the inline-table shorthand cargo units use', () => {
    const doc = parseToml('[tasks]\nbuild = { run = "cargo build --all-targets" }\n', 'test');
    expect(extractTaskRuns(doc)).toEqual([{ task: 'build', run: 'cargo build --all-targets' }]);
  });

  it('reads a quoted dotted task name', () => {
    const doc = parseToml('[tasks."test:e2e"]\nrun = "playwright test"\n', 'test');
    expect(extractTaskRuns(doc)).toEqual([{ task: 'test:e2e', run: 'playwright test' }]);
  });

  it('returns nothing for a document with no [tasks] table', () => {
    expect(extractTaskRuns(parseToml('[env]\n_.path = ["x"]\n', 'test'))).toEqual([]);
  });
});

describe('declaresOwnBinPath', () => {
  it('is true for the established fix', () => {
    const doc = parseToml('[env]\n_.path = ["{{config_root}}/node_modules/.bin"]\n', 'test');
    expect(declaresOwnBinPath(doc)).toBe(true);
  });

  it('is false with no [env] table at all', () => {
    expect(declaresOwnBinPath(parseToml('[tasks.test]\nrun = "vitest run"\n', 'test'))).toBe(false);
  });

  it('is false when [env] declares something other than _.path', () => {
    const doc = parseToml('[env]\nSOME_VAR = "x"\n', 'test');
    expect(declaresOwnBinPath(doc)).toBe(false);
  });

  it('is true when _.path is a single scalar rather than an array', () => {
    // mise accepts a bare string for a one-entry path list.
    const doc = parseToml('[env]\n_.path = "{{config_root}}/node_modules/.bin"\n', 'test');
    expect(declaresOwnBinPath(doc)).toBe(true);
  });
});

describe('checkUnitBinPaths — fixture tree', () => {
  function withFixture(build: (root: string) => void, run: (root: string) => void): void {
    const root = mkdtempSync(join(tmpdir(), 'mise-binpath-fixture-'));
    try {
      build(root);
      run(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it('reports a unit with a bare watched tool and no fix', () => {
    withFixture(
      (root) => {
        mkdirSync(join(root, 'libs', 'rogue'), { recursive: true });
        writeFileSync(
          join(root, 'libs', 'rogue', 'mise.toml'),
          '[tasks.test]\nrun = "vitest run"\n'
        );
      },
      (root) => {
        const { violations } = checkUnitBinPaths(root);
        expect(violations).toHaveLength(1);
        expect(violations[0]).toContain('libs/rogue');
        expect(violations[0]).toContain('"vitest"');
      }
    );
  });

  it('does not report a unit that already declares its own bin path', () => {
    withFixture(
      (root) => {
        mkdirSync(join(root, 'libs', 'fixed'), { recursive: true });
        writeFileSync(
          join(root, 'libs', 'fixed', 'mise.toml'),
          '[tasks.test]\nrun = "vitest run"\n\n[env]\n_.path = ["{{config_root}}/node_modules/.bin"]\n'
        );
      },
      (root) => {
        expect(checkUnitBinPaths(root).violations).toEqual([]);
      }
    );
  });

  it('does not report a unit whose tasks never call a watched tool bare', () => {
    withFixture(
      (root) => {
        mkdirSync(join(root, 'libs', 'clean'), { recursive: true });
        writeFileSync(
          join(root, 'libs', 'clean', 'mise.toml'),
          [
            '[tasks.test]',
            'run = "pnpm exec vitest run"',
            '',
            '[tasks.build]',
            'run = "pnpm run build:remote"',
            '',
          ].join('\n')
        );
      },
      (root) => {
        expect(checkUnitBinPaths(root).violations).toEqual([]);
      }
    );
  });

  it('excludes clients/ units entirely', () => {
    withFixture(
      (root) => {
        mkdirSync(join(root, 'clients', 'ios'), { recursive: true });
        writeFileSync(
          join(root, 'clients', 'ios', 'mise.toml'),
          '[tasks.test]\nrun = "vitest run"\n'
        );
      },
      (root) => {
        expect(checkUnitBinPaths(root).violations).toEqual([]);
      }
    );
  });

  it('reports an unparseable unit config as a violation, not a skipped unit', () => {
    withFixture(
      (root) => {
        mkdirSync(join(root, 'libs', 'broken'), { recursive: true });
        writeFileSync(
          join(root, 'libs', 'broken', 'mise.toml'),
          '[tasks.test\nrun = "vitest run"\n'
        );
      },
      (root) => {
        const { violations } = checkUnitBinPaths(root);
        expect(violations.some((v) => v.includes('could not be parsed'))).toBe(true);
      }
    );
  });
});

describe('against the live repo', () => {
  it('every discovered unit resolves its own node_modules/.bin, not the root’s', () => {
    expect(checkUnitBinPaths(repoRoot).violations).toEqual([]);
  });

  it('WATCHED_TOOLS names at least the tools this repo actually invokes bare in a fixed unit', () => {
    // A loose sanity check, not a duplicate of the guard itself: if this list
    // ever shrinks to nothing the guard would trivially pass everything.
    expect(WATCHED_TOOLS.length).toBeGreaterThan(0);
    expect(WATCHED_TOOLS).toEqual(expect.arrayContaining(['tsc', 'vitest', 'oxlint', 'oxfmt']));
  });
});

// Real subprocess spawns — bounded per scripts/ci/check-subprocess-test-timeouts.mjs.
const CLI_SPAWN_TIMEOUT_MS = 30_000;

describe('CLI', { timeout: CLI_SPAWN_TIMEOUT_MS }, () => {
  it('--self-test exits 0 against the real script', () => {
    const result = spawnSync(
      process.execPath,
      [join(repoRoot, 'scripts', 'ci', 'check-mise-unit-bin-path.mjs'), '--self-test'],
      { encoding: 'utf8' }
    );
    expect(result.status).toBe(0);
  });

  it('exits 0 with no violations against the real repo', () => {
    const result = spawnSync(
      process.execPath,
      [join(repoRoot, 'scripts', 'ci', 'check-mise-unit-bin-path.mjs')],
      { encoding: 'utf8', cwd: repoRoot }
    );
    expect(result.status).toBe(0);
  });
});
