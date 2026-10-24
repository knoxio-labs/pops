#!/usr/bin/env node
/**
 * Generates the API clients the workspace compiles against but does not
 * commit, from the OpenAPI snapshots it does commit.
 *
 * Two kinds of target, both discovered from each unit's `package.json`:
 *
 * - a Hey API client: a `generate:*` script one of whose `&&`/`;` steps runs
 *   the `openapi-ts` binary, writing the directory its `-o <dir>` names;
 * - a pillar's type map: `generate:api-types`, writing the source file behind
 *   its `exports['./api-types'].types`.
 *
 * The root `postinstall` and `build` scripts run this, so a fresh clone, every
 * CI job that installs, `mise check` and `mise dev` all have the clients
 * before anything reads them. The image Dockerfiles that bundle a client run
 * it explicitly after their filtered install.
 *
 * A target is regenerated unless the stamp under `tmp/codegen/` records the
 * current inputs fingerprint for it and its output is present. The
 * fingerprint over-approximates on purpose: every OpenAPI snapshot, every
 * owning unit's manifest and generator config, the lockfile and this file. A
 * change to any snapshot regenerates every target. A target whose unit has no
 * `node_modules` is skipped and named, because a filtered install (an image
 * build) cannot run it and nothing installed there reads it.
 *
 * Every run also checks discovery against `EXPECTED_TARGETS` and, inside a
 * git work tree, that no output is committed and every output is ignored.
 *
 * Usage:
 *   node scripts/codegen/generate.mjs [--pkg <name>]... [--force]
 *
 * Exit 0 = every selected target is current. Exit 1 = a generator failed,
 * produced nothing, discovery disagreed with the pinned set, or an output is
 * tracked or not ignored. Exit 2 = usage error.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_FILE = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = resolve(dirname(THIS_FILE), '..', '..');
const STAMP_PATH = join('tmp', 'codegen', 'stamp.json');
const CONCURRENCY = 4;

const GENERATE_PREFIX = 'generate:';
const HEY_API_BIN = 'openapi-ts';
const RUNNER_WRAPPERS = [['pnpm', 'exec'], ['npx']];
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=\S*$/u;
const API_TYPES_SCRIPT = 'generate:api-types';
const API_TYPES_COMMAND = 'tsx scripts/generate-api-types.ts';
const HEY_API_CONFIG = /^openapi-ts(\.[\w-]+)?\.config\.(ts|mts|js|mjs)$/u;

/**
 * @typedef {object} CodegenTarget
 * @property {'hey-api' | 'api-types'} kind
 * @property {string} pkgName
 * @property {string} pkgDir Relative to the repo root, posix-separated.
 * @property {string} scriptName
 * @property {string | null} output
 *   Relative to `pkgDir`: the client directory or the type-map file. Null when
 *   the script gives no parseable target, which is a discovery violation.
 */

/**
 * The exact set of targets this repository owns. Adding, removing or renaming
 * a generator means editing this list, and the matching `.gitignore` entry,
 * in the same commit.
 */
export const EXPECTED_TARGETS = Object.freeze([
  { pkgName: '@pops/app-ai', scriptName: 'generate:api' },
  { pkgName: '@pops/app-bfm', scriptName: 'generate:api' },
  { pkgName: '@pops/app-cerebrum', scriptName: 'generate:cerebrum-client' },
  { pkgName: '@pops/app-contacts', scriptName: 'generate:contacts-client' },
  { pkgName: '@pops/app-finance', scriptName: 'generate:finance-client' },
  { pkgName: '@pops/app-finance', scriptName: 'generate:contacts-client' },
  { pkgName: '@pops/app-finance', scriptName: 'generate:purchases-client' },
  { pkgName: '@pops/app-food', scriptName: 'generate:food-client' },
  { pkgName: '@pops/app-food', scriptName: 'generate:lists-client' },
  { pkgName: '@pops/app-inventory', scriptName: 'generate:inventory-client' },
  { pkgName: '@pops/app-inventory', scriptName: 'generate:purchases-client' },
  { pkgName: '@pops/app-lists', scriptName: 'generate:lists-client' },
  { pkgName: '@pops/app-media', scriptName: 'generate:media-client' },
  { pkgName: '@pops/app-purchases', scriptName: 'generate:purchases-client' },
  { pkgName: '@pops/shell', scriptName: 'generate:registry-client' },
  { pkgName: '@pops/overlay-ego', scriptName: 'generate:ego-client' },
  { pkgName: '@pops/ai', scriptName: API_TYPES_SCRIPT },
  { pkgName: '@pops/cerebrum', scriptName: API_TYPES_SCRIPT },
  { pkgName: '@pops/finance', scriptName: API_TYPES_SCRIPT },
  { pkgName: '@pops/food', scriptName: API_TYPES_SCRIPT },
  { pkgName: '@pops/inventory', scriptName: API_TYPES_SCRIPT },
  { pkgName: '@pops/lists', scriptName: API_TYPES_SCRIPT },
  { pkgName: '@pops/media', scriptName: API_TYPES_SCRIPT },
  { pkgName: '@pops/purchases', scriptName: API_TYPES_SCRIPT },
  { pkgName: '@pops/registry', scriptName: API_TYPES_SCRIPT },
]);

