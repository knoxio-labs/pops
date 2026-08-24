import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const worktreeScript = join(repositoryRoot, 'scripts', 'worktree.mjs');
const temporaryDirectories: string[] = [];

function gitEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) environment[key] = value;
  }
  return {
    ...environment,
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };
}

function run(command: string, arguments_: string[], cwd: string) {
  return execFileSync(command, arguments_, {
    cwd,
    encoding: 'utf8',
    env: gitEnvironment(),
  });
}

function createRepository() {
  const temporaryRoot = join(repositoryRoot, 'tmp');
  mkdirSync(temporaryRoot, { recursive: true });
  const path = mkdtempSync(join(temporaryRoot, 'worktree-'));
  temporaryDirectories.push(path);
  run('git', ['init', '--initial-branch=main'], path);
  writeFileSync(join(path, 'README.md'), '# fixture\n');
  run('git', ['add', 'README.md'], path);
  run('git', ['commit', '-m', 'chore: seed'], path);
  return path;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop() as string, { recursive: true, force: true });
  }
});

describe('worktree helper', () => {
  it('creates and removes a branch worktree without an external helper', () => {
    const fixture = createRepository();
    const branch = 'feature/example';
    const worktreePath = join(resolve(fixture, '..'), branch);

    run(process.execPath, [worktreeScript, 'create', branch], fixture);

    expect(existsSync(worktreePath)).toBe(true);
    expect(run('git', ['branch', '--show-current'], worktreePath).trim()).toBe(branch);

    run(process.execPath, [worktreeScript, 'remove', branch], fixture);

    expect(existsSync(worktreePath)).toBe(false);
    expect(run('git', ['branch', '--list', branch], fixture).trim()).toBe('');
  });

  it('rejects branch paths that escape the worktree parent directory', () => {
    const fixture = createRepository();

    expect(() => run(process.execPath, [worktreeScript, 'create', '../escape'], fixture)).toThrow();
  });
});
