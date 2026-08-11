import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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
