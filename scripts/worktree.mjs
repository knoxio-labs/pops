import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: 'inherit', ...options });
}

function output(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', ...options }).trim();
}

function usage() {
  console.error('Usage: node scripts/worktree.mjs <create|remove> [--install-deps] <branch>');
  process.exit(1);
}

function validBranch(branch) {
  return branch.length > 0 && !branch.startsWith('/') && !branch.includes('..') && branch !== '.';
}

const [operation, ...arguments_] = process.argv.slice(2);
const installDependencies = arguments_[0] === '--install-deps';
const branch = arguments_[installDependencies ? 1 : 0];

if (
  (operation !== 'create' && operation !== 'remove') ||
  arguments_.length !== (installDependencies ? 2 : 1)
) {
  usage();
}

if (!validBranch(branch)) {
  console.error("Error: BRANCH must be a relative branch name without '..'.");
  process.exit(1);
}

run('git', ['check-ref-format', '--branch', branch]);

const repositoryRoot = output('git', ['rev-parse', '--show-toplevel']);
const worktreePath = resolve(dirname(repositoryRoot), branch);

if (operation === 'remove') {
  run('git', ['worktree', 'remove', worktreePath]);
  run('git', ['branch', '-d', branch]);
  process.exit(0);
}

const branchExists = (() => {
  try {
    run('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
})();

run(
  'git',
  branchExists
    ? ['worktree', 'add', worktreePath, branch]
    : ['worktree', 'add', '-b', branch, worktreePath, 'main']
);

if (installDependencies) {
  run('pnpm', ['install'], { cwd: worktreePath });
}