/** @param {string} step */
function stepInvokesHeyApi(step) {
  const tokens = step.split(/\s+/u).filter((token) => token.length > 0);
  let i = 0;
  while (i < tokens.length && ENV_ASSIGNMENT.test(tokens[i] ?? '')) i++;
  for (const wrapper of RUNNER_WRAPPERS) {
    if (wrapper.every((word, offset) => tokens[i + offset] === word)) {
      i += wrapper.length;
      break;
    }
  }
  return tokens[i] === HEY_API_BIN;
}

/**
 * Whether a script command runs the Hey API generator as one of its steps,
 * bare, through `pnpm exec`/`npx`, or behind leading `KEY=VALUE` assignments.
 *
 * @param {string} command
 * @returns {boolean}
 */
export function invokesHeyApiGenerator(command) {
  return command
    .split(/&&|;/u)
    .map((step) => step.trim())
    .some((step) => stepInvokesHeyApi(step));
}

/**
 * The `-o <dir>` / `--output <dir>` a Hey API script passes to `openapi-ts`.
 * The output lives on the command line rather than in the config file so
 * discovery never has to read TypeScript.
 *
 * @param {string} command
 * @returns {string | null}
 */
export function extractOutputDir(command) {
  const step = command
    .split(/&&|;/u)
    .map((part) => part.trim())
    .find((part) => stepInvokesHeyApi(part));
  if (step === undefined) return null;
  return /(?:^|\s)(?:-o|--output)\s+(\S+)/u.exec(step)?.[1] ?? null;
}

/**
 * The source file behind `exports['./api-types'].types`:
 * `./dist/contract/api-types.generated.d.ts` maps to
 * `src/contract/api-types.generated.ts`.
 *
 * @param {unknown} manifest Parsed `package.json`.
 * @returns {string | null}
 */
export function deriveApiTypesOutput(manifest) {
  if (typeof manifest !== 'object' || manifest === null || !('exports' in manifest)) return null;
  const exportsField = manifest.exports;
  if (typeof exportsField !== 'object' || exportsField === null) return null;
  if (!('./api-types' in exportsField)) return null;
  const entry = exportsField['./api-types'];
  if (typeof entry !== 'object' || entry === null || !('types' in entry)) return null;
  const types = entry.types;
  if (typeof types !== 'string') return null;
  const match = /^\.\/dist\/(.+)\.d\.ts$/u.exec(types);
  return match === null ? null : `src/${match[1]}.ts`;
}

/**
 * `pillars/<id>`, `pillars/<id>/app` and `libs/<lib>`, sorted.
 *
 * @param {string} root
 * @returns {string[]}
 */
