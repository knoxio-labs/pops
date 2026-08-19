import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  classifyOutcome,
  discoverCandidateDirs,
  discoverOpenApiTargets,
  EXPECTED_TARGETS,
  findExpectedTargetSetViolations,
  type OpenApiTarget,
  runTarget,
} from '../check-openapi-drift.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const guardPath = resolve(here, '..', 'check-openapi-drift.mjs');

const GENERATOR_COMMAND = 'tsx scripts/generate-openapi.ts';

const created: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'openapi-drift-'));
  created.push(root);
  return root;
}

function writePackage(
  root: string,
  dir: string,
  manifest: { name?: string; scripts?: Record<string, string> }
): void {
  mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, dir, 'package.json'), JSON.stringify(manifest));
}

afterEach(() => {
  while (created.length > 0) rmSync(created.pop() as string, { recursive: true, force: true });
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

describe('discoverOpenApiTargets', () => {
  it('finds a well-formed target, ignores a command mismatch and decoys', () => {
    const root = fixtureRoot();
    writePackage(root, 'pillars/widgets', {
      name: '@pops/widgets',
      scripts: { 'generate:openapi': GENERATOR_COMMAND },
    });
    writePackage(root, 'pillars/decoy', {
      name: '@pops/decoy',
      scripts: {
        'generate:api-types': 'tsx scripts/generate-api-types.ts',
        'generate:manifest': 'tsx scripts/generate-manifest.ts',
      },
    });
    writePackage(root, 'pillars/different-command', {
      name: '@pops/different-command',
      scripts: { 'generate:openapi': 'tsx scripts/generate-legacy-openapi.ts' },
    });

    const targets = discoverOpenApiTargets(root);
    const byPkg = new Map(targets.map((t) => [t.pkgName, t]));

    expect(targets).toHaveLength(1);
    expect(byPkg.get('@pops/widgets')).toMatchObject({
      pillarId: 'widgets',
      outputPath: 'openapi/widgets.openapi.json',
    });
    expect(byPkg.has('@pops/decoy')).toBe(false);
    expect(byPkg.has('@pops/different-command')).toBe(false);
  });

  it('skips a unit whose package.json has no readable name', () => {
    const root = fixtureRoot();
    mkdirSync(join(root, 'pillars', 'nameless'), { recursive: true });
    writeFileSync(
      join(root, 'pillars', 'nameless', 'package.json'),
      JSON.stringify({ scripts: { 'generate:openapi': GENERATOR_COMMAND } })
    );
    expect(discoverOpenApiTargets(root)).toEqual([]);
  });

  it('returns nothing for a unit with no package.json', () => {
    const root = fixtureRoot();
    mkdirSync(join(root, 'pillars', 'empty'), { recursive: true });
    expect(discoverOpenApiTargets(root)).toEqual([]);
  });

  it('never scans pillars/<id>/app', () => {
    const root = fixtureRoot();
    writePackage(root, 'pillars/widgets/app', {
      name: '@pops/app-widgets',
      scripts: { 'generate:openapi': GENERATOR_COMMAND },
    });
    expect(discoverOpenApiTargets(root)).toEqual([]);
  });
});

const baseTarget: OpenApiTarget = {
  pkgName: '@pops/widgets',
  pkgDir: 'pillars/widgets',
  pillarId: 'widgets',
  command: GENERATOR_COMMAND,
  outputPath: 'openapi/widgets.openapi.json',
};

describe('classifyOutcome', () => {
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

function fakeBackup(): {
  restore: () => void;
  discard: () => void;
  restored: boolean;
  discarded: boolean;
} {
  const state = { restored: false, discarded: false };
  return {
    restore: () => {
      state.restored = true;
    },
    discard: () => {
      state.discarded = true;
    },
    get restored() {
      return state.restored;
    },
    get discarded() {
      return state.discarded;
    },
  };
}

describe('runTarget — reports rather than silently passing on a degenerate run', () => {
  it('reports a generator that errors without ever touching the filesystem or git', () => {
    let touched = false;
    const result = runTarget(baseTarget, '/repo', {
      clearOutput: fakeBackup,
      generate: () => 1,
      outputExists: () => {
        touched = true;
        return true;
      },
      gitDiff: () => {
        touched = true;
        return '';
      },
    });
    expect(result?.kind).toBe('generator-error');
    expect(touched).toBe(false);
  });

  it('reports output that never landed, without crashing on the missing file', () => {
    const result = runTarget(baseTarget, '/repo', {
      clearOutput: fakeBackup,
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
      clearOutput: fakeBackup,
      generate: () => 0,
      outputExists: () => true,
      gitDiff: () => '--- a/x\n+++ b/x\n',
    });
    expect(result?.kind).toBe('drift');
  });

  it('passes a clean regeneration', () => {
    const result = runTarget(baseTarget, '/repo', {
      clearOutput: fakeBackup,
      generate: () => 0,
      outputExists: () => true,
      gitDiff: () => '',
    });
    expect(result).toBeNull();
  });

  it('restores the backup on a generator error, instead of leaving the output cleared', () => {
    const backup = fakeBackup();
    runTarget(baseTarget, '/repo', {
      clearOutput: () => backup,
      generate: () => 1,
      outputExists: () => false,
      gitDiff: () => '',
    });
    expect(backup.restored).toBe(true);
    expect(backup.discarded).toBe(false);
  });

  it('restores the backup when output never landed', () => {
    const backup = fakeBackup();
    runTarget(baseTarget, '/repo', {
      clearOutput: () => backup,
      generate: () => 0,
      outputExists: () => false,
      gitDiff: () => '',
    });
    expect(backup.restored).toBe(true);
  });

  it('discards, rather than restores, the backup on a clean regeneration', () => {
    const backup = fakeBackup();
    runTarget(baseTarget, '/repo', {
      clearOutput: () => backup,
      generate: () => 0,
      outputExists: () => true,
      gitDiff: () => '',
    });
    expect(backup.discarded).toBe(true);
    expect(backup.restored).toBe(false);
  });

  it('restores the backup and rethrows when the runner throws mid-run', () => {
    const backup = fakeBackup();
    expect(() =>
      runTarget(baseTarget, '/repo', {
        clearOutput: () => backup,
        generate: () => {
          throw new Error('simulated crash mid-run');
        },
        outputExists: () => false,
        gitDiff: () => '',
      })
    ).toThrow('simulated crash mid-run');
    expect(backup.restored).toBe(true);
  });
});

describe('POPS-2216 — a filter that matches nothing must not pass vacuously', () => {
  it('pnpm --filter <bogus> --fail-if-no-match exits non-zero against the real pnpm binary', () => {
    expect(() =>
      execFileSync(
        'pnpm',
        [
          '--filter',
          '@pops/does-not-exist-openapi-drift-vitest',
          '--fail-if-no-match',
          'generate:openapi',
        ],
        { cwd: repoRoot, stdio: 'pipe' }
      )
    ).toThrow();
  });

  it('the guard self-test includes the fail-if-no-match and real-runner clearOutput checks', () => {
    const stdout = execFileSync('node', [guardPath, '--self-test'], { encoding: 'utf8' });
    expect(stdout).toContain('fail-if-no-match exits');
    expect(stdout).toContain('realRunner.clearOutput clears the committed file');
  });
});

describe('the live repo', () => {
  it('discovers exactly EXPECTED_TARGETS, each at openapi/<pillarId>.openapi.json', () => {
    const targets = discoverOpenApiTargets(repoRoot);
    const byPkg = new Map(targets.map((t) => [t.pkgName, t]));

    for (const pkgName of EXPECTED_TARGETS) {
      const target = byPkg.get(pkgName);
      expect(target, `missing expected target ${pkgName}`).toBeDefined();
      expect(target?.outputPath).toBe(`openapi/${target?.pillarId}.openapi.json`);
    }
    expect(targets).toHaveLength(EXPECTED_TARGETS.length);
    expect(findExpectedTargetSetViolations(targets)).toEqual([]);
  });
});

describe('findExpectedTargetSetViolations', () => {
  const [firstExpected] = EXPECTED_TARGETS;
  if (firstExpected === undefined) throw new Error('EXPECTED_TARGETS must not be empty');

  const clean: OpenApiTarget[] = EXPECTED_TARGETS.map((pkgName) => {
    const pillarId = pkgName.slice('@pops/'.length);
    return {
      pkgName,
      pkgDir: `pillars/${pillarId}`,
      pillarId,
      command: GENERATOR_COMMAND,
      outputPath: `openapi/${pillarId}.openapi.json`,
    };
  });
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
        pillarId: 'bogus',
        command: GENERATOR_COMMAND,
        outputPath: 'openapi/bogus.openapi.json',
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

describe('the guard CLI', () => {
  it('prints usage and exits 2 on --help', () => {
    expect(() => execFileSync('node', [guardPath, '--help'], { stdio: 'pipe' })).toThrow();
    try {
      execFileSync('node', [guardPath, '--help'], { stdio: 'pipe' });
    } catch (error) {
      expect((error as { status: number }).status).toBe(2);
    }
  });

  it('its self-test passes, including the independent real-repo pin', () => {
    const stdout = execFileSync('node', [guardPath, '--self-test'], { encoding: 'utf8' });
    expect(stdout).toContain(
      `self-test OK — discovers exactly the ${EXPECTED_TARGETS.length} pillars EXPECTED_TARGETS pins`
    );
  });
});
