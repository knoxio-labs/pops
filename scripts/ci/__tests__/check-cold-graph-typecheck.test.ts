/**
 * The cold-graph typecheck guard, and the refusal it demands.
 *
 * `check-cold-graph-typecheck.mjs` owns its degenerate cases in `--self-test`,
 * which the first case here runs for real. What a self-test cannot do is prove
 * the guard reports on a real tree it did not construct (ADR-045, POPS-2110),
 * so the load-bearing part of this file plants a whole workspace — a lib whose
 * types are emitted into `dist/`, a unit importing it, and a bare
 * `tsc --noEmit` — and watches the guard turn it red, then green once the
 * script says what it needs.
 *
 * The other half is `scripts/require-built-graph.mjs`, the refusal itself.
 * A guard that only checks the call is there would be satisfied by a helper
 * that never refuses, so the helper is run against a planted unbuilt package
 * and its exit code and message are asserted.
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { guardsItsOwnGraph, scanRepo } from '../check-cold-graph-typecheck.mjs';
import {
  coldGraphDependencies,
  readUnits,
  resolvesIntoDist,
  typesEntryFor,
} from '../cold-graph-deps.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const guard = join(repoRoot, 'scripts', 'ci', 'check-cold-graph-typecheck.mjs');
const helper = join(repoRoot, 'scripts', 'require-built-graph.mjs');

/** This file spawns `node` against planted trees and against the real repo. */
const REAL_SUBPROCESS_TIMEOUT_MS = 60_000;

const plantedRoots: string[] = [];

afterAll(() => {
  for (const root of plantedRoots) rmSync(root, { recursive: true, force: true });
});

interface PlantOptions {
  /** The dependency's published types entry for `.`. */
  readonly types: string;
  /** The importing unit's `typecheck` script. */
  readonly typecheck: string;
  /** Whether the dependency's `.` types file exists on disk. */
  readonly built?: boolean;
  /** A second export the dependency publishes, and whether it is on disk. */
  readonly subpath?: { readonly name: string; readonly types: string; readonly built: boolean };
  /** What the importing unit imports; defaults to the bare specifier. */
  readonly imports?: string;
}

/**
 * A whole workspace under a temporary directory: one lib publishing `types`,
 * and one pillar importing it with the given `typecheck` script.
 *
 * A real tree rather than a fake `readUnits`, because everything this guard
 * gets wrong it gets wrong at the filesystem — a `types` entry read from the
 * wrong export key, a nested unit swept into its parent's sources, a `dist/`
 * that is there after all.
 */
