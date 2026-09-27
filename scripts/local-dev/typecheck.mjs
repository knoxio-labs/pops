import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, '..', '..');

/**
 * Returns the TypeScript project referenced by a `tsc --noEmit` command.
 *
 * Only the small, portable command form used by workspace typecheck scripts is
 * accepted. Rejecting a new shell shape is safer than silently omitting it.
 *
 * @param {string} command
 * @returns {string | null}
 */
export function noEmitProject(command) {
  const args = command.trim().split(/\s+/u);
  if (args[0] !== 'tsc' || !args.includes('--noEmit')) return null;
  const project = args.findIndex((arg) => arg === '-p' || arg === '--project');
  if (project === -1) return 'tsconfig.json';
  const value = args[project + 1];
  if (value === undefined || value.startsWith('-')) {
    throw new Error(`typecheck: ${JSON.stringify(command)} has no project after -p`);
  }
  return value;
}

/**
 * Splits a portable typecheck script into commands that must run in order.
 *
 * @param {string} script
 * @returns {string[]}
 */
export function typecheckCommands(script) {
  if (/\|\||[;|`$()]/u.test(script)) {
    throw new Error(`typecheck: unsupported shell syntax in ${JSON.stringify(script)}`);
  }
  const commands = script
    .split('&&')
    .map((command) => command.trim())
    .filter(Boolean);
  if (commands.length === 0) throw new Error('typecheck: package script is empty');
  return commands;
}

/**
 * Produces a cache path that cannot collide between configs or worktrees.
 *
 * @param {{ root: string, unit: string, project: string }} input
 * @returns {string}
 */
export function tsBuildInfoPath({ root, unit, project }) {
  /** @param {string} value */
  const fingerprint = (value) => createHash('sha256').update(value).digest('hex').slice(0, 16);
  const worktree = fingerprint(realpathSync(root));
  const config = fingerprint(`${relative(root, unit)}\0${project}`);
  return join(root, 'tmp', 'local-dev', 'typecheck', worktree, `${config}.tsbuildinfo`);
}

/** @param {unknown} value */
function typecheckScriptFromManifest(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const scripts = Reflect.get(value, 'scripts');
  if (typeof scripts !== 'object' || scripts === null || Array.isArray(scripts)) return null;
  const script = Reflect.get(scripts, 'typecheck');
  return typeof script === 'string' ? script : null;
}

/** @param {string} unit */
function readTypecheckScript(unit) {
  const manifest = join(unit, 'package.json');
  if (!existsSync(manifest)) throw new Error(`typecheck: ${manifest} does not exist`);
  const script = typecheckScriptFromManifest(JSON.parse(readFileSync(manifest, 'utf8')));
  if (script === null) throw new Error(`typecheck: ${manifest} has no typecheck script`);
  return script;
}

/** @param {string} unit */
function localTsc(unit) {
  const require = createRequire(pathToFileURL(join(unit, 'package.json')));
  return require.resolve('typescript/bin/tsc');
}

/** @param {string} command @param {string} unit */
function run(command, unit) {
  const outcome = spawnSync(command, { cwd: unit, shell: true, stdio: 'inherit' });
  if (outcome.error !== undefined) throw outcome.error;
  return outcome.status ?? 1;
}

/** @param {string} command @param {string} unit @param {string} root */
function runNoEmit(command, unit, root) {
  const project = noEmitProject(command);
  if (project === null) return run(command, unit);
  const config = resolve(unit, project);
  if (!existsSync(config)) throw new Error(`typecheck: ${relative(root, config)} does not exist`);
  const cache = tsBuildInfoPath({ root, unit, project: relative(unit, config) });
  const args = command.trim().split(/\s+/u).slice(1);
  args.push('--incremental', '--tsBuildInfoFile', cache);
  const outcome = spawnSync(process.execPath, [localTsc(unit), ...args], {
    cwd: unit,
    stdio: 'inherit',
  });
  if (outcome.error !== undefined) throw outcome.error;
  return outcome.status ?? 1;
}

/**
 * Runs the current unit's canonical package typecheck script with incremental
 * no-emit caches, while retaining every preflight command in that script.
 *
 * @param {{ unit?: string, root?: string }} [options]
 * @returns {number}
 */
export function runTypecheck({ unit = process.cwd(), root = workspaceRoot } = {}) {
  const absoluteUnit = resolve(unit);
  const script = readTypecheckScript(absoluteUnit);
  for (const command of typecheckCommands(script)) {
    const status = runNoEmit(command, absoluteUnit, resolve(root));
    if (status !== 0) return status;
  }
  return 0;
}

function main() {
  process.exitCode = runTypecheck();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
