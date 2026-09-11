/**
 * POPS-2092: `@types/node` major-pin guard.
 *
 * ADR-045: a guard ships with a test proving it REPORTS, not merely that it
 * passes. The tree agrees on major 24 today, so a suite that only ran the
 * guard would be green whether or not the comparison still works. These
 * drive the pure functions over ranges the guard must flag, ranges it must
 * not, and the real tree — so a matcher that silently stops matching, or a
 * discovery walk that silently stops finding packages, fails here.
 */

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, inject, it } from 'vitest';

import {
  checkTypesNodeMajor,
  expandWorkspaceGlob,
  pnpmWorkspaceGlobs,
  typesNodeMajor,
  workspacePackageDirs,
} from '../check-types-node-major.mjs';
import { passingProofStdout } from './real-tree-proofs.js';

describe('typesNodeMajor', () => {
  it.each([
    ['24', '24'],
    ['24.13.3', '24'],
    ['^24.13.3', '24'],
    ['~24', '24'],
    ['~24.19.0', '24'],
    ['24.x', '24'],
    ['24.x.x', '24'],
    ['>=24 <25', '24'],
  ])('%s -> %s', (range, expected) => {
    expect(typesNodeMajor(range)).toBe(expected);
  });

  it.each(['*', 'latest', '>=24 <26', 'workspace:*', '', '>=24.1', '>24.13.3'])(
    'rejects "%s" as unparseable rather than silently agreeing',
    (range) => {
      expect(typesNodeMajor(range)).toBeNull();
    }
  );
});

describe('pnpmWorkspaceGlobs', () => {
  it('reads the flat block-sequence form', () => {
    expect(pnpmWorkspaceGlobs("packages:\n  - 'pillars/*'\n  - 'libs/*'\n")).toEqual([
      'pillars/*',
      'libs/*',
    ]);
  });

  it('stops at the first non-entry line', () => {
    expect(pnpmWorkspaceGlobs("packages:\n  - 'libs/*'\n\nallowBuilds:\n  foo: true\n")).toEqual([
      'libs/*',
    ]);
  });
});