export function discoverCandidateDirs(root) {
  /** @type {string[]} */
  const dirs = [];
  for (const kind of ['pillars', 'libs']) {
    const kindDir = join(root, kind);
    if (!existsSync(kindDir)) continue;
    for (const entry of readdirSync(kindDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      dirs.push(`${kind}/${entry.name}`);
      if (kind === 'pillars' && existsSync(join(kindDir, entry.name, 'app', 'package.json'))) {
        dirs.push(`${kind}/${entry.name}/app`);
      }
    }
  }
  return dirs.toSorted((a, b) => a.localeCompare(b));
}

/**
 * @param {string} root
 * @param {string} pkgDir
 * @returns {CodegenTarget[]}
 */
function scanUnit(root, pkgDir) {
  const manifestPath = join(root, pkgDir, 'package.json');
  if (!existsSync(manifestPath)) return [];
  /** @type {{ name?: unknown, scripts?: Record<string, unknown> }} */
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (typeof manifest.name !== 'string') return [];
  const pkgName = manifest.name;

  /** @type {CodegenTarget[]} */
  const targets = [];
  for (const [scriptName, command] of Object.entries(manifest.scripts ?? {})) {
    if (!scriptName.startsWith(GENERATE_PREFIX) || typeof command !== 'string') continue;
    if (scriptName === API_TYPES_SCRIPT && command.trim() === API_TYPES_COMMAND) {
      const output = deriveApiTypesOutput(manifest);
      targets.push({ kind: 'api-types', pkgName, pkgDir, scriptName, output });
    } else if (invokesHeyApiGenerator(command)) {
      const output = extractOutputDir(command);
      targets.push({ kind: 'hey-api', pkgName, pkgDir, scriptName, output });
    }
  }
  return targets;
}

/**
 * Every codegen target in the workspace under `root`.
 *
 * @param {string} root
 * @returns {CodegenTarget[]}
 */
export function discoverTargets(root) {
  return discoverCandidateDirs(root).flatMap((dir) => scanUnit(root, dir));
}

/** @param {{ pkgName: string, scriptName: string }} target */
function targetKey(target) {
  return `${target.pkgName}:${target.scriptName}`;
}

/**
 * Every disagreement between a full discovery and `expected`: a missing,
 * unexpected or duplicated target, or one with no parseable output.
 *
 * @param {CodegenTarget[]} targets
 * @param {ReadonlyArray<{ pkgName: string, scriptName: string }>} [expected]
 * @returns {string[]}
 */
export function findDiscoveryViolations(targets, expected = EXPECTED_TARGETS) {
  /** @type {string[]} */
  const messages = [];
  /** @type {Map<string, CodegenTarget>} */
  const seen = new Map();
  for (const target of targets) {
    const key = targetKey(target);
    const earlier = seen.get(key);
    if (earlier !== undefined) {
      messages.push(`${key} is declared twice, in ${earlier.pkgDir} and ${target.pkgDir}.`);
      continue;
    }
    seen.set(key, target);
    if (target.output === null) {
      messages.push(
        target.kind === 'hey-api'
          ? `${key} runs openapi-ts but names no \`-o <dir>\` output.`
          : `${key} has no \`exports['./api-types'].types\` of the form ./dist/<path>.d.ts.`
      );
    }
  }
  const expectedKeys = new Set(expected.map((target) => targetKey(target)));
  for (const key of expectedKeys) {
    if (!seen.has(key)) {
      messages.push(`${key} was not discovered: renamed, removed, or no longer a known generator.`);
    }
  }
  for (const key of seen.keys()) {
    if (!expectedKeys.has(key)) {
      messages.push(`${key} is a generator missing from EXPECTED_TARGETS in this file.`);
    }
  }
  return messages;
}

/** @param {string} dir */
function hasAnyFile(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() || (entry.isDirectory() && hasAnyFile(join(dir, entry.name)))) return true;
  }
  return false;
}

/**
 * Whether a target's output exists and is non-empty.
 *
 * @param {string} root
 * @param {CodegenTarget} target
 * @returns {boolean}
 */
export function outputPresent(root, target) {
  if (target.output === null) return false;
  const path = join(root, target.pkgDir, target.output);
  if (!existsSync(path)) return false;
  const stat = statSync(path);
  return target.kind === 'hey-api' ? stat.isDirectory() && hasAnyFile(path) : stat.size > 0;
}

/** @param {string} dir @param {RegExp} pattern */
function filesIn(dir, pattern) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => join(dir, entry.name));
}

