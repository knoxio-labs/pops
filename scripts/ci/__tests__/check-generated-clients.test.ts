import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  classifyOutcome,
  discoverCandidateDirs,
  discoverGeneratedClientTargets,
  EXPECTED_TARGETS,
  extractWriteTarget,
  findExpectedTargetSetViolations,
  type GeneratedClientTarget,
  invokesHeyApiGenerator,
  isAppMatrixDir,
  runTarget,
} from '../check-generated-clients.mjs';
import { gitEnv } from '../resolve-report-base.mjs';
import { commit, fixtureRepo, write } from './git-fixture.js';

const REAL_SUBPROCESS_TIMEOUT_MS = 180_000;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

const created: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'generated-clients-'));
  created.push(root);
  return root;
}

function writePackage(
  root: string,
  dir: string,
  manifest: { name: string; scripts?: Record<string, string> }
): void {
  mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, dir, 'package.json'), JSON.stringify(manifest));
}

afterEach(() => {
  while (created.length > 0) rmSync(created.pop() as string, { recursive: true, force: true });
});

describe('invokesHeyApiGenerator', () => {
  it('matches the plain form', () => {
    expect(invokesHeyApiGenerator('openapi-ts && oxfmt --write src/foo-api')).toBe(true);
  });

  it('matches a config-flag form', () => {
    expect(
      invokesHeyApiGenerator('openapi-ts -f openapi-ts.contacts.config.ts && oxfmt --write src/x')
    ).toBe(true);
  });

  it('matches when openapi-ts is not the first step', () => {
    expect(invokesHeyApiGenerator('rimraf src/x && openapi-ts && oxfmt --write src/x')).toBe(true);
  });

  it('does not match a script that merely contains the token as a substring', () => {
    expect(invokesHeyApiGenerator('tsx scripts/generate-openapi.ts')).toBe(false);
  });

  it('does not match unrelated generate scripts', () => {
    expect(invokesHeyApiGenerator('tsx scripts/generate-manifest.ts')).toBe(false);
    expect(invokesHeyApiGenerator('tsx scripts/generate-api-types.ts')).toBe(false);
    expect(invokesHeyApiGenerator('tsx scripts/generate-prompt-catalog.ts')).toBe(false);
  });

  it('matches a pnpm exec wrapper', () => {
    expect(invokesHeyApiGenerator('pnpm exec openapi-ts && oxfmt --write src/x')).toBe(true);
  });

  it('matches an npx wrapper', () => {
    expect(
      invokesHeyApiGenerator('npx openapi-ts -f custom.config.ts && oxfmt --write src/x')
    ).toBe(true);
  });

  it('matches an env-var-prefixed invocation', () => {
    expect(
      invokesHeyApiGenerator(
        'NODE_OPTIONS=--max-old-space-size=4096 openapi-ts && oxfmt --write src/x'
      )
    ).toBe(true);
  });

  it('matches a semicolon-separated script', () => {
    expect(invokesHeyApiGenerator('openapi-ts; oxfmt --write src/x')).toBe(true);
  });

  it('matches an env-var-prefixed pnpm exec wrapper', () => {
    expect(invokesHeyApiGenerator('CI=true pnpm exec openapi-ts && oxfmt --write src/x')).toBe(
      true
    );
  });

  it('does not match an env assignment alone, with no generator step', () => {
    expect(
      invokesHeyApiGenerator('NODE_OPTIONS=--max-old-space-size=4096 oxfmt --write src/x')
    ).toBe(false);
  });
});

describe('extractWriteTarget', () => {
  it('reads the --write argument', () => {
    expect(extractWriteTarget('openapi-ts && oxfmt --write src/foo-api')).toBe('src/foo-api');
  });

  it('returns null when there is none', () => {
    expect(extractWriteTarget('openapi-ts')).toBeNull();
  });
});

describe('isAppMatrixDir', () => {
  it('matches a pillars/<id>/app unit', () => {
    expect(isAppMatrixDir('pillars/finance/app')).toBe(true);
  });

  it('does not match a pillar-level unit', () => {
    expect(isAppMatrixDir('pillars/shell')).toBe(false);
  });

  it('does not match a lib', () => {
    expect(isAppMatrixDir('libs/overlay-ego')).toBe(false);
  });

  it('does not match a nested app nested further', () => {
    expect(isAppMatrixDir('pillars/finance/app/nested')).toBe(false);
  });
});

