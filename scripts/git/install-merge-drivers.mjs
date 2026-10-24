#!/usr/bin/env node
/**
 * Writes the per-clone git config behind the `merge=<driver>` attributes in
 * `.gitattributes`. Git never reads merge-driver commands from the repository
 * itself, so a clone without this config merges those paths as plain text;
 * the root `prepare` script runs this on every `pnpm install` to close that
 * gap. Re-running it only writes keys whose value differs.
 *
 * Outside a git work tree (a Docker build context) there is nothing to
 * configure and it exits 0 having said so.
 */
import { spawnSync } from 'node:child_process';

const MERGIRAF_SCRIPT = 'scripts/git/mergiraf-merge.sh';
const DRIVER_ARGS = '%O %A %B %L %P %S %X %Y';

/**
 * The config this repository's `.gitattributes` relies on, keyed by git
 * config name. The driver command is resolved against the work tree's top
 * level, where git runs merge drivers, and names `/bin/sh` rather than
 * trusting PATH, because a driver command that cannot start leaves our side in
 * place with no conflict markers. When the checked-out tree predates the
 * wrapper script it runs git's own line merge instead.
 */
export const MERGE_DRIVER_CONFIG = Object.freeze({
  'merge.mergiraf.name': 'mergiraf syntax-aware merge',
  'merge.mergiraf.driver':
    `if [ -f ${MERGIRAF_SCRIPT} ]; then /bin/sh ${MERGIRAF_SCRIPT} ${DRIVER_ARGS}; ` +
    'else git merge-file -L %X -L %S -L %Y --marker-size=%L %A %O %B; fi',
});

/**
 * @param {string[]} args
 * @param {string} cwd
 */
function git(args, cwd) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

/**
 * Installs {@link MERGE_DRIVER_CONFIG} into the repository-local config of
 * the git work tree containing `cwd`.
 *
 * @param {{cwd: string}} options
 * @returns {{status: 'not-a-work-tree'} | {status: 'configured', written: string[]}}
 * @throws {Error} when git refuses a config write.
 */
export function installMergeDrivers({ cwd }) {
  const probe = git(['rev-parse', '--is-inside-work-tree'], cwd);
  if (probe.status !== 0 || probe.stdout.trim() !== 'true') return { status: 'not-a-work-tree' };

  /** @type {string[]} */
  const written = [];
  for (const [key, value] of Object.entries(MERGE_DRIVER_CONFIG)) {
    const current = git(['config', '--local', '--get', key], cwd);
    if (current.status === 0 && current.stdout.replace(/\n$/u, '') === value) continue;
    const write = git(['config', '--local', key, value], cwd);
    if (write.status !== 0) {
      throw new Error(`git config --local ${key} failed: ${write.stderr.trim()}`);
    }
    written.push(key);
  }
  return { status: 'configured', written };
}

if (import.meta.main) {
  try {
    const result = installMergeDrivers({ cwd: process.cwd() });
    if (result.status === 'not-a-work-tree') {
      console.log('merge-drivers: not inside a git work tree; nothing to configure.');
    } else if (result.written.length > 0) {
      console.log(`merge-drivers: configured ${result.written.join(', ')}.`);
    }
  } catch (error) {
    console.error(`merge-drivers: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
