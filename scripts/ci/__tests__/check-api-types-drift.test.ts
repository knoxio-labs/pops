import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  type ApiTypesTarget,
  classifyOutcome,
  deriveOutputPath,
  discoverApiTypesTargets,
  discoverCandidateDirs,
  EXPECTED_TARGETS,
  findExpectedTargetSetViolations,
  runTarget,
} from '../check-api-types-drift.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

const GENERATOR_COMMAND = 'tsx scripts/generate-api-types.ts';

const created: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'api-types-drift-'));
  created.push(root);
  return root;
}

function writePackage(
  root: string,
  dir: string,
  manifest: { name?: string; scripts?: Record<string, string>; exports?: unknown }
): void {
  mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, dir, 'package.json'), JSON.stringify(manifest));
}

const apiTypesExports = {
  './api-types': {
    types: './dist/contract/api-types.generated.d.ts',
    default: './dist/contract/api-types.generated.js',
  },
};

afterEach(() => {
  while (created.length > 0) rmSync(created.pop() as string, { recursive: true, force: true });
});

describe('deriveOutputPath', () => {
  it('swaps dist for src and .d.ts for .ts', () => {
    expect(
      deriveOutputPath({
        exports: {
          './api-types': { types: './dist/contract/api-types.generated.d.ts' },
        },
      })
    ).toBe('src/contract/api-types.generated.ts');
  });

  it('generalises over the subpath rather than hardcoding contract/', () => {
    expect(
      deriveOutputPath({
        exports: { './api-types': { types: './dist/nested/deep/types.generated.d.ts' } },
      })
    ).toBe('src/nested/deep/types.generated.ts');
  });

  it('returns null when exports is missing', () => {
    expect(deriveOutputPath({})).toBeNull();
  });

  it('returns null when the ./api-types export is missing', () => {
    expect(deriveOutputPath({ exports: { '.': { types: './dist/index.d.ts' } } })).toBeNull();
  });

  it('returns null when types is not a string', () => {
    expect(deriveOutputPath({ exports: { './api-types': {} } })).toBeNull();
  });

  it('returns null when the types path does not start with ./dist/', () => {
    expect(
      deriveOutputPath({ exports: { './api-types': { types: './src/api-types.d.ts' } } })
    ).toBeNull();
  });

  it('returns null for a non-object manifest', () => {
    expect(deriveOutputPath(null)).toBeNull();
    expect(deriveOutputPath('not an object')).toBeNull();
  });
});

describe('discoverCandidateDirs', () => {
  it('lists every pillars/<id>, and nothing under libs/ or pillars/<id>/app', () => {
    const root = fixtureRoot();
    writePackage(root, 'pillars/alpha', { name: '@pops/alpha' });
    writePackage(root, 'pillars/alpha/app', { name: '@pops/app-alpha' });
    writePackage(root, 'pillars/beta', { name: '@pops/beta' });
    writePackage(root, 'libs/widget-lib', { name: '@pops/widget-lib' });

    expect(discoverCandidateDirs(root)).toEqual(['pillars/alpha', 'pillars/beta']);
  });

  it('returns an empty list when pillars/ does not exist', () => {
    const root = fixtureRoot();
    expect(discoverCandidateDirs(root)).toEqual([]);
  });
});