describe('discoverCandidateDirs', () => {
  it('lists every pillar, every pillars/*/app with a package.json, and every lib', () => {
    const root = fixtureRoot();
    writePackage(root, 'pillars/alpha', { name: '@pops/alpha' });
    writePackage(root, 'pillars/alpha/app', { name: '@pops/app-alpha' });
    writePackage(root, 'pillars/beta', { name: '@pops/beta' });
    mkdirSync(join(root, 'pillars', 'beta', 'app'), { recursive: true }); // no package.json
    writePackage(root, 'libs/widget-lib', { name: '@pops/widget-lib' });

    expect(discoverCandidateDirs(root)).toEqual(
      ['libs/widget-lib', 'pillars/alpha', 'pillars/alpha/app', 'pillars/beta'].toSorted((a, b) =>
        a.localeCompare(b)
      )
    );
  });

  it('returns an empty list when neither pillars nor libs exist', () => {
    const root = fixtureRoot();
    expect(discoverCandidateDirs(root)).toEqual([]);
  });
});

describe('discoverGeneratedClientTargets', () => {
  it('finds an app-matrix target and a non-app-matrix target, flags a malformed one, ignores decoys', () => {
    const root = fixtureRoot();
    writePackage(root, 'pillars/widgets/app', {
      name: '@pops/app-widgets',
      scripts: { 'generate:api': 'openapi-ts && oxfmt --write src/widgets-api' },
    });
    writePackage(root, 'libs/overlay-widgets', {
      name: '@pops/overlay-widgets',
      scripts: { 'generate:client': 'openapi-ts && oxfmt --write src/widgets-api' },
    });
    writePackage(root, 'pillars/broken', {
      name: '@pops/broken',
      scripts: { 'generate:client': 'openapi-ts' },
    });
    writePackage(root, 'pillars/decoy', {
      name: '@pops/decoy',
      scripts: {
        'generate:openapi': 'tsx scripts/generate-openapi.ts',
        'generate:manifest': 'tsx scripts/generate-manifest.ts',
        build: 'tsc -b',
      },
    });

    const targets = discoverGeneratedClientTargets(root);
    const byPkg = new Map(targets.map((t) => [t.pkgName, t]));

    expect(targets).toHaveLength(3);
    expect(byPkg.get('@pops/app-widgets')).toMatchObject({
      inAppMatrix: true,
      outputDir: 'src/widgets-api',
    });
    expect(byPkg.get('@pops/overlay-widgets')).toMatchObject({
      inAppMatrix: false,
      outputDir: 'src/widgets-api',
    });
    expect(byPkg.get('@pops/broken')).toMatchObject({ outputDir: null });
    expect(byPkg.has('@pops/decoy')).toBe(false);
  });

  it('finds two targets in one package (an own client and a cross-pillar client)', () => {
    const root = fixtureRoot();
    writePackage(root, 'pillars/consumer/app', {
      name: '@pops/app-consumer',
      scripts: {
        'generate:consumer-client': 'openapi-ts && oxfmt --write src/consumer-api',
        'generate:producer-client':
          'openapi-ts -f openapi-ts.producer.config.ts && oxfmt --write src/producer-api',
      },
    });

    expect(discoverGeneratedClientTargets(root)).toHaveLength(2);
  });

  it('skips a unit whose package.json has no readable name', () => {
    const root = fixtureRoot();
    mkdirSync(join(root, 'pillars', 'nameless'), { recursive: true });
    writeFileSync(
      join(root, 'pillars', 'nameless', 'package.json'),
      JSON.stringify({ scripts: { 'generate:api': 'openapi-ts && oxfmt --write src/x' } })
    );
    expect(discoverGeneratedClientTargets(root)).toEqual([]);
  });

  it('returns nothing for a unit with no package.json', () => {
    const root = fixtureRoot();
    mkdirSync(join(root, 'pillars', 'empty'), { recursive: true });
    expect(discoverGeneratedClientTargets(root)).toEqual([]);
  });

  it('still discovers a target whose script uses pnpm exec, npx, an env prefix, or a semicolon separator', () => {
    const root = fixtureRoot();
    writePackage(root, 'pillars/pnpm-wrapped/app', {
      name: '@pops/app-pnpm-wrapped',
      scripts: { 'generate:api': 'pnpm exec openapi-ts && oxfmt --write src/x' },
    });
    writePackage(root, 'pillars/npx-wrapped/app', {
      name: '@pops/app-npx-wrapped',
      scripts: { 'generate:api': 'npx openapi-ts && oxfmt --write src/x' },
    });
    writePackage(root, 'pillars/env-prefixed/app', {
      name: '@pops/app-env-prefixed',
      scripts: {
        'generate:api': 'NODE_OPTIONS=--max-old-space-size=4096 openapi-ts && oxfmt --write src/x',
      },
    });
    writePackage(root, 'pillars/semicolon-separated/app', {
      name: '@pops/app-semicolon-separated',
      scripts: { 'generate:api': 'openapi-ts; oxfmt --write src/x' },
    });

    const targets = discoverGeneratedClientTargets(root);
    const byPkg = new Map(targets.map((t) => [t.pkgName, t]));

    expect(targets).toHaveLength(4);
    for (const pkgName of [
      '@pops/app-pnpm-wrapped',
      '@pops/app-npx-wrapped',
      '@pops/app-env-prefixed',
      '@pops/app-semicolon-separated',
    ]) {
      expect(byPkg.get(pkgName), `missing target ${pkgName}`).toMatchObject({
        outputDir: 'src/x',
        inAppMatrix: true,
      });
    }
  });
});

