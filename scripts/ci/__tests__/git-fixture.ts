import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Build a throwaway `git init` repo under the OS temp dir, for tests that
 * need real git plumbing (worktrees, merges, diffs) without ever touching
 * this repo's own tracked files. The caller owns cleanup — typically by
 * pushing the returned path onto a list an `afterEach` pops and `rmSync`s.
 */
export function fixtureRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'pops-git-fixture-'));
  execFileSync('git', ['init', '--quiet', '--initial-branch=main', root]);
  execFileSync('git', ['-C', root, 'config', 'user.email', 'fixture@localhost']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 'fixture']);
  return root;
}

/** Write `content` to `relPath` inside `root`, creating parent directories as needed. */
export function write(root: string, relPath: string, content: string): void {
  const full = join(root, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

/** `git add -A && git commit` inside `root`. */
export function commit(root: string, message: string): void {
  execFileSync('git', ['-C', root, 'add', '-A']);
  execFileSync('git', ['-C', root, 'commit', '--quiet', '-m', message]);
}