describe('discoverApiTypesTargets', () => {
  it('finds a well-formed target, flags a malformed one, ignores decoys', () => {
    const root = fixtureRoot();
    writePackage(root, 'pillars/widgets', {
      name: '@pops/widgets',
      scripts: { 'generate:api-types': GENERATOR_COMMAND },
      exports: apiTypesExports,
    });
    writePackage(root, 'pillars/broken', {
      name: '@pops/broken',
      scripts: { 'generate:api-types': GENERATOR_COMMAND },
      // No exports['./api-types'] — output path cannot be derived.
    });
    writePackage(root, 'pillars/decoy', {
      name: '@pops/decoy',
      scripts: {
        'generate:openapi': 'tsx scripts/generate-openapi.ts',
        'generate:manifest': 'tsx scripts/generate-manifest.ts',
      },
    });
    writePackage(root, 'pillars/different-command', {
      name: '@pops/different-command',
      scripts: { 'generate:api-types': 'tsx scripts/generate-legacy-types.ts' },
      exports: apiTypesExports,
    });

    const targets = discoverApiTypesTargets(root);
    const byPkg = new Map(targets.map((t) => [t.pkgName, t]));

    expect(targets).toHaveLength(2);
    expect(byPkg.get('@pops/widgets')).toMatchObject({
      outputPath: 'src/contract/api-types.generated.ts',
    });
    expect(byPkg.get('@pops/broken')).toMatchObject({ outputPath: null });
    expect(byPkg.has('@pops/decoy')).toBe(false);
    expect(byPkg.has('@pops/different-command')).toBe(false);
  });

  it('skips a unit whose package.json has no readable name', () => {
    const root = fixtureRoot();
    mkdirSync(join(root, 'pillars', 'nameless'), { recursive: true });
    writeFileSync(
      join(root, 'pillars', 'nameless', 'package.json'),
      JSON.stringify({
        scripts: { 'generate:api-types': GENERATOR_COMMAND },
        exports: apiTypesExports,
      })
    );
    expect(discoverApiTypesTargets(root)).toEqual([]);
  });

  it('returns nothing for a unit with no package.json', () => {
    const root = fixtureRoot();
    mkdirSync(join(root, 'pillars', 'empty'), { recursive: true });
    expect(discoverApiTypesTargets(root)).toEqual([]);
  });

  it('never scans pillars/<id>/app, unlike the Hey API client guard', () => {
    const root = fixtureRoot();
    writePackage(root, 'pillars/widgets/app', {
      name: '@pops/app-widgets',
      scripts: { 'generate:api-types': GENERATOR_COMMAND },
      exports: apiTypesExports,
    });
    expect(discoverApiTypesTargets(root)).toEqual([]);
  });
});

const baseTarget: ApiTypesTarget = {
  pkgName: '@pops/widgets',
  pkgDir: 'pillars/widgets',
  command: GENERATOR_COMMAND,
  outputPath: 'src/contract/api-types.generated.ts',
};

describe('classifyOutcome', () => {
  it('flags a malformed target regardless of the outcome fields', () => {
    const target = { ...baseTarget, outputPath: null };
    const result = classifyOutcome(target, { exitCode: 0, exists: true, gitDiff: '' });
    expect(result?.kind).toBe('malformed');
  });

  it('flags a generator error', () => {
    const result = classifyOutcome(baseTarget, { exitCode: 1, exists: false, gitDiff: null });
    expect(result?.kind).toBe('generator-error');
  });

  it('flags a missing output file', () => {
    const result = classifyOutcome(baseTarget, { exitCode: 0, exists: false, gitDiff: null });
    expect(result?.kind).toBe('no-output');
  });

  it('flags drift and carries the diff in the message', () => {
    const result = classifyOutcome(baseTarget, {
      exitCode: 0,
      exists: true,
      gitDiff: '--- a/x\n+++ b/x\n',
    });
    expect(result?.kind).toBe('drift');
    expect(result?.message).toContain('--- a/x');
  });

  it('passes a clean regeneration', () => {
    const result = classifyOutcome(baseTarget, { exitCode: 0, exists: true, gitDiff: '' });
    expect(result).toBeNull();
  });
});