const baseTarget: GeneratedClientTarget = {
  pkgName: '@pops/app-widgets',
  pkgDir: 'pillars/widgets/app',
  scriptName: 'generate:api',
  command: 'openapi-ts && oxfmt --write src/widgets-api',
  outputDir: 'src/widgets-api',
  inAppMatrix: true,
};

describe('classifyOutcome', () => {
  it('flags a malformed target regardless of the outcome fields', () => {
    const target = { ...baseTarget, outputDir: null, command: 'openapi-ts' };
    const result = classifyOutcome(target, { exitCode: 0, outputFileCount: 4, gitDiff: '' });
    expect(result?.kind).toBe('malformed');
  });

  it('flags a generator error', () => {
    const result = classifyOutcome(baseTarget, { exitCode: 1, outputFileCount: 0, gitDiff: null });
    expect(result?.kind).toBe('generator-error');
  });

  it('flags a missing output directory', () => {
    const result = classifyOutcome(baseTarget, {
      exitCode: 0,
      outputFileCount: null,
      gitDiff: null,
    });
    expect(result?.kind).toBe('no-output');
  });

  it('flags an empty output directory', () => {
    const result = classifyOutcome(baseTarget, { exitCode: 0, outputFileCount: 0, gitDiff: null });
    expect(result?.kind).toBe('no-output');
  });

  it('flags drift and carries the diff in the message', () => {
    const result = classifyOutcome(baseTarget, {
      exitCode: 0,
      outputFileCount: 4,
      gitDiff: '--- a/x\n+++ b/x\n',
    });
    expect(result?.kind).toBe('drift');
    expect(result?.message).toContain('--- a/x');
  });

  it('passes a clean regeneration', () => {
    const result = classifyOutcome(baseTarget, { exitCode: 0, outputFileCount: 4, gitDiff: '' });
    expect(result).toBeNull();
  });
});

