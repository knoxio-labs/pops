import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupMergeRoot,
  type GeneratedClientTarget,
  realRunner,
  resolveMergeRoot,
  runTarget,
} from '../check-generated-clients.mjs';

/**
 * POPS-1874: `check-generated-clients.mjs --base <ref>` must judge the merge
 * of the branch onto `<ref>`, not the branch as checked out — that is the
 * tree `app-quality.yml`'s `pull_request`/`merge_group` triggers actually
 * judge (`actions/checkout@v7`'s merge-ref default). This fixture reproduces
 * the exact shape from POPS-1874's own PR #4031: a branch whose generated
 * output is fresh against its OWN source, but stale against a sibling change
 * that landed on the base ref after the branch forked from it.
 *
 * A real `git init` fixture, not a mocked one — the thing under test is git
 * plumbing (`worktree add`, `merge`) plus this file's existing `runTarget` /
 * `realRunner.gitDiff` machinery, and a fake `git` would prove nothing about
 * whether the two compose correctly.
 */

const created: string[] = [];

function fixtureRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'codegen-drift-fixture-'));
  created.push(root);
  execFileSync('git', ['init', '--quiet', '--initial-branch=main', root]);
  execFileSync('git', ['-C', root, 'config', 'user.email', 'fixture@localhost']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 'fixture']);
  return root;
}

function write(root: string, relPath: string, content: string): void {
  const full = join(root, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

function commit(root: string, message: string): void {
  execFileSync('git', ['-C', root, 'add', '-A']);
  execFileSync('git', ['-C', root, 'commit', '--quiet', '-m', message]);
}

/** Fake `generate`: source.txt's content, wrapped — stands in for openapi-ts. */
function fakeTarget(): GeneratedClientTarget {
  return {
    pkgName: '@pops/fixture',
    pkgDir: '.',
    scriptName: 'generate:fixture-client',
    command: 'openapi-ts && oxfmt --write gen',
    outputDir: 'gen',
    inAppMatrix: true,
  };
}

function fakeGenerate(root: string): number {
  const source = execFileSync('cat', [join(root, 'source.txt')], { encoding: 'utf8' });
  write(root, 'gen/output.txt', `gen(${source.trim()})`);
  return 0;
}

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

describe('resolveMergeRoot + runTarget (POPS-1874)', { timeout: 30_000 }, () => {
  it('branch-only mode (no --base) sees no drift: the branch is fresh against itself', () => {
    const root = fixtureRepo();
    write(root, 'source.txt', 'A');
    write(root, 'gen/output.txt', 'gen(A)');
    commit(root, 'base: source=A, gen=gen(A)');

    execFileSync('git', ['-C', root, 'checkout', '--quiet', '-b', 'feature']);
    // Feature never touches source.txt or gen/output.txt again — this is the
    // "locally clean" branch from the ticket's step 1/2.

    execFileSync('git', ['-C', root, 'checkout', '--quiet', 'main']);
    write(root, 'source.txt', 'B');
    commit(root, 'main moves the contract: source=B (gen/output.txt left untouched)');

    execFileSync('git', ['-C', root, 'checkout', '--quiet', 'feature']);

    const target = fakeTarget();
    const violation = runTarget(target, root, {
      generate: (_t, r) => fakeGenerate(r),
      countOutputFiles: realRunner.countOutputFiles,
      gitDiff: realRunner.gitDiff,
    });

    expect(violation).toBeNull();
  });

  it("--base main reports drift: the merge ref carries main's moved contract", () => {
    const root = fixtureRepo();
    write(root, 'source.txt', 'A');
    write(root, 'gen/output.txt', 'gen(A)');
    commit(root, 'base: source=A, gen=gen(A)');

    execFileSync('git', ['-C', root, 'checkout', '--quiet', '-b', 'feature']);
    // Real divergence on the branch, on a file main never touches — proves
    // the merge worktree combines BOTH sides rather than being a bare
    // checkout of baseRef (which alone would already carry main's source
    // change and could pass this test for the wrong reason).
    write(root, 'feature-notes.txt', 'feature work unrelated to the contract');
    commit(root, 'feature: unrelated local commit, does not touch source.txt or gen/');

    execFileSync('git', ['-C', root, 'checkout', '--quiet', 'main']);
    write(root, 'source.txt', 'B');
    commit(root, 'main moves the contract: source=B (gen/output.txt left untouched)');

    execFileSync('git', ['-C', root, 'checkout', '--quiet', 'feature']);

    const before = execFileSync('git', ['-C', root, 'worktree', 'list', '--porcelain'], {
      encoding: 'utf8',
    });
    expect(before.trim().split('\n\n').length).toBe(1);

    const mergeRoot = resolveMergeRoot(root, 'main');
    created.push(mergeRoot);
    try {
      // Both sides of the merge are present — not just a checkout of `main`.
      expect(existsSync(join(mergeRoot, 'feature-notes.txt'))).toBe(true);
      expect(
        execFileSync('cat', [join(mergeRoot, 'source.txt')], { encoding: 'utf8' }).trim()
      ).toBe('B');

      const target = fakeTarget();
      const violation = runTarget(target, mergeRoot, {
        generate: (_t, r) => fakeGenerate(r),
        countOutputFiles: realRunner.countOutputFiles,
        gitDiff: realRunner.gitDiff,
      });

      expect(violation).not.toBeNull();
      expect(violation?.kind).toBe('drift');
      expect(violation?.message).toContain('gen');
    } finally {
      cleanupMergeRoot(root, mergeRoot);
    }

    const after = execFileSync('git', ['-C', root, 'worktree', 'list', '--porcelain'], {
      encoding: 'utf8',
    });
    expect(after.trim().split('\n\n').length).toBe(1);
    expect(existsSync(mergeRoot)).toBe(false);
  });

  it('cleans up the worktree even when the merge itself conflicts', () => {
    const root = fixtureRepo();
    write(root, 'source.txt', 'A');
    commit(root, 'base');

    execFileSync('git', ['-C', root, 'checkout', '--quiet', '-b', 'feature']);
    write(root, 'source.txt', 'feature-value');
    commit(root, 'feature changes source.txt');

    execFileSync('git', ['-C', root, 'checkout', '--quiet', 'main']);
    write(root, 'source.txt', 'main-value');
    commit(root, 'main changes source.txt too, same line');

    execFileSync('git', ['-C', root, 'checkout', '--quiet', 'feature']);

    let thrown: unknown;
    try {
      resolveMergeRoot(root, 'main');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('could not merge');

    const worktreeList = execFileSync('git', ['-C', root, 'worktree', 'list', '--porcelain'], {
      encoding: 'utf8',
    });
    expect(worktreeList.trim().split('\n\n').length).toBe(1);
  });
});