describe('workspace fixture scans', () => {
  const dirs: string[] = [];

  function fixture(): string {
    const dir = mkdtempSync(join(tmpdir(), 'types-node-major-test-'));
    dirs.push(dir);
    return dir;
  }

  function writeRoot(dir: string, canonRange: string, globs: string[] = ['libs/*']): void {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ devDependencies: { '@types/node': canonRange } }),
      'utf8'
    );
    writeFileSync(
      join(dir, 'pnpm-workspace.yaml'),
      `packages:\n${globs.map((glob) => `  - '${glob}'`).join('\n')}\n`,
      'utf8'
    );
  }

  function writePackage(
    dir: string,
    pkgDir: string,
    fields: Record<string, Record<string, string>>
  ): void {
    const full = join(dir, pkgDir);
    mkdirSync(full, { recursive: true });
    writeFileSync(join(full, 'package.json'), JSON.stringify({ name: pkgDir, ...fields }), 'utf8');
  }

  afterEach(() => {
    while (dirs.length > 0) {
      const dir = dirs.pop();
      if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags a package pinning a different major', () => {
    const dir = fixture();
    writeRoot(dir, '^24.13.3');
    writePackage(dir, 'libs/foo', { devDependencies: { '@types/node': '^22.0.0' } });
    const { violations } = checkTypesNodeMajor(dir);
    expect(violations).toHaveLength(1);
    expect(violations.join('\n')).toContain('libs/foo/package.json');
    expect(violations.join('\n')).toContain('major 22');
    expect(violations.join('\n')).toContain('canonical major is 24');
  });

  it('passes a package with no @types/node at all', () => {
    const dir = fixture();
    writeRoot(dir, '^24.13.3');
    writePackage(dir, 'libs/bar', {});
    const { violations, packages } = checkTypesNodeMajor(dir);
    expect(packages).toContain('libs/bar/package.json');
    expect(violations).toEqual([]);
  });

  it('passes a matching ^24.x range', () => {
    const dir = fixture();
    writeRoot(dir, '^24.13.3');
    writePackage(dir, 'libs/baz', { devDependencies: { '@types/node': '^24.5.0' } });
    expect(checkTypesNodeMajor(dir).violations).toEqual([]);
  });

  it.each(['~24', '24.x', '>=24 <25'])('reads the exotic range "%s" as major 24', (range) => {
    const dir = fixture();
    writeRoot(dir, '^24.13.3');
    writePackage(dir, 'libs/exotic', { devDependencies: { '@types/node': range } });
    expect(checkTypesNodeMajor(dir).violations).toEqual([]);
  });

  it('rejects an unparseable range loudly instead of passing it silently', () => {
    const dir = fixture();
    writeRoot(dir, '^24.13.3');
    writePackage(dir, 'libs/wild', { devDependencies: { '@types/node': '*' } });
    const { violations } = checkTypesNodeMajor(dir);
    expect(violations.join('\n')).toContain('libs/wild/package.json');
    expect(violations.join('\n')).toContain('no readable major');
  });

  it('checks peerDependencies too, not only dependencies/devDependencies', () => {
    const dir = fixture();
    writeRoot(dir, '^24.13.3');
    writePackage(dir, 'libs/peer', { peerDependencies: { '@types/node': '^22.4.0' } });
    const { violations } = checkTypesNodeMajor(dir);
    expect(violations.join('\n')).toContain('peerDependencies');
  });

  it('discovers a package directory added after the workspace was written', () => {
    const dir = fixture();
    writeRoot(dir, '^24.13.3');
    writePackage(dir, 'libs/existing', { devDependencies: { '@types/node': '^24.0.0' } });
    // Simulates a brand-new package landing on a branch: nothing about the
    // scan is told this directory exists ahead of time.
    writePackage(dir, 'libs/brand-new', { devDependencies: { '@types/node': '^24.0.0' } });
    const { packages } = checkTypesNodeMajor(dir);
    expect(packages).toContain('libs/brand-new/package.json');
  });

  it('fails on zero discovered packages rather than passing vacuously', () => {
    const dir = fixture();
    // 'libs/*' with no libs/ directory at all: the glob matches nothing.
    writeRoot(dir, '^24.13.3');
    const { violations, packages } = checkTypesNodeMajor(dir);
    expect(packages).toEqual([]);
    expect(violations.join('\n')).toContain('Discovered zero workspace packages');
  });

  it('reports when the root manifest itself has no readable canonical major', () => {
    const dir = fixture();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({}), 'utf8');
    writeFileSync(join(dir, 'pnpm-workspace.yaml'), "packages:\n  - 'libs/*'\n", 'utf8');
    writePackage(dir, 'libs/foo', {});
    const { violations } = checkTypesNodeMajor(dir);
    expect(violations.join('\n')).toContain('no canonical major');
  });

  it('expandWorkspaceGlob throws on a glob shape it cannot handle', () => {
    const dir = fixture();
    expect(() => expandWorkspaceGlob(dir, 'libs/foo-*')).toThrow(/unsupported workspace glob/u);
  });

  it('workspacePackageDirs sorts and skips node_modules', () => {
    const dir = fixture();
    writeRoot(dir, '^24.13.3');
    writePackage(dir, 'libs/zeta', {});
    writePackage(dir, 'libs/alpha', {});
    mkdirSync(join(dir, 'libs', 'node_modules', 'ghost'), { recursive: true });
    writeFileSync(
      join(dir, 'libs', 'node_modules', 'ghost', 'package.json'),
      JSON.stringify({}),
      'utf8'
    );
    const found = workspacePackageDirs(dir).map((d) => d.split('/').at(-1));
    expect(found).toEqual(['alpha', 'zeta']);
  });
});

describe('the guard as CI runs it', () => {
  // Discovery is the half a unit test cannot fake: a walk that finds nothing
  // reports nothing and exits 0. The guard carries its own floor; this proves
  // the floor is met by the real tree rather than by a fixture.
  it('passes on the real tree and says how many packages it looked at', () => {
    const stdout = passingProofStdout(inject('realTreeProofs'), 'check-types-node-major');
    const scanned = Number(/all (\d+) workspace packages/.exec(stdout)?.[1] ?? '0');
    expect(scanned).toBeGreaterThan(10);
    expect(stdout).toContain('OK —');
  });

  it('self-tests clean', () => {
    const stdout = passingProofStdout(inject('realTreeProofs'), 'check-types-node-major:self-test');
    expect(stdout).toContain('self-test OK');
  });

  it('reports the violation it exists for, against the real root pin', () => {
    // The real root package.json is the source of truth; a package that drifts
    // off it must be flagged by the real function, on the real tree.
    const rootManifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
      devDependencies?: Record<string, string>;
    };
    expect(rootManifest.devDependencies?.['@types/node']).toBe('^24.13.3');
    expect(typesNodeMajor(rootManifest.devDependencies?.['@types/node'] ?? '')).toBe('24');
  });
});