describe('runTarget — reports rather than silently passing on a degenerate run', () => {
  it('never invokes the generator for a malformed target, and still reports it', () => {
    const target = { ...baseTarget, outputDir: null };
    let called = false;
    const result = runTarget(target, '/repo', {
      generate: () => {
        called = true;
        return 0;
      },
      countOutputFiles: () => 4,
      gitDiff: () => '',
    });
    expect(called).toBe(false);
    expect(result?.kind).toBe('malformed');
  });

  it('reports a generator that errors without ever touching git', () => {
    let gitDiffCalled = false;
    const result = runTarget(baseTarget, '/repo', {
      generate: () => 1,
      countOutputFiles: () => 0,
      gitDiff: () => {
        gitDiffCalled = true;
        return '';
      },
    });
    expect(result?.kind).toBe('generator-error');
    expect(gitDiffCalled).toBe(false);
  });

  it('reports output that never landed, without crashing on the missing directory', () => {
    const result = runTarget(baseTarget, '/repo', {
      generate: () => 0,
      countOutputFiles: () => 0,
      gitDiff: () => {
        throw new Error('must not be called — there is nothing to diff');
      },
    });
    expect(result?.kind).toBe('no-output');
  });

  it('reports drift when the regenerated output differs from HEAD', () => {
    const result = runTarget(baseTarget, '/repo', {
      generate: () => 0,
      countOutputFiles: () => 4,
      gitDiff: () => '--- a/x\n+++ b/x\n',
    });
    expect(result?.kind).toBe('drift');
  });

  it('passes a clean regeneration', () => {
    const result = runTarget(baseTarget, '/repo', {
      generate: () => 0,
      countOutputFiles: () => 4,
      gitDiff: () => '',
    });
    expect(result).toBeNull();
  });
});

describe('the live repo', () => {
  it('discovers exactly EXPECTED_TARGETS, split correctly across the app matrix', () => {
    // EXPECTED_TARGETS lives next to the guard (check-generated-clients.mjs) so the
    // guard itself — not only this suite — fails when a target is gained, lost, or
    // moves across the app-matrix boundary. This test proves discovery still agrees
    // with that pinned set; it is not a second, independently-maintained list.
    const targets = discoverGeneratedClientTargets(repoRoot);
    const byKey = new Map(targets.map((t) => [`${t.pkgName}:${t.scriptName}`, t]));

    for (const expected of EXPECTED_TARGETS) {
      const key = `${expected.pkgName}:${expected.scriptName}`;
      expect(byKey.get(key), `missing expected target ${key}`).toBeDefined();
      expect(byKey.get(key)?.inAppMatrix).toBe(expected.inAppMatrix);
      expect(byKey.get(key)?.outputDir).not.toBeNull();
    }
    expect(targets).toHaveLength(EXPECTED_TARGETS.length);
    expect(findExpectedTargetSetViolations(targets)).toEqual([]);
  });

  it('has no malformed target on the real repo', () => {
    const targets = discoverGeneratedClientTargets(repoRoot);
    const malformed = targets.filter((t) => t.outputDir === null);
    expect(malformed).toEqual([]);
  });
});

describe('findExpectedTargetSetViolations', () => {
  const [firstExpected] = EXPECTED_TARGETS;
  if (firstExpected === undefined) throw new Error('EXPECTED_TARGETS must not be empty');
  const firstExpectedKey = `${firstExpected.pkgName}:${firstExpected.scriptName}`;

  const clean: GeneratedClientTarget[] = EXPECTED_TARGETS.map((expected) => ({
    ...expected,
    pkgDir: 'pillars/x/app',
    command: 'openapi-ts && oxfmt --write src/x-api',
    outputDir: 'src/x-api',
  }));
  const [firstFullTarget] = clean;
  if (firstFullTarget === undefined) throw new Error('clean must not be empty');

  it('reports nothing when the discovered set matches exactly', () => {
    expect(findExpectedTargetSetViolations(clean)).toEqual([]);
  });

  it('reports a dropped target', () => {
    const violations = findExpectedTargetSetViolations(clean.slice(1));
    expect(violations.some((message) => message.includes(firstExpectedKey))).toBe(true);
  });

  it('reports a target that is not in EXPECTED_TARGETS', () => {
    const withExtra = [
      ...clean,
      {
        pkgName: '@pops/app-bogus',
        scriptName: 'generate:bogus-client',
        inAppMatrix: true,
        pkgDir: 'pillars/bogus/app',
        command: 'openapi-ts && oxfmt --write src/x-api',
        outputDir: 'src/x-api',
      },
    ];
    const violations = findExpectedTargetSetViolations(withExtra);
    expect(violations.some((message) => message.includes('@pops/app-bogus'))).toBe(true);
  });

  it('reports a target that moved across the app-matrix boundary', () => {
    const moved = clean.map((target, index) =>
      index === 0 ? { ...target, inAppMatrix: !target.inAppMatrix } : target
    );
    const violations = findExpectedTargetSetViolations(moved);
    expect(violations.some((message) => message.includes(firstExpectedKey))).toBe(true);
  });

  it('reports two units colliding on the same pkgName:scriptName key, instead of silently keeping one', () => {
    // A naive `new Map(targets.map(...))` collapses duplicates and keeps whichever comes
    // last, which would let this check pass even though discovery returned an ambiguous
    // result — this is the degenerate case that guards against that.
    const colliding = { ...firstFullTarget, pkgDir: 'pillars/other/app' };
    const violations = findExpectedTargetSetViolations([colliding, ...clean]);
    expect(
      violations.some(
        (message) =>
          message.includes(firstExpectedKey) &&
          message.includes('pillars/other/app') &&
          message.includes(firstFullTarget.pkgDir)
      )
    ).toBe(true);
  });
});

