import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { repositoryFingerprint } from './repository-inputs.mjs';

const volatileEnvironment =
  /^(?:_|PWD|OLDPWD|SHLVL|TERM|COLORTERM|MISE_TASK.*|npm_lifecycle_.*|npm_command|npm_execpath|npm_node_execpath|GIT_DIR|GIT_WORK_TREE|GIT_INDEX_FILE|GIT_COMMON_DIR|GIT_OBJECT_DIRECTORY|GIT_ALTERNATE_OBJECT_DIRECTORIES|GIT_PREFIX|GIT_QUARANTINE_PATH|GIT_NAMESPACE)$/u;

/**
 * Hash environment values without storing or displaying them. Invocation-only
 * variables are excluded so a hook and its preceding manual check can agree.
 * @param {NodeJS.ProcessEnv} environment
 * @returns {string}
 */
export function environmentFingerprint(environment) {
  return createHash('sha256')
    .update(
      JSON.stringify(
        Object.entries(environment)
          .filter(([key]) => !volatileEnvironment.test(key))
          .toSorted(([a], [b]) => a.localeCompare(b))
      )
    )
    .digest('hex');
}

/**
 * Bind a validation result to source, generated declarations, install state,
 * tool versions, worktree and environment. Env-file contents are never read.
 * @param {string} cwd
 * @param {readonly string[]} unitPaths
 * @param {NodeJS.ProcessEnv} [environment]
 * @returns {string}
 */
export function validationFingerprint(cwd, unitPaths, environment = process.env) {
  const digest = createHash('sha256');
  digest.update(cwd);
  digest.update(environmentFingerprint(environment));
  digest.update(process.version);
  digest.update(process.execPath);
  for (const command of ['mise', 'pnpm', 'rustc']) {
    digest.update(
      execFileSync(command, ['--version'], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    );
  }
  digest.update(repositoryFingerprint(cwd));
  for (const directory of ['', ...unitPaths.map((unit) => relative(cwd, resolve(cwd, unit)))]) {
    for (const file of [
      'node_modules/.modules.yaml',
      'node_modules/.pnpm/lock.yaml',
      'node_modules/typescript/package.json',
      'node_modules/oxlint/package.json',
    ]) {
      addFile(join(directory, file));
    }
    const entries = readdirSync(join(cwd, directory));
    for (const entry of entries) {
      if (entry.startsWith('.env') || /mise.*\.local\.toml$/u.test(entry))
        addFile(join(directory, entry), true);
    }
    walkOutput(join(directory, 'dist'));
  }
  return digest.digest('hex');

  /** @param {string} file @param {boolean} [metadataOnly] */
  function addFile(file, metadataOnly = false) {
    digest.update(file);
    const absolute = join(cwd, file);
    if (!existsSync(absolute)) {
      digest.update('missing');
      return;
    }
    const stat = lstatSync(absolute);
    digest.update(String(stat.mode));
    if (!stat.isFile() && !stat.isSymbolicLink()) {
      digest.update('directory');
      return;
    }
    if (metadataOnly || /(^|\/)\.env(?:\.|$)/u.test(file)) {
      digest.update(JSON.stringify([stat.size, stat.mtimeMs, stat.ctimeMs]));
    } else digest.update(readFileSync(absolute));
  }

  /** @param {string} directory */
  function walkOutput(directory) {
    const absolute = join(cwd, directory);
    if (!existsSync(absolute)) {
      digest.update(`${directory}:missing`);
      return;
    }
    for (const entry of readdirSync(absolute, { withFileTypes: true }).toSorted((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const child = join(absolute, entry.name);
      if (entry.isDirectory()) walkOutput(relative(cwd, child));
      else if (!entry.name.endsWith('.tsbuildinfo')) addFile(relative(cwd, child));
    }
  }
}