describe('runTarget — reports rather than silently passing on a degenerate run', () => {
  it('never invokes the generator for a malformed target, and still reports it', () => {
    const target = { ...baseTarget, outputPath: null };
    let called = false;
    const result = runTarget(target, '/repo', {
      generate: () => {
        called = true;
        return 0;
      },
      outputExists: () => true,
      gitDiff: () => '',
    });
    expect(called).toBe(false);
    expect(result?.kind).toBe('malformed');
  });

  it('reports a generator that errors without ever touching git', () => {
    let gitDiffCalled = false;
    const result = runTarget(baseTarget, '/repo', {
      generate: () => 1,
      outputExists: () => false,
      gitDiff: () => {
        gitDiffCalled = true;
        return '';
      },
    });
    expect(result?.kind).toBe('generator-error');
    expect(gitDiffCalled).toBe(false);
  });

  it('reports output that never landed, without crashing on the missing file', () => {
    const result = runTarget(baseTarget, '/repo', {
      generate: () => 0,
      outputExists: () => false,
      gitDiff: () => {
        throw new Error('must not be called — there is nothing to diff');
      },
    });
    expect(result?.kind).toBe('no-output');
  });

  it('reports drift when the regenerated output differs from HEAD', () => {
    const result = runTarget(baseTarget, '/repo', {
      generate: () => 0,
      outputExists: () => true,
      gitDiff: () => '--- a/x\n+++ b/x\n',
    });
    expect(result?.kind).toBe('drift');
  });

  it('passes a clean regeneration', () => {
    const result = runTarget(baseTarget, '/repo', {
      generate: () => 0,
      outputExists: () => true,
      gitDiff: () => '',
    });
    expect(result).toBeNull();
  });
});

describe('the live repo', () => {
  it('discovers exactly EXPECTED_TARGETS', () => {
    const targets = discoverApiTypesTargets(repoRoot);
    const byPkg = new Map(targets.map((t) => [t.pkgName, t]));

    for (const pkgName of EXPECTED_TARGETS) {
      expect(byPkg.get(pkgName), `missing expected target ${pkgName}`).toBeDefined();
      expect(byPkg.get(pkgName)?.outputPath).toBe('src/contract/api-types.generated.ts');
    }
    expect(targets).toHaveLength(EXPECTED_TARGETS.length);
    expect(findExpectedTargetSetViolations(targets)).toEqual([]);
  });

  it('has no malformed target on the real repo', () => {
    const targets = discoverApiTypesTargets(repoRoot);
    const malformed = targets.filter((t) => t.outputPath === null);
    expect(malformed).toEqual([]);
  });
});

describe('findExpectedTargetSetViolations', () => {
  const [firstExpected] = EXPECTED_TARGETS;
  if (firstExpected === undefined) throw new Error('EXPECTED_TARGETS must not be empty');

  const clean: ApiTypesTarget[] = EXPECTED_TARGETS.map((pkgName) => ({
    pkgName,
    pkgDir: 'pillars/x',
    command: GENERATOR_COMMAND,
    outputPath: 'src/contract/api-types.generated.ts',
  }));
  const [firstFullTarget] = clean;
  if (firstFullTarget === undefined) throw new Error('clean must not be empty');

  it('reports nothing when the discovered set matches exactly', () => {
    expect(findExpectedTargetSetViolations(clean)).toEqual([]);
  });

  it('reports a dropped target', () => {
    const violations = findExpectedTargetSetViolations(clean.slice(1));
    expect(violations.some((message) => message.includes(firstExpected))).toBe(true);
  });

  it('reports a target that is not in EXPECTED_TARGETS', () => {
    const withExtra = [
      ...clean,
      {
        pkgName: '@pops/bogus',
        pkgDir: 'pillars/bogus',
        command: GENERATOR_COMMAND,
        outputPath: 'src/contract/api-types.generated.ts',
      },
    ];
    const violations = findExpectedTargetSetViolations(withExtra);
    expect(violations.some((message) => message.includes('@pops/bogus'))).toBe(true);
  });

  it('reports two units colliding on the same package name, instead of silently keeping one', () => {
    const colliding = { ...firstFullTarget, pkgDir: 'pillars/other' };
    const violations = findExpectedTargetSetViolations([colliding, ...clean]);
    expect(
      violations.some(
        (message) =>
          message.includes(firstFullTarget.pkgName) &&
          message.includes('pillars/other') &&
          message.includes(firstFullTarget.pkgDir)
      )
    ).toBe(true);
  });
});
