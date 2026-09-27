#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dependencyFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];
const fullSweepPaths = new Set([
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'tsconfig.build.json',
  'mise.toml',
  'mise.ci.toml',
  '.github/workflows/app-quality.yml',
]);

/**
 * Discovers workspace packages relevant to frontend dependency selection.
 *
 * App package names must retain the `@pops/app-*` convention because the
 * workflow uses those names as exact pnpm selectors.
 */
export function discoverPackages(root = repoRoot) {
  const dirs = [];
  for (const topLevel of ['libs', 'pillars']) {
    const parent = join(root, topLevel);
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      dirs.push(join(parent, entry.name));
      if (topLevel === 'pillars') dirs.push(join(parent, entry.name, 'app'));
    }
  }

  return dirs.flatMap((dir) => {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
      throw error;
    }

    if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
      throw new Error(`${relative(root, dir)}/package.json has no package name`);
    }
    const dependencies = new Set();
    for (const field of dependencyFields) {
      const values = manifest[field];
      if (typeof values !== 'object' || values === null) continue;
      for (const name of Object.keys(values)) dependencies.add(name);
    }

    const packageDir = relative(root, dir).split(sep).join('/');
    const isApp = /^pillars\/[^/]+\/app$/u.test(packageDir);
    if (isApp && !manifest.name.startsWith('@pops/app-')) {
      throw new Error(`${packageDir} is named ${manifest.name}; expected @pops/app-*`);
    }
    return [{ name: manifest.name, dir: packageDir, dependencies, isApp }];
  });
}

function touchesDir(file, dir) {
  return file === dir || file.startsWith(`${dir}/`);
}

function dependsOn(packageByName, candidate, changedNames, visiting = new Set()) {
  if (changedNames.has(candidate.name)) return true;
  if (visiting.has(candidate.name)) return false;
  const nextVisiting = new Set(visiting).add(candidate.name);
  for (const dependency of candidate.dependencies) {
    if (changedNames.has(dependency)) return true;
    const dependencyPackage = packageByName.get(dependency);
    if (
      dependencyPackage &&
      dependsOn(packageByName, dependencyPackage, changedNames, nextVisiting)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Selects app matrix rows affected by changed files.
 *
 * Direct app changes select one row. Changes to workspace packages select
 * every app in their reverse transitive dependency closure. Root dependency
 * inputs, workflow plumbing, and package-manifest changes outside an app use
 * a full sweep because the current dependency graph cannot safely describe
 * the graph before the change.
 */
export function selectAffectedApps(packages, changedFiles, forceAll = false) {
  const apps = packages.filter((workspacePackage) => workspacePackage.isApp);
  const normalizedFiles = changedFiles.map((file) => file.replaceAll('\\', '/'));
  const requiresFullSweep =
    forceAll ||
    normalizedFiles.some(
      (file) =>
        fullSweepPaths.has(file) ||
        file.startsWith('.github/actions/') ||
        (file.endsWith('/package.json') && !apps.some((app) => touchesDir(file, app.dir)))
    );
  if (requiresFullSweep) return apps.map(toMatrixRow);

  const changedNames = new Set(
    packages
      .filter((workspacePackage) =>
        normalizedFiles.some((file) => touchesDir(file, workspacePackage.dir))
      )
      .map((workspacePackage) => workspacePackage.name)
  );
  const packageByName = new Map(
    packages.map((workspacePackage) => [workspacePackage.name, workspacePackage])
  );
  return apps.filter((app) => dependsOn(packageByName, app, changedNames)).map(toMatrixRow);
}

function toMatrixRow(app) {
  return { pkg: app.name, dir: app.dir };
}

function parseArgs(argv) {
  const unknown = argv.filter((arg) => arg !== '--all' && arg !== '--self-test');
  if (unknown.length > 0) throw new Error(`unknown argument(s): ${unknown.join(', ')}`);
  return { forceAll: argv.includes('--all'), selfTest: argv.includes('--self-test') };
}

function selfTest() {
  const packages = [
    { name: '@pops/types', dir: 'libs/types', dependencies: new Set(), isApp: false },
    {
      name: '@pops/ui',
      dir: 'libs/ui',
      dependencies: new Set(['@pops/types']),
      isApp: false,
    },
    { name: '@pops/alpha', dir: 'pillars/alpha', dependencies: new Set(), isApp: false },
    {
      name: '@pops/app-alpha',
      dir: 'pillars/alpha/app',
      dependencies: new Set(['@pops/alpha', '@pops/ui']),
      isApp: true,
    },
    {
      name: '@pops/app-beta',
      dir: 'pillars/beta/app',
      dependencies: new Set(['@pops/ui']),
      isApp: true,
    },
  ];
  const names = (files, all = false) =>
    selectAffectedApps(packages, files, all).map((app) => app.pkg);
  const checks = [
    JSON.stringify(names(['pillars/alpha/app/src/page.tsx'])) ===
      JSON.stringify(['@pops/app-alpha']),
    JSON.stringify(names(['pillars/alpha/openapi/alpha.openapi.json'])) ===
      JSON.stringify(['@pops/app-alpha']),
    JSON.stringify(names(['libs/types/src/index.ts'])) ===
      JSON.stringify(['@pops/app-alpha', '@pops/app-beta']),
    names(['pillars/alpha/package.json']).length === 2,
    names([], true).length === 2,
  ];
  if (checks.some((check) => !check)) throw new Error('self-test failed');
  console.log(`self-test OK — ${checks.length} affected-app selection cases passed.`);
}

async function main() {
  const { forceAll, selfTest: shouldSelfTest } = parseArgs(process.argv.slice(2));
  if (shouldSelfTest) {
    selfTest();
    return;
  }
  const changedFiles = readFileSync(0, 'utf8')
    .split('\n')
    .map((file) => file.trim())
    .filter(Boolean);
  process.stdout.write(
    `${JSON.stringify(selectAffectedApps(discoverPackages(), changedFiles, forceAll))}\n`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
