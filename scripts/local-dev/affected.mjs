import { execFileSync } from 'node:child_process';

const STANDALONE_ROOT_TOOLING = new Set([
  'scripts/ci/integration-promote.mjs',
  'scripts/ci/__tests__/integration-promote.test.ts',
]);

const ROOT_DOCUMENTATION = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  '.github/copilot-instructions.md',
]);

/**
 * Identify prose that is not consumed as product or test input.
 * @param {string} path
 * @param {DependencyUnit | undefined} owner
 * @returns {boolean}
 */
function isPlainDocumentation(path, owner) {
  if (!path.endsWith('.md')) return false;
  if (owner?.unitPath === 'pillars/docs') return false;
  if (/(^|\/)(?:__tests__|test|tests|fixtures?)(?:\/|$)/u.test(path)) return false;
  if (ROOT_DOCUMENTATION.has(path) || path.endsWith('/README.md')) return true;
  if (path.startsWith('docs/')) return true;
  if (owner === undefined) return false;
  return path.slice(owner.unitPath.length + 1).startsWith('docs/');
}

/**
 * A workspace unit and the names of the packages it imports.
 * @typedef {object} DependencyUnit
 * @property {string} unitPath
 * @property {string | undefined} [packageName]
 * @property {readonly string[]} dependencies
 */

/**
 * Select changed units and all reverse dependents. Contracts, configuration,
 * Rust and unrecognised paths widen to the whole workspace.
 * @param {readonly DependencyUnit[]} units
 * @param {readonly string[] | null} changedPaths Null means the base could not be resolved.
 * @returns {{unitPaths: string[], full: boolean, scripts: boolean, reason: string}}
 */
export function affectedUnits(units, changedPaths) {
  const all = units.map((unit) => unit.unitPath).toSorted();
  const full = (/** @type {string} */ reason) => ({
    unitPaths: all,
    full: true,
    scripts: true,
    reason,
  });
  if (changedPaths === null) return full('The comparison base is unavailable.');
  const ordered = [...units].toSorted((a, b) => b.unitPath.length - a.unitPath.length);
  const selected = new Set();
  let scripts = false;
  for (const path of changedPaths) {
    if (/\/(?:contracts?|Contracts?|openapi)\//u.test(path))
      return full(`Published contract changed: ${path}`);
    if (STANDALONE_ROOT_TOOLING.has(path)) {
      scripts = true;
      continue;
    }
    if (path.startsWith('clients/')) continue;
    const owner = ordered.find((unit) => path.startsWith(`${unit.unitPath}/`));
    if (isPlainDocumentation(path, owner)) continue;
    if (owner === undefined) return full(`Shared or unknown input changed: ${path}`);
    if (owner.unitPath === 'pillars/docs' && path.endsWith('.md')) {
      selected.add(owner.unitPath);
      continue;
    }
    const relative = path.slice(owner.unitPath.length + 1);
    if (
      !/^(src|app|scripts|test|tests|e2e)\//u.test(relative) ||
      /(^|\/)[^/]*(?:contract|openapi)[^/]*(?:\/|$)/iu.test(relative) ||
      /(^|\/)(manifest[^/]*|[^/]*config[^/]*|[^/]*\.rs)$/u.test(relative)
    )
      return full(`Contract, configuration or unsupported input changed: ${path}`);
    selected.add(owner.unitPath);
  }
  let expanded = true;
  while (expanded) {
    expanded = false;
    const names = new Set(
      units.filter((unit) => selected.has(unit.unitPath)).map((unit) => unit.packageName)
    );
    for (const unit of units) {
      if (
        !selected.has(unit.unitPath) &&
        unit.dependencies.some((dependency) => names.has(dependency))
      ) {
        selected.add(unit.unitPath);
        expanded = true;
      }
    }
  }
  let reason = 'Changed units and their reverse dependencies.';
  if (selected.size === 0)
    reason = scripts ? 'Standalone root tooling changed.' : 'No workspace implementation changed.';
  else if (scripts) reason = 'Changed root tooling, units and their reverse dependencies.';
  return {
    unitPaths: [...selected].toSorted(),
    full: false,
    scripts,
    reason,
  };
}

/**
 * Read committed, staged, unstaged and untracked paths against the branch base.
 * Missing git history widens selection rather than claiming an empty diff.
 * @param {string} cwd
 * @param {string} base
 * @returns {string[] | null}
 */
export function changedFiles(cwd, base) {
  const git = (/** @type {string[]} */ args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const ancestor = git(['merge-base', 'HEAD', base]).trim();
    const tracked = git(['diff', '--no-renames', '--name-only', '-z', ancestor, '--']);
    const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']);
    return [...new Set(`${tracked}${untracked}`.split('\0').filter(Boolean))].toSorted();
  } catch {
    return null;
  }
}
