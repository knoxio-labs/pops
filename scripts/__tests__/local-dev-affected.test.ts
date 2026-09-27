import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { affectedUnits, changedFiles } from '../local-dev/affected.mjs';

const units = [
  { unitPath: 'libs/ui', packageName: '@pops/ui', dependencies: [] },
  { unitPath: 'pillars/finance', packageName: '@pops/finance', dependencies: [] },
  {
    unitPath: 'pillars/finance/app',
    packageName: '@pops/app-finance',
    dependencies: ['@pops/ui', '@pops/finance'],
  },
  { unitPath: 'pillars/media/app', packageName: '@pops/app-media', dependencies: ['@pops/ui'] },
  { unitPath: 'pillars/shell', packageName: '@pops/shell', dependencies: [] },
];

describe('local affected selection', { timeout: 60_000 }, () => {
  it('chooses the longest owning path for a nested app without its parent', () => {
    expect(affectedUnits(units, ['pillars/finance/app/src/page.tsx']).unitPaths).toEqual([
      'pillars/finance/app',
    ]);
  });
  it('includes reverse dependencies transitively, not unrelated packages', () => {
    const graph = [
      ...units,
      { unitPath: 'libs/consumer', packageName: 'consumer', dependencies: ['@pops/app-finance'] },
    ];
    expect(affectedUnits(graph, ['libs/ui/src/button.tsx']).unitPaths).toEqual([
      'libs/consumer',
      'libs/ui',
      'pillars/finance/app',
      'pillars/media/app',
    ]);
  });
  it.each([
    'tsconfig.base.json',
    'pnpm-lock.yaml',
    'scripts/tool.mjs',
    'pillars/finance/src/contract/index.ts',
    'pillars/finance/src/entities/accounts/contract.ts',
    'pillars/finance/src/openapi.ts',
    'pillars/finance/openapi/finance.openapi.json',
    'clients/ios/Contracts/finance.openapi.json',
    'pillars/finance/package.json',
    'pillars/deleted/src/code.ts',
    'pillars/finance/src/example.rs',
  ])('widens uncertain input %s', (path) => {
    expect(affectedUnits(units, [path])).toMatchObject({
      full: true,
      scripts: true,
      unitPaths: units.map((u) => u.unitPath).toSorted(),
    });
  });
  it('widens on unavailable history and remains empty for an empty diff', () => {
    expect(affectedUnits(units, null).full).toBe(true);
    expect(affectedUnits(units, []).unitPaths).toEqual([]);
  });
  it('keeps external client changes outside the pnpm/cargo gate', () => {
    expect(affectedUnits(units, ['clients/ios/Sources/Page.swift']).unitPaths).toEqual([]);
  });
  it('includes uncommitted changes and both sides of a rename', () => {
    mkdirSync(resolve('tmp'), { recursive: true });
    const root = mkdtempSync(resolve('tmp/local-affected-'));
    const git = (...args: string[]) =>
      execFileSync('git', args, {
        cwd: root,
        stdio: 'pipe',
        env: {
          ...process.env,
          GIT_DIR: undefined,
          GIT_WORK_TREE: undefined,
          GIT_INDEX_FILE: undefined,
        },
      })
        .toString()
        .trim();
    try {
      git('init', '-q');
      git('config', 'user.email', 'fixture@example.invalid');
      git('config', 'user.name', 'Fixture');
      writeFileSync(join(root, 'old.ts'), 'export const value=1;');
      git('add', '.');
      git('commit', '-qm', 'test: initial fixture');
      const base = git('rev-parse', 'HEAD');
      git('mv', 'old.ts', 'new.ts');
      writeFileSync(join(root, 'untracked.ts'), 'export const next=2;');
      expect(changedFiles(root, base)).toEqual(['new.ts', 'old.ts', 'untracked.ts']);
      expect(changedFiles(root, 'missing-ref')).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