/**
 * A hash over everything a target's output can depend on, shared by every
 * target: all OpenAPI snapshots and vendored contracts, each owning unit's
 * manifest and generator configuration, the lockfile and this file.
 *
 * @param {string} root
 * @param {CodegenTarget[]} targets
 * @returns {string}
 */
export function inputsFingerprint(root, targets) {
  const files = new Set([join(root, 'pnpm-lock.yaml'), THIS_FILE]);
  for (const pillar of discoverCandidateDirs(root)) {
    for (const file of filesIn(join(root, pillar, 'openapi'), /\.json$/u)) files.add(file);
    for (const file of filesIn(join(root, pillar, 'contracts'), /\.json$/u)) files.add(file);
  }
  for (const target of targets) {
    const unit = join(root, target.pkgDir);
    files.add(join(unit, 'package.json'));
    for (const file of filesIn(unit, HEY_API_CONFIG)) files.add(file);
    for (const file of filesIn(join(unit, 'scripts'), /^generate-api-types\.ts$/u)) files.add(file);
  }
  const hash = createHash('sha256');
  for (const file of [...files].toSorted()) {
    hash.update(file.startsWith(root) ? file.slice(root.length) : file);
    hash.update('\0');
    hash.update(existsSync(file) ? readFileSync(file) : 'missing');
    hash.update('\0');
  }
  return hash.digest('hex');
}

/**
 * The stamp is only a cache: when it is missing or unreadable every target
 * counts as stale and is regenerated.
 *
 * @param {string} root
 * @param {(line: string) => void} log
 * @returns {Record<string, string>}
 */
function readStamp(root, log) {
  const path = join(root, STAMP_PATH);
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed;
    log(`codegen: ${STAMP_PATH} is not an object; regenerating every target.`);
  } catch (error) {
    log(`codegen: ${STAMP_PATH} is unreadable (${String(error)}); regenerating every target.`);
  }
  return {};
}

