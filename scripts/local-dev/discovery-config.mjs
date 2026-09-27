import { execFile } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { parse } from 'smol-toml';

const execFileAsync = promisify(execFile);

/** Returns a stable message for an unknown thrown value. @param {unknown} error */
export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
/** @param {unknown} error */
function missing(error) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
/** Tests whether a configuration path exists. @param {string} path */
export async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (missing(error)) return false;
    throw new Error(`Unable to inspect local task configuration ${path}: ${errorMessage(error)}`, {
      cause: error,
    });
  }
}
/** Lists direct child directories, treating an absent parent as empty. @param {string} directory */
export async function childDirectories(directory) {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(directory, entry.name));
  } catch (error) {
    if (missing(error)) return [];
    throw new Error(`Unable to discover local task units in ${directory}: ${errorMessage(error)}`, {
      cause: error,
    });
  }
}
/** Reads a JSON configuration object with contextual parse failures. @param {string} path */
export async function readJsonObject(path) {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'));
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      throw new TypeError('expected an object');
    return value;
  } catch (error) {
    throw new Error(`Unable to parse local task configuration ${path}: ${errorMessage(error)}`, {
      cause: error,
    });
  }
}
/** Reads locally-declared mise task names and prerequisites. @param {string} path */
export async function readMiseTasks(path) {
  try {
    const tasks = parse(await readFile(path, 'utf8')).tasks;
    if (tasks === undefined) return { names: new Set(), dependencies: {} };
    if (typeof tasks !== 'object' || tasks === null || Array.isArray(tasks))
      throw new TypeError('expected [tasks] to be a table');
    /** @type {Record<string, string[]>} */ const dependencies = {};
    for (const [name, task] of Object.entries(tasks)) {
      if (typeof task === 'object' && task !== null && !Array.isArray(task) && 'depends' in task) {
        const depends = task.depends;
        if (!Array.isArray(depends) || !depends.every((value) => typeof value === 'string'))
          throw new TypeError(`expected task ${name} depends to be an array of strings`);
        dependencies[name] = depends;
      }
    }
    return { names: new Set(Object.keys(tasks)), dependencies };
  } catch (error) {
    throw new Error(`Unable to parse local task configuration ${path}: ${errorMessage(error)}`, {
      cause: error,
    });
  }
}
/** Returns string-valued package scripts from a manifest. @param {Record<string, unknown>} manifest */
export function packageScripts(manifest) {
  const scripts = manifest.scripts;
  if (scripts === undefined) return {};
  if (typeof scripts !== 'object' || scripts === null || Array.isArray(scripts))
    throw new TypeError('expected package.json scripts to be an object');
  return Object.fromEntries(
    Object.entries(scripts).filter((entry) => typeof entry[1] === 'string')
  );
}
/** Returns every declared package dependency name. @param {Record<string, unknown>} manifest */
export function dependencyNames(manifest) {
  return ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].flatMap(
    (section) => {
      const dependencies = manifest[section];
      if (dependencies === undefined) return [];
      if (typeof dependencies !== 'object' || dependencies === null || Array.isArray(dependencies))
        throw new TypeError(`expected package.json ${section} to be an object`);
      return Object.keys(dependencies);
    }
  );
}
/** Makes mise validate trust and syntax for one unit configuration. @param {string} unitPath */
export async function verifyMiseTrust(unitPath) {
  try {
    await execFileAsync('mise', ['tasks', '-C', unitPath], { windowsHide: true });
  } catch (error) {
    throw new Error(
      `Unable to trust or load local task configuration in ${unitPath}: ${errorMessage(error)}`,
      { cause: error }
    );
  }
}
