import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, beforeAll, afterAll } from 'vitest';

import {
  packageRoot,
  importedPackages,
  declaredDependencies,
  findPhantomDeps,
  discoverUnits,
  resolveUnit,
  tsconfigAliasMatcher,
} from '../lib.mjs';

describe('packageRoot', () => {
  it('reduces scoped and unscoped specifiers to their installable root', () => {
    expect(packageRoot('@pops/types')).toBe('@pops/types');
    expect(packageRoot('@pops/sdk/client')).toBe('@pops/sdk');
    expect(packageRoot('react')).toBe('react');
    expect(packageRoot('react-dom/client')).toBe('react-dom');
  });

  it('returns null for non-package specifiers', () => {
    for (const s of [
      './local',
      '../up',
      '/abs',
      'node:fs',
      'data:text/js,1',
      'file:x',
      '@scope',
      '',
    ]) {
      expect(packageRoot(s)).toBeNull();
    }
  });
});

describe('importedPackages — AST coverage of every import form', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'ex1-imp-'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('captures static, type-only, re-export, dynamic, require and import-equals', () => {
    const file = join(dir, 'forms.ts');
    writeFileSync(
      file,
      [
        "import a from 'static-default';",
        "import type { T } from 'type-only';",
        "import { b } from '@scope/named/subpath';",
        "export { c } from 're-export';",
        "export * from 'star-export';",
        "const d = await import('dynamic-import');",
        "const e = require('require-call');",
        "import legacy = require('import-equals');",
        'void [a, b, d, e, legacy];',
      ].join('\n')
    );
    const got = importedPackages(file);
    expect(got).toEqual(
      new Set([
        'static-default',
        'type-only',
        '@scope/named',
        're-export',
        'star-export',
        'dynamic-import',
        'require-call',
        'import-equals',
      ])
    );
  });

  it('ignores relative imports and node builtins', () => {
    const file = join(dir, 'ignored.ts');
    writeFileSync(file, "import './x'; import 'node:fs'; import '../y';");
    expect(importedPackages(file).size).toBe(0);
  });

  it('does not treat an import inside a string literal as an import', () => {
    const file = join(dir, 'string-literal.ts');
    writeFileSync(file, `const code = "import x from '@pops/finance';"; void code;`);
    expect(importedPackages(file).has('@pops/finance')).toBe(false);
  });
});

describe('declaredDependencies', () => {
  it('unions deps, peerDeps, optionalDeps and devDeps', () => {
    const declared = declaredDependencies({
      dependencies: { a: '1' },
      peerDependencies: { b: '1' },
      optionalDependencies: { c: '1' },
      devDependencies: { d: '1' },
    });
    expect([...declared].toSorted()).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('findPhantomDeps — fixture units', () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'ex1-unit-'));
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  function makeUnit(name: string, pkg: Record<string, unknown>, files: Record<string, string>) {
    const dir = join(root, name);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, ...pkg }));
    for (const [rel, content] of Object.entries(files)) {
      const target = join(dir, rel);
      mkdirSync(join(target, '..'), { recursive: true });
      writeFileSync(target, content);
    }
    return resolveUnit(dir);
  }

  it('flags an undeclared import and ignores declared/self/builtin/test imports', () => {
    const unit = makeUnit(
      'flagged',
      {
        dependencies: { declared: '^1.0.0' },
        devDependencies: { 'declared-dev': '^1.0.0' },
      },
      {
        'src/index.ts': [
          "import 'declared';",
          "import 'declared-dev';",
          "import 'phantom-pkg';",
          "import 'phantom-scoped/lib';",
          "import 'flagged/other';",
          "import 'node:fs';",
        ].join('\n'),
        'src/index.test.ts': "import 'test-only-phantom';",
      }
    );
    const { phantoms } = findPhantomDeps(unit);
    const names = phantoms.map((p) => p.pkg);
    expect(names).toContain('phantom-pkg');
    expect(names).toContain('phantom-scoped');
    expect(names).not.toContain('declared');
    expect(names).not.toContain('declared-dev');
    expect(names).not.toContain('flagged');
    expect(names).not.toContain('test-only-phantom');
  });

  it('returns no phantoms when everything is declared', () => {
    const unit = makeUnit(
      'clean',
      { dependencies: { ok: '^1.0.0', '@scope/ok': '^1.0.0' } },
      { 'src/index.ts': "import 'ok'; import '@scope/ok/sub';" }
    );
    expect(findPhantomDeps(unit).phantoms).toHaveLength(0);
  });

  it('treats a unit with no source as having nothing to check', () => {
    const dir = join(root, 'empty');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'empty' }));
    const unit = resolveUnit(dir);
    expect(findPhantomDeps(unit).phantoms).toHaveLength(0);
  });

  it('does NOT flag tsconfig path-alias imports (they resolve to the unit itself)', () => {
    const dir = join(root, 'aliased');
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'aliased' }));
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } })
    );
    writeFileSync(
      join(dir, 'src', 'index.ts'),
      "import { s } from '@/store'; import '@/lib/x'; void s;"
    );
    const matcher = tsconfigAliasMatcher(dir);
    expect(matcher('@/store')).toBe(true);
    expect(matcher('@/lib')).toBe(true);
    expect(matcher('@pops/types')).toBe(false);
    expect(findPhantomDeps(resolveUnit(dir)).phantoms).toHaveLength(0);
  });
});

