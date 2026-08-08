import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  classifyOutcome,
  discoverCandidateDirs,
  discoverGeneratedClientTargets,
  extractWriteTarget,
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
  it('discovers every known Hey API client target, split correctly across the app matrix', () => {
    const targets = discoverGeneratedClientTargets(repoRoot);
    const byKey = new Map(targets.map((t) => [`${t.pkgName}:${t.scriptName}`, t]));

    const expectedInAppMatrix = [
      '@pops/app-ai:generate:api',
      '@pops/app-bfm:generate:api',
      '@pops/app-cerebrum:generate:cerebrum-client',
      '@pops/app-finance:generate:finance-client',
      '@pops/app-finance:generate:contacts-client',
      '@pops/app-food:generate:food-client',
      '@pops/app-food:generate:lists-client',
      '@pops/app-inventory:generate:inventory-client',
      '@pops/app-lists:generate:lists-client',
      '@pops/app-media:generate:media-client',
    ];
    const expectedOutsideAppMatrix = [
      '@pops/shell:generate:registry-client',
      '@pops/overlay-ego:generate:ego-client',
    ];

    for (const key of expectedInAppMatrix) {
      expect(byKey.get(key), `missing app-matrix target ${key}`).toBeDefined();
      expect(byKey.get(key)?.inAppMatrix).toBe(true);
      expect(byKey.get(key)?.outputDir).not.toBeNull();
    }
    for (const key of expectedOutsideAppMatrix) {
      expect(byKey.get(key), `missing non-app-matrix target ${key}`).toBeDefined();
      expect(byKey.get(key)?.inAppMatrix).toBe(false);
      expect(byKey.get(key)?.outputDir).not.toBeNull();
    }
    expect(targets).toHaveLength(expectedInAppMatrix.length + expectedOutsideAppMatrix.length);
  });

  it('has no malformed target on the real repo', () => {
    const targets = discoverGeneratedClientTargets(repoRoot);
    const malformed = targets.filter((t) => t.outputDir === null);
    expect(malformed).toEqual([]);
  });
});
