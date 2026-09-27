import { execFileSync } from 'node:child_process';

/**
 * Name an immutable promotion snapshot; each source revision gets its own branch.
 * @param {string} source Integration branch name.
 * @param {string} sha Full commit object ID.
 * @returns {string}
 */
export function promotionBranch(source, sha) {
  if (!/^integration\/[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(source)) {
    throw new Error('Check out an integration/<workstream> branch with a lowercase slug.');
  }
  if (!/^[0-9a-f]{40}$/u.test(sha)) throw new Error('Expected a full commit SHA.');
  return `promotion/${source.slice('integration/'.length)}/${sha}`;
}

/**
 * Freeze the current integration revision after local checks and open its main PR.
 * Refuses uncommitted work, a stale source checkout, and an unprotected main branch.
 * A published candidate is never amended by this command; fixes get a new snapshot.
 * @param {(command: string, args: string[]) => string} run Synchronous command runner.
 * @returns {string} Promotion pull request URL.
 */
export function promoteIntegration(run) {
  if (run('git', ['status', '--porcelain']).trim()) {
    throw new Error('Commit or remove working-tree changes before freezing a promotion.');
  }
  const source = run('git', ['branch', '--show-current']).trim();
  const sha = run('git', ['rev-parse', 'HEAD']).trim();
  const candidate = promotionBranch(source, sha);
  const repo = run('gh', [
    'repo',
    'view',
    '--json',
    'nameWithOwner',
    '--jq',
    '.nameWithOwner',
  ]).trim();
  if (repo !== 'knoxio-labs/pops')
    throw new Error('This promotion command is for knoxio-labs/pops.');
  if (run('gh', ['api', 'user', '--jq', '.login']).trim() !== 'knoxio') {
    throw new Error('Use the knoxio GitHub account for this repository.');
  }
  const queue = run('gh', [
    'api',
    `repos/${repo}/rules/branches/main`,
    '--jq',
    '[.[] | select(.type == "merge_queue")] | length',
  ]).trim();
  if (!/^\d+$/u.test(queue) || Number(queue) === 0) {
    throw new Error('Main must require its full-validation merge queue before promoting.');
  }
  run('git', ['fetch', 'origin', source, 'main']);
  const remoteSha = run('git', ['rev-parse', `origin/${source}`]).trim();
  if (sha !== remoteSha) throw new Error('The integration checkout differs from its remote tip.');
  if (!run('git', ['diff', '--name-only', 'origin/main...HEAD']).trim()) {
    throw new Error('This integration revision has no changes to promote.');
  }
  run('mise', ['lint']);
  run('mise', ['typecheck']);
  run('git', ['switch', '-c', candidate]);
  try {
    run('git', ['push', '-u', 'origin', candidate]);
    return run('gh', [
      'pr',
      'create',
      '--base',
      'main',
      '--head',
      candidate,
      '--title',
      `feat: integrate ${source.slice('integration/'.length)}`,
      '--body',
      `Frozen integration revision: ${sha}.\n\nSource: ${source}.\n\nValidation: mise lint and mise typecheck passed before push. Full validation is required on the merge-group tree before admission to main.`,
    ]).trim();
  } finally {
    run('git', ['switch', source]);
  }
}

if (import.meta.main) {
  const result = promoteIntegration((command, args) => {
    const output = execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    return output;
  });
  console.log(result);
}