describe('discoverUnits — against the live repo', () => {
  let units: ReturnType<typeof discoverUnits>;
  let offenders: Array<{ name: string; phantoms: ReturnType<typeof findPhantomDeps>['phantoms'] }>;

  // Walks every unit under libs/ and pillars/ once, then runs the TypeScript
  // parser synchronously over every one of their source files to compute
  // phantom deps — no cache, no worker pool, cost scales with the size of the
  // tree. Sharing that single walk across both tests below (instead of each
  // test re-running its own) keeps the assertions fast; the walk itself still
  // needs a budget wider than vitest's 5000ms default: it has been clocked at
  // up to ~5.5s on a 14-core machine once other CPU-heavy processes (a second
  // vitest/tsc run, a build) are competing for the same cores.
  beforeAll(() => {
    units = discoverUnits();
    offenders = units
      .map((u) => ({ name: u.name, phantoms: findPhantomDeps(u).phantoms }))
      .filter((r) => r.phantoms.length > 0);
  }, 30_000);

  it('finds the leaf libs and skips Rust-only crates', () => {
    const names = new Set(units.map((u) => u.name));
    expect(names.has('@pops/types')).toBe(true);
    expect(names.has('@pops/pillar-sdk')).toBe(true);
    // contacts is a Rust crate (no package.json) — never discovered here.
    expect([...names].every((n) => typeof n === 'string')).toBe(true);
  });

  it('every discovered unit declares every package it imports (EX-1 holds on the tree)', () => {
    expect(offenders).toEqual([]);
  });
});

/**
 * The gate's own exit code, not just the pure function underneath it.
 *
 * `findPhantomDeps` returning `{ phantoms: [] }` is the same value for "this
 * unit is clean" and "this unit had nothing to parse", and every caller read
 * only the first field. That is how `--all` could print
 * `✔ EX-1: 0 unit(s) declare every imported package` and exit 0 over a tree it
 * could no longer see. `scanned` was computed all along and discarded.
 *
 * These spawn the CLI because that is the surface CI runs — `main()` is not
 * exported, and the assertion the ticket asks for is on the exit code.
 */
describe('depcheck CLI — an empty sweep is not a pass', () => {
  const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'depcheck.mjs');
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'ex1-cli-'));
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  /** Run the gate in `cwd` and return its exit code and combined output. */
  function run(cwd: string, args: string[]): { status: number; output: string } {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
    return { status: result.status ?? -1, output: `${result.stdout}${result.stderr}` };
  }

  function unit(dir: string, pkg: Record<string, unknown>, files: Record<string, string> = {}) {
    const abs = join(root, dir);
    mkdirSync(abs, { recursive: true });
    writeFileSync(join(abs, 'package.json'), JSON.stringify(pkg));
    for (const [rel, content] of Object.entries(files)) {
      const target = join(abs, rel);
      mkdirSync(join(target, '..'), { recursive: true });
      writeFileSync(target, content);
    }
  }

  it('fails when --all discovers no units at all', () => {
    const empty = join(root, 'no-roots');
    mkdirSync(empty, { recursive: true });

    const { status, output } = run(empty, ['--all']);

    expect(status).toBe(1);
    expect(output).toContain('discovered zero units');
  });

  it('fails when a discovered unit has no source file to parse', () => {
    const tree = join(root, 'silent');
    mkdirSync(join(tree, 'libs'), { recursive: true });
    unit('silent/libs/hollow', { name: '@fixture/hollow' });

    const { status, output } = run(tree, ['--all']);

    expect(status).toBe(1);
    expect(output).toContain('@fixture/hollow');
    expect(output).toContain('no source file to scan');
  });

  it('accepts a source-free unit that declares why, and says so on stdout', () => {
    const tree = join(root, 'declared');
    mkdirSync(join(tree, 'libs'), { recursive: true });
    unit('declared/libs/data-only', {
      name: '@fixture/data-only',
      pops: { extractability: { noProofSurface: 'translation JSON only' } },
    });

    const { status, output } = run(tree, ['--all']);

    expect(status).toBe(0);
    expect(output).toContain('translation JSON only');
  });

  it('reports the file count, so a shrinking scan is visible in a passing run', () => {
    const tree = join(root, 'counted');
    mkdirSync(join(tree, 'libs'), { recursive: true });
    unit(
      'counted/libs/real',
      { name: '@fixture/real', dependencies: { declared: '^1.0.0' } },
      { 'src/index.ts': "import 'declared';", 'src/other.ts': "import 'declared';" }
    );

    const { status, output } = run(tree, ['--all']);

    expect(status).toBe(0);
    expect(output).toContain('2 source file(s) parsed');
  });

  it('fails when the source root cannot be read, rather than scanning zero files', () => {
    // `src` as a FILE, so `readdirSync` raises ENOTDIR. The scan used to catch
    // that and return an empty file list, which reaches the caller as
    // `{ phantoms: [] }` — the guard's success value — from a unit whose
    // source it never opened. Portable and deterministic, unlike chmod 000,
    // which does nothing when the suite happens to run as root.
    const tree = join(root, 'unreadable');
    mkdirSync(join(tree, 'libs', 'blocked'), { recursive: true });
    writeFileSync(join(tree, 'libs', 'blocked', 'package.json'), JSON.stringify({ name: '@f/b' }));
    writeFileSync(join(tree, 'libs', 'blocked', 'src'), 'not a directory');

    const { status, output } = run(tree, ['--all']);

    expect(status).not.toBe(0);
    expect(output).toContain('ENOTDIR');
  });

  it('fails on a package.json that exists and does not parse, rather than skipping the unit', () => {
    const tree = join(root, 'malformed');
    mkdirSync(join(tree, 'libs', 'broken'), { recursive: true });
    writeFileSync(join(tree, 'libs', 'broken', 'package.json'), '{"name": ');

    const { status, output } = run(tree, ['--all']);

    expect(status).not.toBe(0);
    expect(output).toContain('does not parse as JSON');
  });
});