/**
 * The bug this guards against: every failure branch in `main()` used a bare
 * `return` inside `try { ... } finally { cleanupMergeRoot }`, which runs the
 * `finally` and returns from the function without ever reaching the
 * `process.exit(exitCode)` that followed the try/finally. `check-generated-clients.mjs`
 * printed `FAIL` and exited 0 regardless — CI invokes it directly
 * (`quality.yml`, `app-quality.yml`), so real drift passed. A test that only
 * inspects stdout, like the ones above, cannot see this: it has to spawn the
 * real binary and read its exit code.
 *
 * The exit-code cases below spawn the real `check-generated-clients.mjs` —
 * not a reimplementation of it — but never against this repo's own working
 * tree: `main()` derives its `repoRoot` from its own file location
 * (`import.meta.url`), not from `cwd`, so a fixture is built by copying the
 * real script next to one throwaway generated-client package, inside a
 * `git init` fixture (see `git-fixture.ts`, shared with
 * `check-generated-clients-merge-ref.test.ts`), and pointing `PATH` at a fake
 * `pnpm` that stands in for the real generator. The real drift case used to
 * mutate this repo's own checked-in registry OpenAPI spec and regenerate the
 * shell's real client in place — at least 15 other test files read one or
 * the other of those, so a parallel `mise run test` fan-out or an
 * interrupted run could observe, or leave behind, a mutated tracked file.
 * Nothing under `scripts/ci` may write to a tracked file in this repo's own
 * working tree; the fixture makes that unnecessary.
 */
