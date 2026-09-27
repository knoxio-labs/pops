import { execFileSync } from 'node:child_process';

/**
 * Name a promotion snapshot whose integration membership stays fixed.
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
 * Combine a fixed integration revision with current main and open its promotion PR.
 * Refuses uncommitted work, a stale source checkout, and an unprotected main branch.
 * The unique snapshot commit prevents checks on the integration SHA being reused.
 * Failures leave the candidate checkout available for diagnosis and recovery.
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
  const protectedAdmission = run('gh', [
    'api',
    `repos/${repo}/rules/branches/main`,
    '--jq',
    '[.[] | select(.type == "required_status_checks") | .parameters | .required_status_checks[] | select(.context == "Promotion validation")] | length',
  ]).trim();
  if (!/^\d+$/u.test(protectedAdmission) || Number(protectedAdmission) === 0) {
    throw new Error('Main must require Promotion validation before promoting.');
  }
  run('git', ['fetch', 'origin', source, 'main']);
  const remoteSha = run('git', ['rev-parse', `origin/${source}`]).trim();
  if (sha !== remoteSha) throw new Error('The integration checkout differs from its remote tip.');
  if (!run('git', ['diff', '--name-only', 'origin/main...HEAD']).trim()) {
    throw new Error('This integration revision has no changes to promote.');
  }
  run('git', ['switch', '-c', candidate]);
  run('git', ['merge', '-m', 'chore: refresh promotion from main', 'origin/main']);
  if (!run('git', ['diff', '--name-only', 'origin/main', 'HEAD']).trim()) {
    throw new Error('The candidate has no changes after incorporating current main.');
  }
  run('git', [
    'commit',
    '--allow-empty',
    '-m',
    `chore: freeze ${source.slice('integration/'.length)} promotion`,
  ]);
  run('mise', ['lint']);
  run('mise', ['typecheck']);
  run('git', ['push', '-u', 'origin', candidate]);
  const url = run('gh', [
    'pr',
    'create',
    '--base',
    'main',
    '--head',
    candidate,
    '--title',
    `feat: integrate ${source.slice('integration/'.length)}`,
    '--body',
    `Frozen integration revision: ${sha}.\n\nSource: ${source}.\n\nValidation: mise lint and mise typecheck passed before push. Promotion validation runs the full suite on the candidate combined with current main. Merge after required checks and review gates pass and GitHub permits it; base movement alone does not require a refresh.`,
  ]).trim();
  run('git', ['switch', source]);
  return url;
}

if (import.meta.main) {
  const result = promoteIntegration((command, args) => {
    const output = execFileSync(command, args, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    return output;
  });
  console.log(result);
}
