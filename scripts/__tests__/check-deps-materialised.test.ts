/**
 * The preflight that stops a lint or format gate running before `pnpm install`.
 *
 * The passing path is what already happens on every developer machine, so it
 * proves nothing on its own. What is asserted here is the failing path — that
 * an unmaterialised workspace is actually reported — and the two ways a lazy
 * implementation would get the right answer for the wrong reason: checking only
 * the repo root (which is present in the partial case that produced POPS-2400),
 * or requiring `node_modules` of a package that declares no dependencies and
 * legitimately has none.
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { unmaterialisedPackages } from '../check-deps-materialised.mjs';

let root: string;

const WORKSPACE = ['packages:', "  - 'pillars/*'", "  - 'pillars/*/*'", "  - 'libs/*'", ''].join(
  '\n'
);

function pkg(dir: string, manifest: Record<string, unknown>): void {
  mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, dir, 'package.json'), JSON.stringify(manifest));
}

function installed(dir: string): void {
  mkdirSync(join(root, dir, 'node_modules'), { recursive: true });
}

function rootInstalled(): void {
  mkdirSync(join(root, 'node_modules'), { recursive: true });
  writeFileSync(join(root, 'node_modules', '.modules.yaml'), 'hoistPattern:\n');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deps-preflight-'));
  writeFileSync(join(root, 'pnpm-workspace.yaml'), WORKSPACE);
  pkg('.', { name: 'root', devDependencies: { oxlint: '1.0.0' } });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('unmaterialisedPackages', () => {
  it('reports a workspace with nothing installed at all', () => {
    pkg('libs/ui', { name: '@pops/ui', dependencies: { react: '19.0.0' } });

    expect(unmaterialisedPackages(root)).toEqual(['.', 'libs/ui']);
  });

  it('is silent once every package with dependencies is installed', () => {
    rootInstalled();
    pkg('libs/ui', { name: '@pops/ui', dependencies: { react: '19.0.0' } });
    installed('libs/ui');

    expect(unmaterialisedPackages(root)).toEqual([]);
  });

  it('reports the PARTIAL case — the root is installed and a package is not', () => {
    rootInstalled();
    pkg('libs/ui', { name: '@pops/ui', dependencies: { react: '19.0.0' } });

    expect(unmaterialisedPackages(root)).toEqual(['libs/ui']);
  });

  it('does not demand node_modules of a package that declares no dependencies', () => {
    rootInstalled();
    pkg('libs/locales', { name: '@pops/locales', version: '1.0.0' });

    expect(unmaterialisedPackages(root)).toEqual([]);
  });

  it('counts devDependencies and peerDependencies, not just dependencies', () => {
    rootInstalled();
    pkg('libs/a', { name: 'a', devDependencies: { vitest: '4.0.0' } });
    pkg('libs/b', { name: 'b', peerDependencies: { react: '19.0.0' } });

    expect(unmaterialisedPackages(root)).toEqual(['libs/a', 'libs/b']);
  });

  it("descends the nested pillars/*/* glob, so a pillar's app is covered", () => {
    rootInstalled();
    pkg('pillars/finance', { name: '@pops/finance', dependencies: { zod: '4.0.0' } });
    installed('pillars/finance');
    pkg('pillars/finance/app', { name: '@pops/app-finance', dependencies: { react: '19.0.0' } });

    expect(unmaterialisedPackages(root)).toEqual(['pillars/finance/app']);
  });

  it('ignores a directory under a workspace glob that is not a package', () => {
    rootInstalled();
    mkdirSync(join(root, 'libs', 'not-a-package'), { recursive: true });

    expect(unmaterialisedPackages(root)).toEqual([]);
  });

  it('treats a bare node_modules with no .modules.yaml as not installed', () => {
    mkdirSync(join(root, 'node_modules'), { recursive: true });

    expect(unmaterialisedPackages(root)).toContain('.');
  });
});
