import { join, relative, resolve } from 'node:path';

import {
  childDirectories,
  dependencyNames,
  exists,
  packageScripts,
  readJsonObject,
  readMiseTasks,
  verifyMiseTrust,
} from './discovery-config.mjs';
const UNIT_DIRECTORIES = ['pillars', 'libs', 'clients'];

/**
 * A locally executable task. `command` is deliberately an argv tuple so the
 * runner never needs a shell to execute repository configuration.
 *
 * @typedef {object} LocalTask
 * @property {string} unitPath
 * @property {string | undefined} packageName
 * @property {string} taskName
 * @property {string[]} command
 * @property {'package' | 'mise'} source
 * @property {boolean} write
 */

/**
 * A discoverable unit and the local configuration that defines its tasks.
 *
 * @typedef {object} LocalUnit
 * @property {string} unitPath
 * @property {string | undefined} packageName
 * @property {string[]} dependencies
 * @property {string[]} taskNames
 * @property {Record<string, string>} packageScripts
 * @property {Set<string>} miseTaskNames
 * @property {Record<string, string[]>} miseDependencies
 */

/**
 * Discovers repository units without asking mise to resolve inherited config.
 * A task is local only when it exists in the unit's own package.json or its
 * own mise.toml; parent mise files are never consulted.
 *
 * @param {{cwd: string, verifyTrust?: boolean}} options
 * @returns {Promise<LocalUnit[]>}
 */
export async function discoverUnits({ cwd, verifyTrust = true }) {
  const root = resolve(cwd);
  const candidates = [];
  for (const parent of UNIT_DIRECTORIES) {
    candidates.push(...(await childDirectories(join(root, parent))));
  }
  const pillarApps = await Promise.all(
    (await childDirectories(join(root, 'pillars'))).map(async (pillar) => {
      const app = join(pillar, 'app');
      return (await exists(app)) ? [app] : [];
    })
  );
  candidates.push(...pillarApps.flat());

  const units = [];
  for (const unitPath of candidates.toSorted((left, right) => left.localeCompare(right))) {
    const packagePath = join(unitPath, 'package.json');
    const misePath = join(unitPath, 'mise.toml');
    const hasPackage = await exists(packagePath);
    const hasMise = await exists(misePath);
    if (!hasPackage && !hasMise) continue;

    if (verifyTrust) await verifyMiseTrust(unitPath);

    const manifest = hasPackage ? await readJsonObject(packagePath) : {};
    const scripts = packageScripts(manifest);
    const mise = hasMise ? await readMiseTasks(misePath) : { names: new Set(), dependencies: {} };
    const packageName = typeof manifest.name === 'string' ? manifest.name : undefined;
    units.push({
      unitPath,
      packageName,
      dependencies: dependencyNames(manifest),
      taskNames: [...new Set([...Object.keys(scripts), ...mise.names])].toSorted(),
      packageScripts: scripts,
      miseTaskNames: mise.names,
      miseDependencies: mise.dependencies,
    });
  }
  return units;
}

/**
 * Returns serialized local mise prerequisites for descriptors. This preserves
 * code generation before package-backed checks without allowing concurrent
 * builds to overwrite shared output directories.
 *
 * @param {{cwd: string, descriptors: LocalTask[]}} options
 * @returns {Promise<LocalTask[]>}
 */
export async function prepareTasks({ cwd, descriptors }) {
  const units = new Map((await discoverUnits({ cwd })).map((unit) => [unit.unitPath, unit]));
  /** @type {LocalTask[]} */
  const prepared = [];
  const seen = new Set();
  for (const descriptor of descriptors) {
    const found = units.get(descriptor.unitPath);
    if (found === undefined) continue;
    const unit = found;
    for (const dependency of unit.miseDependencies[descriptor.taskName] ?? []) {
      const key = `${unit.unitPath}:${dependency}`;
      if (seen.has(key)) continue;
      seen.add(key);
      prepared.push({
        unitPath: unit.unitPath,
        packageName: unit.packageName,
        taskName: dependency,
        command: ['mise', 'run', dependency],
        source: 'mise',
        write: true,
      });
    }
  }
  return prepared;
}

/** @param {string} taskName */
function taskWritesFiles(taskName) {
  return !['lint', 'typecheck', 'test', 'test:coverage'].includes(taskName);
}

/**
 * Converts locally-defined package or mise tasks to runnable descriptors.
 * Package scripts run in the unit's mise environment without retriggering
 * prerequisites that can race against another unit's build.
 *
 * @param {{cwd: string, taskNames?: string[], unitPaths?: string[], verifyTrust?: boolean, includeClients?: boolean}} options
 * @returns {Promise<LocalTask[]>}
 */
