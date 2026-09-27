import { describe, expect, it } from 'vitest';

import { selectAffectedApps } from '../select-affected-apps.mjs';

interface WorkspacePackage {
  name: string;
  dir: string;
  dependencies: Set<string>;
  isApp: boolean;
}

const packages: WorkspacePackage[] = [
  { name: '@pops/types', dir: 'libs/types', dependencies: new Set(), isApp: false },
  {
    name: '@pops/ui',
    dir: 'libs/ui',
    dependencies: new Set(['@pops/types']),
    isApp: false,
  },
  { name: '@pops/alpha', dir: 'pillars/alpha', dependencies: new Set(), isApp: false },
  { name: '@pops/beta', dir: 'pillars/beta', dependencies: new Set(), isApp: false },
  {
    name: '@pops/app-alpha',
    dir: 'pillars/alpha/app',
    dependencies: new Set(['@pops/alpha', '@pops/ui']),
    isApp: true,
  },
  {
    name: '@pops/app-beta',
    dir: 'pillars/beta/app',
    dependencies: new Set(['@pops/beta']),
    isApp: true,
  },
];

const selectedNames = (files: string[], forceAll = false) =>
  selectAffectedApps(packages, files, forceAll).map((app) => app.pkg);

describe('affected app selection', () => {
  it('runs only the directly changed app', () => {
    expect(selectedNames(['pillars/alpha/app/src/page.tsx'])).toEqual(['@pops/app-alpha']);
  });

  it('runs an app when its owning pillar contract changes', () => {
    expect(selectedNames(['pillars/beta/openapi/beta.openapi.json'])).toEqual(['@pops/app-beta']);
  });

  it('follows workspace dependencies transitively', () => {
    expect(selectedNames(['libs/types/src/index.ts'])).toEqual(['@pops/app-alpha']);
  });

  it('runs every app when dependency graph inputs change', () => {
    expect(selectedNames(['libs/ui/package.json'])).toEqual(['@pops/app-alpha', '@pops/app-beta']);
    expect(selectedNames(['pnpm-lock.yaml'])).toEqual(['@pops/app-alpha', '@pops/app-beta']);
  });

  it('runs every app when the caller cannot establish a trustworthy base', () => {
    expect(selectedNames([], true)).toEqual(['@pops/app-alpha', '@pops/app-beta']);
  });

  it('selects no app for an unrelated workspace package', () => {
    expect(selectedNames(['pillars/unrelated/src/index.ts'])).toEqual([]);
  });
});