describe('the real CLI, spawned as a subprocess', { timeout: REAL_SUBPROCESS_TIMEOUT_MS }, () => {
  const script = join(repoRoot, 'scripts', 'ci', 'check-generated-clients.mjs');

  /** `pkgName`/`scriptName` the fixture's own `EXPECTED_TARGETS` patch pins. */
  const FIXTURE_PKG_NAME = '@pops/fixture';
  const FIXTURE_SCRIPT_NAME = 'generate:fixture-client';

  function runCli(args: string[]): { status: number | null; output: string } {
    const result = spawnSync('node', [script, ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: gitEnv(),
    });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  }

  function countWorktrees(): number {
    return execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: gitEnv(),
    })
      .split('\n')
      .filter((line) => line.startsWith('worktree ')).length;
  }

  /**
   * A `git init` fixture that carries its own copy of the real
   * `check-generated-clients.mjs` (so `main()`'s `import.meta.url`-derived
   * `repoRoot` resolves to the fixture, never to this repo), one throwaway
   * unit whose `generate:*` script matches `invokesHeyApiGenerator`, and a
   * fake `pnpm` on `PATH` that regenerates that unit's declared output file
   * from a `source.txt` — standing in for `openapi-ts` the same way
   * `check-generated-clients-merge-ref.test.ts`'s `fakeGenerate` does, just
   * reached through the real spawned binary instead of an injected `Runner`.
   * `EXPECTED_TARGETS` is patched to the fixture's own single target — the
   * real, 14-entry pinned list is a repo-wide invariant this fixture cannot
   * and should not satisfy.
   */
  function buildRealCliFixture(): { root: string; fakeBinDir: string } {
    const root = fixtureRepo();
    created.push(root);

    const fakeBinDir = join(root, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    const fakePnpm = join(fakeBinDir, 'pnpm');
    writeFileSync(
      fakePnpm,
      [
        '#!/usr/bin/env node',
        "const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');",
        "const { dirname, join } = require('node:path');",
        'const args = process.argv.slice(2);',
        "const filterIndex = args.indexOf('--filter');",
        `if (filterIndex !== -1 && args[filterIndex + 2] === ${JSON.stringify(FIXTURE_SCRIPT_NAME)}) {`,
        "  const source = readFileSync(join(process.cwd(), 'source.txt'), 'utf8').trim();",
        "  const outPath = join(process.cwd(), 'pillars', 'fixture', 'gen', 'output.txt');",
        '  mkdirSync(dirname(outPath), { recursive: true });',
        '  writeFileSync(outPath, `gen(${source})`);',
        '}',
        'process.exit(0);',
        '',
      ].join('\n')
    );
    chmodSync(fakePnpm, 0o755);

    write(
      root,
      'pillars/fixture/package.json',
      JSON.stringify({
        name: FIXTURE_PKG_NAME,
        scripts: { [FIXTURE_SCRIPT_NAME]: 'openapi-ts && oxfmt --write gen' },
      })
    );
    write(root, 'source.txt', 'A');
    write(root, 'pillars/fixture/gen/output.txt', 'gen(A)');
    commit(root, 'fixture: clean baseline — source=A, gen=gen(A)');

    const realSource = readFileSync(script, 'utf8');
    const fixtureExpectedTargets = [
      { pkgName: FIXTURE_PKG_NAME, scriptName: FIXTURE_SCRIPT_NAME, inAppMatrix: false },
    ];
    const patched = realSource.replace(
      /export const EXPECTED_TARGETS = \[[\s\S]*?\n\];/,
      `export const EXPECTED_TARGETS = ${JSON.stringify(fixtureExpectedTargets)};`
    );
    if (patched === realSource) {
      throw new Error(
        'could not find EXPECTED_TARGETS in check-generated-clients.mjs to patch for the fixture ' +
          "— the real file's shape changed."
      );
    }
    write(root, 'scripts/ci/check-generated-clients.mjs', patched);

    return { root, fakeBinDir };
  }

  function runFixtureCli(
    root: string,
    fakeBinDir: string,
    args: string[]
  ): { status: number | null; output: string } {
    const result = spawnSync(
      'node',
      [join(root, 'scripts', 'ci', 'check-generated-clients.mjs'), ...args],
      {
        cwd: root,
        encoding: 'utf8',
        env: gitEnv({ PATH: `${fakeBinDir}${delimiter}${process.env.PATH ?? ''}` }),
      }
    );
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  }

  it('exits 0 on a clean run — the success path is not accidentally broken by the fix', () => {
    const { root, fakeBinDir } = buildRealCliFixture();

    const { status, output } = runFixtureCli(root, fakeBinDir, ['--exclude-app-matrix']);

    expect(output).toContain('OK —');
    expect(status).toBe(0);
  });

  it('exits 1, not 0, when discovery matches nothing for --pkg — the empty-target-set failure branch', () => {
    const { status, output } = runCli(['--pkg', 'does-not-exist-anywhere']);
    expect(output).toContain('FAIL —');
    expect(status).toBe(1);
  });

  it('exits 1, not 0, on real drift against a checked-in client', () => {
    const { root, fakeBinDir } = buildRealCliFixture();
    // Mutate the "spec" without regenerating the checked-in "client" —
    // the same shape as the original bug: a contract changes, the generated
    // output does not, and the guard must still catch it.
    write(root, 'source.txt', 'B');

    const { status, output } = runFixtureCli(root, fakeBinDir, ['--pkg', FIXTURE_PKG_NAME]);

    expect(output).toContain('FAIL —');
    expect(output).toContain('drift');
    expect(status).toBe(1);
  });

  it('with --base, removes the disposable merge worktree even after a failing run', () => {
    const before = countWorktrees();

    const { status, output } = runCli(['--base', 'HEAD', '--pkg', 'does-not-exist-anywhere']);

    expect(output).toContain('FAIL —');
    expect(status).toBe(1);
    expect(countWorktrees()).toBe(before);
  });
});