function plantWorkspace({
  types,
  typecheck,
  built = false,
  subpath,
  imports = '@pops/widget',
}: PlantOptions): string {
  const root = mkdtempSync(join(tmpdir(), 'cold-graph-'));
  plantedRoots.push(root);
  writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'libs/*'\n  - 'pillars/*'\n");

  const widget = join(root, 'libs', 'widget');
  mkdirSync(widget, { recursive: true });
  const exports: Record<string, { types: string }> = { '.': { types } };
  if (subpath !== undefined) exports[`./${subpath.name}`] = { types: subpath.types };
  writeFileSync(
    join(widget, 'package.json'),
    `${JSON.stringify({ name: '@pops/widget', exports }, null, 2)}\n`
  );
  const emit = (relativePath: string): void => {
    const target = join(widget, relativePath.replace(/^\.\//u, ''));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, 'export {};\n');
  };
  if (built) emit(types);
  if (subpath?.built === true) emit(subpath.types);

  const host = join(root, 'pillars', 'host');
  mkdirSync(join(host, 'src'), { recursive: true });
  writeFileSync(
    join(host, 'package.json'),
    `${JSON.stringify({ name: '@pops/host', scripts: { typecheck } }, null, 2)}\n`
  );
  writeFileSync(join(host, 'src', 'index.ts'), `import { thing } from '${imports}';\n`);
  return root;
}

describe('the guard proves itself', { timeout: REAL_SUBPROCESS_TIMEOUT_MS }, () => {
  it('passes its own --self-test', () => {
    const output = execFileSync(process.execPath, [guard, '--self-test'], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: REAL_SUBPROCESS_TIMEOUT_MS,
    });
    expect(output).toMatch(/self-test mutations behave as stated/u);
  });
});

describe('a planted unit that needs the graph', () => {
  it('is reported when its typecheck is a bare tsc --noEmit', () => {
    const root = plantWorkspace({ types: './dist/index.d.ts', typecheck: 'tsc --noEmit' });
    const { needing, failures } = scanRepo(root);

    expect(needing).toBe(1);
    expect(failures).toEqual(['pillars/host — imports @pops/widget']);
  });

  it('is not reported once the script says what it needs', () => {
    const root = plantWorkspace({
      types: './dist/index.d.ts',
      typecheck: 'node ../../scripts/require-built-graph.mjs && tsc --noEmit',
    });
    const { needing, failures } = scanRepo(root);

    expect(needing).toBe(1);
    expect(failures).toEqual([]);
  });

  it('is not in scope at all when the dependency publishes types from src', () => {
    // The same import, the same bare script. Nothing to warm, nothing to say.
    const root = plantWorkspace({ types: './src/index.ts', typecheck: 'tsc --noEmit' });
    const { needing, failures } = scanRepo(root);

    expect(needing).toBe(0);
    expect(failures).toEqual([]);
  });

  it('is not in scope when it declares no typecheck script of its own', () => {
    const root = plantWorkspace({ types: './dist/index.d.ts', typecheck: 'tsc --noEmit' });
    const host = join(root, 'pillars', 'host');
    writeFileSync(join(host, 'package.json'), `${JSON.stringify({ name: '@pops/host' })}\n`);

    expect(scanRepo(root).failures).toEqual([]);
  });
});

describe('the refusal itself', { timeout: REAL_SUBPROCESS_TIMEOUT_MS }, () => {
  const runHelper = (unitDir: string): { status: number; stderr: string } => {
    try {
      execFileSync(process.execPath, [helper], {
        cwd: unitDir,
        encoding: 'utf8',
        timeout: REAL_SUBPROCESS_TIMEOUT_MS,
      });
      return { status: 0, stderr: '' };
    } catch (error) {
      const failure = error as { status?: number; stderr?: string };
      return { status: failure.status ?? -1, stderr: failure.stderr ?? '' };
    }
  };

  it('refuses, naming the package, when the dependency is not built', () => {
    const root = plantWorkspace({ types: './dist/index.d.ts', typecheck: 'tsc --noEmit' });
    const { status, stderr } = runHelper(join(root, 'pillars', 'host'));

    expect(status).toBe(1);
    expect(stderr).toContain('@pops/widget');
    expect(stderr).toContain('mise run typecheck');
  });

  it('gets out of the way when the dependency is built', () => {
    const root = plantWorkspace({
      types: './dist/index.d.ts',
      typecheck: 'tsc --noEmit',
      built: true,
    });

    expect(runHelper(join(root, 'pillars', 'host')).status).toBe(0);
  });

  it('answers at the subpath imported, not at the package root', () => {
    // A package may publish `.` from src and a subpath from dist. Asking only
    // about `.` would call this built while the file `tsc` looks for is absent.
    const root = plantWorkspace({
      types: './src/index.ts',
      typecheck: 'tsc --noEmit',
      subpath: { name: 'manifest', types: './dist/manifest.d.ts', built: false },
      imports: '@pops/widget/manifest',
    });
    const { status, stderr } = runHelper(join(root, 'pillars', 'host'));

    expect(status).toBe(1);
    expect(stderr).toContain('@pops/widget');
  });

  it('is satisfied by the subpath being built, even with the root published from src', () => {
    const root = plantWorkspace({
      types: './src/index.ts',
      typecheck: 'tsc --noEmit',
      subpath: { name: 'manifest', types: './dist/manifest.d.ts', built: true },
      imports: '@pops/widget/manifest',
    });

    expect(runHelper(join(root, 'pillars', 'host')).status).toBe(0);
  });

  it('exits 0 in a unit that needs nothing, rather than refusing on principle', () => {
    const root = plantWorkspace({ types: './src/index.ts', typecheck: 'tsc --noEmit' });

    expect(runHelper(join(root, 'pillars', 'host')).status).toBe(0);
  });
});

describe('the tree it guards', () => {
  const { unitCount, needing, failures } = scanRepo(repoRoot);

  it('found units, and units that need the graph (discovery floor)', () => {
    // Every input is a disk walk and a regex over source. A rename or a
    // reformat would leave this check passing hardest at the moment it had
    // stopped reading anything.
    expect(unitCount).toBeGreaterThan(20);
    expect(needing).toBeGreaterThan(10);
  });

  it('every unit that needs the compiled graph refuses legibly without it', () => {
    expect(failures).toEqual([]);
  });

  it('still sees the two units POPS-3072 was filed about', () => {
    // The instances that produced the ticket. If a refactor ever drops them
    // from the scan, the guard has stopped covering the case it exists for.
    const units = readUnits(repoRoot);
    for (const dir of ['pillars/finance/app', 'pillars/inventory/app']) {
      expect(coldGraphDependencies(join(repoRoot, dir), units).length).toBeGreaterThan(0);
    }
  });
});

describe('guardsItsOwnGraph', () => {
  it.each([
    ['tsc --noEmit', false],
    ['node ../../scripts/require-built-graph.mjs && tsc --noEmit', true],
    ['tsc --noEmit && node ../../scripts/require-built-graph.mjs', false],
    ['tsc -b && tsc --noEmit', true],
    ['node ../../scripts/require-built-graph.mjs && tsc --noEmit && tsc --noEmit -p x.json', true],
  ])('%s → %s', (script, expected) => {
    expect(guardsItsOwnGraph(script)).toBe(expected);
  });
});

describe('typesEntryFor', () => {
  it('reads the types condition of a subpath export', () => {
    expect(
      typesEntryFor({ exports: { './manifest': { types: './dist/m.d.ts' } } }, 'manifest')
    ).toBe('./dist/m.d.ts');
  });

  it('takes a bare string export as the types entry', () => {
    expect(typesEntryFor({ exports: { '.': './src/index.ts' } }, '')).toBe('./src/index.ts');
  });

  it('says nothing about a subpath the package does not export', () => {
    expect(typesEntryFor({ exports: { '.': { types: './dist/i.d.ts' } } }, 'nope')).toBeUndefined();
  });

  it('falls back to `types` when there is no exports map', () => {
    expect(typesEntryFor({ types: './dist/index.d.ts' }, '')).toBe('./dist/index.d.ts');
  });
});

describe('resolvesIntoDist', () => {
  it.each([
    ['./dist/contract/index.d.ts', true],
    ['dist/index.d.ts', true],
    ['./build/dist/index.d.ts', true],
    ['./src/index.ts', false],
    ['./src/distance.d.ts', false],
    ['./distinct.d.ts', false],
  ])('%s → %s', (path, expected) => {
    expect(resolvesIntoDist(path)).toBe(expected);
  });
});