export async function discoverLocalTasks({
  cwd,
  taskNames,
  unitPaths,
  verifyTrust,
  includeClients = process.env.RUN_ALL_INCLUDE_CLIENTS === '1',
}) {
  const root = resolve(cwd);
  const selected =
    unitPaths === undefined ? undefined : new Set(unitPaths.map((path) => resolve(root, path)));
  const requested = taskNames === undefined ? undefined : new Set(taskNames);
  const units = await discoverUnits({ cwd: root, verifyTrust });
  /** @type {LocalTask[]} */
  const tasks = [];
  for (const unit of units) {
    if (!includeClients && relative(root, unit.unitPath).startsWith('clients/')) continue;
    if (selected !== undefined && !selected.has(unit.unitPath)) continue;
    for (const taskName of unit.taskNames) {
      if (requested !== undefined && !requested.has(taskName)) continue;
      if (taskName in unit.packageScripts) {
        const command =
          taskName === 'typecheck'
            ? ['node', join(root, 'scripts/local-dev/typecheck.mjs')]
            : ['pnpm', 'run', taskName];
        tasks.push({
          unitPath: unit.unitPath,
          packageName: unit.packageName,
          taskName,
          command: ['mise', 'exec', '--', ...command],
          source: 'package',
          write: taskWritesFiles(taskName),
        });
        continue;
      }
      if (unit.miseTaskNames.has(taskName)) {
        tasks.push({
          unitPath: unit.unitPath,
          packageName: unit.packageName,
          taskName,
          command: ['mise', 'run', taskName],
          source: 'mise',
          write: taskWritesFiles(taskName),
        });
      }
    }
  }
  return tasks;
}

/**
 * Resolves path or package-name selectors and recursively includes local
 * dependencies that have the requested task, which keeps library watchers
 * running beside a selected consuming application.
 *
 * @param {{cwd: string, selectors?: string[], taskName: string}} options
 * @returns {Promise<LocalTask[]>}
 */
export async function discoverSelectedTasks({ cwd, selectors = [], taskName }) {
  const root = resolve(cwd);
  const units = await discoverUnits({ cwd: root });
  const byPath = new Map(units.map((unit) => [unit.unitPath, unit]));
  const byPackage = new Map(
    units.flatMap((unit) => (unit.packageName === undefined ? [] : [[unit.packageName, unit]]))
  );
  /** @type {LocalUnit[]} */
  const selected = selectors.length === 0 ? [...units] : [];
  for (const selector of selectors) {
    const unit = byPackage.get(selector) ?? byPath.get(resolve(root, selector));
    if (unit !== undefined) selected.push(unit);
  }
  if (selected.length !== selectors.length && selectors.length !== 0) {
    const known = new Set(selected.map((unit) => unit.unitPath));
    const missing = selectors.filter(
      (selector) => !known.has(resolve(root, selector)) && !byPackage.has(selector)
    );
    throw new Error(`Unknown local task unit selector: ${missing.join(', ')}`);
  }
  const included = new Map(selected.map((unit) => [unit.unitPath, unit]));
  for (const unit of included.values()) {
    for (const dependency of unit.dependencies) {
      const local = byPackage.get(dependency);
      if (
        local !== undefined &&
        local.taskNames.includes(taskName) &&
        !included.has(local.unitPath)
      ) {
        included.set(local.unitPath, local);
      }
    }
  }
  const tasks = await discoverLocalTasks({
    cwd: root,
    taskNames: [taskName],
    unitPaths: [...included.keys()],
    includeClients: selectors.length > 0,
  });
  if (taskName === 'dev') {
    const libraryWatchers = tasks.filter((task) =>
      relative(root, task.unitPath).startsWith('libs/')
    );
    if (libraryWatchers.length > 0) {
      const libraryPaths = new Set(libraryWatchers.map((task) => task.unitPath));
      const retained = tasks.filter((task) => !libraryPaths.has(task.unitPath));
      retained.unshift({
        unitPath: root,
        packageName: undefined,
        taskName: 'dev:compiled-graph',
        command: [
          'mise',
          'exec',
          '--',
          'pnpm',
          'exec',
          'tsc',
          '-b',
          'tsconfig.build.json',
          '--watch',
        ],
        source: 'package',
        write: false,
      });
      tasks.splice(0, tasks.length, ...retained);
    }
    const food = units.find((unit) => relative(root, unit.unitPath) === 'pillars/food');
    if (food !== undefined && included.has(food.unitPath) && !food.taskNames.includes('dev')) {
      tasks.push(
        {
          unitPath: food.unitPath,
          packageName: food.packageName,
          taskName: 'dev:api',
          command: ['mise', 'exec', '--', 'pnpm', 'run', 'dev:api'],
          source: 'package',
          write: false,
        },
        {
          unitPath: food.unitPath,
          packageName: food.packageName,
          taskName: 'dev:worker',
          command: ['mise', 'exec', '--', 'pnpm', 'run', 'dev:worker'],
          source: 'package',
          write: false,
        }
      );
    }
  }
  return tasks;
}