/** @param {string} root @param {Record<string, string>} stamp */
function writeStamp(root, stamp) {
  const path = join(root, STAMP_PATH);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(stamp, null, 2)}\n`);
  renameSync(temporary, path);
}

/**
 * Committed or unignored outputs, which would put generated code back under
 * version control. Empty outside a git work tree.
 *
 * @param {string} root
 * @param {CodegenTarget[]} targets
 * @returns {string[]}
 */
export function findVersionControlViolations(root, targets) {
  const probe = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (probe.status !== 0 || probe.stdout.trim() !== 'true') return [];
  // A trailing slash marks a client directory as one even before it exists;
  // without it, a fresh clone's `dir-api/` ignore rule would not match.
  const paths = targets
    .filter((target) => target.output !== null)
    .map((target) => `${target.pkgDir}/${target.output}${target.kind === 'hey-api' ? '/' : ''}`);
  if (paths.length === 0) return [];

  /** @type {string[]} */
  const messages = [];
  const tracked = spawnSync('git', ['ls-files', '--', ...paths], { cwd: root, encoding: 'utf8' });
  if (tracked.status !== 0) throw new Error(`git ls-files failed: ${tracked.stderr.trim()}`);
  const trackedFiles = tracked.stdout.split('\n').filter(Boolean);
  if (trackedFiles.length > 0) {
    messages.push(
      `${trackedFiles.length} generated file(s) are committed, e.g. ${trackedFiles[0]}. ` +
        'Remove them with `git rm -r --cached` on the output path.'
    );
  }
  const ignored = spawnSync('git', ['check-ignore', '--', ...paths], {
    cwd: root,
    encoding: 'utf8',
  });
  if (ignored.status !== 0 && ignored.status !== 1) {
    throw new Error(`git check-ignore failed: ${ignored.stderr.trim()}`);
  }
  const ignoredPaths = new Set(ignored.stdout.split('\n').filter(Boolean));
  for (const path of paths) {
    if (!ignoredPaths.has(path)) messages.push(`${path} is not ignored; add it to .gitignore.`);
  }
  return messages;
}

/**
 * Runs one target's script through pnpm, buffering its output.
 *
 * @param {string} root
 * @param {CodegenTarget} target
 * @returns {Promise<{ status: number, output: string }>}
 */
function runScript(root, target) {
  return new Promise((resolveRun) => {
    const child = spawn('pnpm', ['--filter', target.pkgName, 'run', target.scriptName], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    /** @type {Buffer[]} */
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    child.on('error', (error) => resolveRun({ status: 1, output: String(error) }));
    child.on('close', (code) =>
      resolveRun({ status: code ?? 1, output: Buffer.concat(chunks).toString('utf8') })
    );
  });
}

/**
 * @typedef {object} GenerateOptions
 * @property {string} [root]
 * @property {string[]} [packages] Restrict to these package names.
 * @property {boolean} [force] Regenerate even when the stamp says current.
 * @property {ReadonlyArray<{ pkgName: string, scriptName: string }>} [expected]
 *   The pinned target set; defaults to {@link EXPECTED_TARGETS}.
 * @property {(root: string, target: CodegenTarget) => Promise<{ status: number, output: string }>} [run]
 * @property {(line: string) => void} [log]
 */

/**
 * Discovers, verifies and regenerates every stale target.
 *
 * @param {GenerateOptions} [options]
 * @returns {Promise<{ status: 0 | 1, generated: string[], skipped: string[], failures: string[] }>}
 */
export async function generate({
  root = DEFAULT_ROOT,
  packages = [],
  force = false,
  expected = EXPECTED_TARGETS,
  run = runScript,
  log = (line) => console.log(line),
} = {}) {
  const all = discoverTargets(root);
  /** @type {string[]} */
  const failures = findDiscoveryViolations(all, expected);

  const selected =
    packages.length === 0 ? all : all.filter((target) => packages.includes(target.pkgName));
  for (const name of packages) {
    if (!selected.some((target) => target.pkgName === name)) {
      failures.push(`--pkg ${name} matched no codegen target.`);
    }
  }
  failures.push(...findVersionControlViolations(root, all));

  const fingerprint = inputsFingerprint(root, all);
  const stamp = readStamp(root, log);
  /** @type {string[]} */
  const skipped = [];
  /** @type {CodegenTarget[]} */
  const stale = [];
  for (const target of selected) {
    if (target.output === null) continue;
    if (!existsSync(join(root, target.pkgDir, 'node_modules'))) {
      if (packages.includes(target.pkgName)) {
        failures.push(`${targetKey(target)} cannot run: ${target.pkgDir} is not installed.`);
      } else {
        skipped.push(targetKey(target));
      }
      continue;
    }
    if (force || stamp[targetKey(target)] !== fingerprint || !outputPresent(root, target)) {
      stale.push(target);
    }
  }

  /** @type {string[]} */
  const generated = [];
  const queue = [...stale];
  const worker = async () => {
    for (let target = queue.shift(); target !== undefined; target = queue.shift()) {
      const key = targetKey(target);
      const result = await run(root, target);
      if (result.status !== 0) {
        failures.push(`${key} exited ${result.status}:\n${result.output.trimEnd()}`);
      } else if (!outputPresent(root, target)) {
        failures.push(`${key} exited 0 but wrote nothing to ${target.pkgDir}/${target.output}.`);
      } else {
        stamp[key] = fingerprint;
        generated.push(key);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, stale.length) }, worker));
  if (generated.length > 0) writeStamp(root, stamp);

  if (generated.length > 0) log(`codegen: generated ${generated.length} target(s).`);
  if (skipped.length > 0) {
    log(`codegen: skipped ${skipped.length} target(s) in uninstalled units: ${skipped.join(', ')}`);
  }
  return { status: failures.length === 0 ? 0 : 1, generated, skipped, failures };
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  /** @type {string[]} */
  const packages = [];
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force') force = true;
    else if (arg === '--pkg') {
      const name = argv[++i];
      if (name === undefined || name.startsWith('--')) return { error: '--pkg needs a name' };
      packages.push(name);
    } else return { error: `unknown argument ${arg}` };
  }
  return { packages, force };
}

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2));
  if ('error' in args) {
    console.error(`codegen: ${args.error}`);
    console.error('Usage: node scripts/codegen/generate.mjs [--pkg <name>]... [--force]');
    process.exit(2);
  }
  const result = await generate(args);
  for (const failure of result.failures) console.error(`codegen: ${failure}`);
  process.exit(result.status);
}
