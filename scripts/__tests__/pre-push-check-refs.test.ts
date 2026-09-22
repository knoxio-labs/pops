/**
 * Covers `scripts/pre-push-check-refs.mjs`: the pure decision functions
 * directly, `orchestrate()` with a mocked `run` (to pin the exact command
 * sequence and argv without needing real git plumbing), and the real binary
 * against throwaway git repos, so a bug in main()'s wiring (e.g. reading
 * `process.cwd()` incorrectly, or building the wrong argv for the line-budget
 * check) cannot hide behind unit tests of the pure functions alone.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { gitEnv } from '../ci/resolve-report-base.mjs';
import {
  orchestrate,
  parseRefUpdates,
  peelToCommits,
  planPushChecks,
  resolveCheckBase,
} from '../pre-push-check-refs.mjs';

const REAL_SUBPROCESS_TIMEOUT_MS = 60_000;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const script = join(repoRoot, 'scripts', 'pre-push-check-refs.mjs');

const NULL_SHA = '0'.repeat(40);
const MAIN_REF = 'refs/heads/main';

describe('parseRefUpdates', () => {
  it('parses a well-formed pre-push line into all four fields', () => {
    expect(parseRefUpdates('refs/heads/x aaa refs/heads/y bbb')).toEqual([
      { localRef: 'refs/heads/x', localSha: 'aaa', remoteRef: 'refs/heads/y', remoteSha: 'bbb' },
    ]);
  });

  it('parses several ref lines, one per push target', () => {
    const stdin = ['refs/heads/a a1 refs/heads/a a2', 'refs/heads/b b1 refs/heads/b b2'].join('\n');
    expect(parseRefUpdates(stdin)).toEqual([
      { localRef: 'refs/heads/a', localSha: 'a1', remoteRef: 'refs/heads/a', remoteSha: 'a2' },
      { localRef: 'refs/heads/b', localSha: 'b1', remoteRef: 'refs/heads/b', remoteSha: 'b2' },
    ]);
  });

  it('ignores a short/malformed line rather than inventing fields', () => {
    expect(parseRefUpdates('garbage')).toEqual([]);
  });

  it('ignores blank lines', () => {
    expect(parseRefUpdates('\n\n')).toEqual([]);
  });

  it('returns nothing for empty stdin', () => {
    expect(parseRefUpdates('')).toEqual([]);
  });
});

describe('planPushChecks', () => {
  const headSha = 'a'.repeat(40);
  const otherSha = 'b'.repeat(40);

  it('plans a check when the pushed ref is at HEAD', () => {
    const plans = planPushChecks(
      [
        {
          localRef: 'refs/heads/x',
          localSha: headSha,
          remoteRef: 'refs/heads/x',
          remoteSha: NULL_SHA,
        },
      ],
      headSha
    );
    expect(plans).toEqual([{ kind: 'check', localRef: 'refs/heads/x', sha: headSha }]);
  });

  it('THE FIX: a pushed ref whose local sha is not HEAD is a mismatch, not silently checked or silently skipped', () => {
    const plans = planPushChecks(
      [
        {
          localRef: 'refs/heads/x',
          localSha: otherSha,
          remoteRef: 'refs/heads/x',
          remoteSha: NULL_SHA,
        },
      ],
      headSha
    );
    expect(plans).toEqual([{ kind: 'mismatch', localRef: 'refs/heads/x', sha: otherSha }]);
  });

  it('a delete (all-zero local sha) needs no plan at all', () => {
    expect(
      planPushChecks(
        [
          {
            localRef: 'refs/heads/x',
            localSha: NULL_SHA,
            remoteRef: 'refs/heads/x',
            remoteSha: otherSha,
          },
        ],
        headSha
      )
    ).toEqual([]);
  });

  it('a push whose REMOTE ref is refs/heads/main is exempt, whatever the local ref is named', () => {
    expect(
      planPushChecks(
        [
          {
            localRef: 'refs/heads/some-topic-branch',
            localSha: headSha,
            remoteRef: MAIN_REF,
            remoteSha: otherSha,
          },
        ],
        headSha
      )
    ).toEqual([]);
  });

  it('a mismatched push to main is exempt too — main exempts by destination, before the mismatch check', () => {
    expect(
      planPushChecks(
        [
          {
            localRef: 'refs/heads/x',
            localSha: otherSha,
            remoteRef: MAIN_REF,
            remoteSha: NULL_SHA,
          },
        ],
        headSha
      )
    ).toEqual([]);
  });

  it('does not exempt a push where the LOCAL branch is named main but the destination is not', () => {
    const plans = planPushChecks(
      [
        {
          localRef: 'refs/heads/main',
          localSha: headSha,
          remoteRef: 'refs/heads/some-other-branch',
          remoteSha: NULL_SHA,
        },
      ],
      headSha
    );
    expect(plans).toEqual([{ kind: 'check', localRef: 'refs/heads/main', sha: headSha }]);
  });

  it('the same commit pushed under two ref names is planned once', () => {
    const plans = planPushChecks(
      [
        {
          localRef: 'refs/heads/a',
          localSha: headSha,
          remoteRef: 'refs/heads/a',
          remoteSha: NULL_SHA,
        },
        {
          localRef: 'refs/heads/b',
          localSha: headSha,
          remoteRef: 'refs/heads/b',
          remoteSha: NULL_SHA,
        },
      ],
      headSha
    );
    expect(plans).toHaveLength(1);
  });

  it('an unknown HEAD (git could not be asked) makes every non-exempt push a mismatch', () => {
    const plans = planPushChecks(
      [
        {
          localRef: 'refs/heads/x',
          localSha: headSha,
          remoteRef: 'refs/heads/x',
          remoteSha: NULL_SHA,
        },
      ],
      undefined
    );
    expect(plans).toEqual([{ kind: 'mismatch', localRef: 'refs/heads/x', sha: headSha }]);
  });
});

describe('resolveCheckBase', () => {
  it('keeps ordinary branches on origin/main when no base is declared', () => {
    expect(
      resolveCheckBase({ branchName: 'topic', remoteName: 'origin', mergeRef: undefined })
    ).toEqual({
      ref: 'origin/main',
      budgetBase: 'main',
      fetchRemote: 'origin',
      fetchBranch: 'main',
    });
  });

  it('keeps a branch based on main on the ordinary target', () => {
    expect(
      resolveCheckBase({
        branchName: 'topic',
        remoteName: 'origin',
        mergeRef: 'refs/heads/main',
      })
    ).toEqual({
      ref: 'origin/main',
      budgetBase: 'main',
      fetchRemote: 'origin',
      fetchBranch: 'main',
    });
  });

  it('uses a checked-out child branch’s declared immediate parent', () => {
    expect(
      resolveCheckBase({
        branchName: 'child',
        remoteName: 'origin',
        mergeRef: 'refs/heads/parent',
      })
    ).toEqual({
      ref: 'origin/parent',
      budgetBase: 'parent',
      fetchRemote: 'origin',
      fetchBranch: 'parent',
    });
  });

  it('supports a local base declaration without trying to fetch it', () => {
    expect(
      resolveCheckBase({
        branchName: 'child',
        remoteName: '.',
        mergeRef: 'refs/heads/parent',
      })
    ).toEqual({
      ref: 'parent',
      budgetBase: 'parent',
      fetchRemote: undefined,
      fetchBranch: undefined,
    });
  });
});

describe('orchestrate()', () => {
  const headSha = 'a'.repeat(40);
  const otherSha = 'b'.repeat(40);

  function record(): {
    run: (cmd: string, args: string[]) => { status: number | null };
    ran: { cmd: string; args: string[] }[];
    statusFor?: (cmd: string, args: string[]) => number;
  } {
    const ran: { cmd: string; args: string[] }[] = [];
    return {
      ran,
      run: (cmd, args) => {
        ran.push({ cmd, args });
        return { status: 0 };
      },
    };
  }

  it('refuses (exit 1) on a mismatch and runs no command at all', () => {
    const { run, ran } = record();
    const err: string[] = [];
    const code = orchestrate({
      updates: [
        {
          localRef: 'refs/heads/x',
          localSha: otherSha,
          remoteRef: 'refs/heads/x',
          remoteSha: NULL_SHA,
        },
      ],
      headSha,
      repoDir: repoRoot,
      run,
      out: () => {},
      err: (l) => err.push(l),
    });
    expect(code).toBe(1);
    expect(ran).toEqual([]);
    expect(err.join('\n')).toContain(`git checkout ${otherSha}`);
  });

  it('exits 0 without running anything when nothing pushed needs checking', () => {
    const { run, ran } = record();
    const out: string[] = [];
    const code = orchestrate({
      updates: [
        { localRef: 'refs/heads/x', localSha: headSha, remoteRef: MAIN_REF, remoteSha: NULL_SHA },
      ],
      headSha,
      repoDir: repoRoot,
      run,
      out: (l) => out.push(l),
      err: () => {},
    });
    expect(code).toBe(0);
    expect(ran).toEqual([]);
    expect(out.join('\n')).toContain('nothing pushed needs the conflict/line-budget checks');
  });

  it('on a clean push, fetches origin/main, then merge-tree, then the line-budget check with --head and --repo set to the pushed sha/repo', () => {
    const { run, ran } = record();
    const code = orchestrate({
      updates: [
        {
          localRef: 'refs/heads/x',
          localSha: headSha,
          remoteRef: 'refs/heads/x',
          remoteSha: NULL_SHA,
        },
      ],
      headSha,
      repoDir: '/some/repo',
      run,
      out: () => {},
      err: () => {},
    });
    expect(code).toBe(0);
    expect(ran[0]).toEqual({ cmd: 'git', args: ['fetch', 'origin', 'main', '--quiet'] });
    expect(ran[1]?.cmd).toBe('git');
    expect(ran[1]?.args).toEqual(['merge-tree', '--write-tree', 'origin/main', headSha]);
    expect(ran[2]?.cmd).toBe('node');
    expect(ran[2]?.args).toContain('--head');
    expect(ran[2]?.args[ran[2]!.args.indexOf('--head') + 1]).toBe(headSha);
    expect(ran[2]?.args).toContain('--repo');
    expect(ran[2]?.args[ran[2]!.args.indexOf('--repo') + 1]).toBe('/some/repo');
  });

  it('on a stacked push, fetches and checks the declared immediate parent', () => {
    const { run, ran } = record();
    const code = orchestrate({
      updates: [
        {
          localRef: 'refs/heads/child',
          localSha: headSha,
          remoteRef: 'refs/heads/child',
          remoteSha: NULL_SHA,
        },
      ],
      headSha,
      base: {
        ref: 'origin/parent',
        budgetBase: 'parent',
        fetchRemote: 'origin',
        fetchBranch: 'parent',
      },
      repoDir: '/some/repo',
      run,
      out: () => {},
      err: () => {},
    });
    expect(code).toBe(0);
    expect(ran[0]).toEqual({ cmd: 'git', args: ['fetch', 'origin', 'parent', '--quiet'] });
    expect(ran[1]).toEqual({
      cmd: 'git',
      args: ['merge-tree', '--write-tree', 'origin/parent', headSha],
    });
    expect(ran[2]?.args).toContain('parent');
    expect(ran[2]?.args[ran[2]!.args.indexOf('--base') + 1]).toBe('parent');
  });

  it('fails, and never reaches the line-budget check, when merge-tree conflicts', () => {
    const ran: { cmd: string; args: string[] }[] = [];
    const err: string[] = [];
    const code = orchestrate({
      updates: [
        {
          localRef: 'refs/heads/x',
          localSha: headSha,
          remoteRef: 'refs/heads/x',
          remoteSha: NULL_SHA,
        },
      ],
      headSha,
      repoDir: repoRoot,
      run: (cmd, args) => {
        ran.push({ cmd, args });
        return { status: cmd === 'git' && args[0] === 'merge-tree' ? 1 : 0 };
      },
      out: () => {},
      err: (l) => err.push(l),
    });
    expect(code).toBe(1);
    expect(ran.some((r) => r.cmd === 'node')).toBe(false);
    expect(err.join('\n')).toContain('conflicts with origin/main');
  });

  it('propagates the line-budget check’s own exit code on failure', () => {
    const code = orchestrate({
      updates: [
        {
          localRef: 'refs/heads/x',
          localSha: headSha,
          remoteRef: 'refs/heads/x',
          remoteSha: NULL_SHA,
        },
      ],
      headSha,
      repoDir: repoRoot,
      run: (cmd) => ({ status: cmd === 'node' ? 1 : 0 }),
      out: () => {},
      err: () => {},
    });
    expect(code).toBe(1);
  });

  it('fails when the fetch itself fails, before any per-ref check runs', () => {
    const ran: { cmd: string; args: string[] }[] = [];
    const code = orchestrate({
      updates: [
        {
          localRef: 'refs/heads/x',
          localSha: headSha,
          remoteRef: 'refs/heads/x',
          remoteSha: NULL_SHA,
        },
      ],
      headSha,
      repoDir: repoRoot,
      run: (cmd, args) => {
        ran.push({ cmd, args });
        return { status: cmd === 'git' && args[0] === 'fetch' ? 1 : 0 };
      },
      out: () => {},
      err: () => {},
    });
    expect(code).toBe(1);
    expect(ran).toHaveLength(1);
  });
});

describe(
  'the real binary against throwaway git repos',
  { timeout: REAL_SUBPROCESS_TIMEOUT_MS },
  () => {
    const repos: string[] = [];

    afterEach(() => {
      for (const dir of repos.splice(0)) rmSync(dir, { recursive: true, force: true });
    });

    function makeRepo(): string {
      const dir = mkdtempSync(join(tmpdir(), 'pre-push-check-refs-test-'));
      repos.push(dir);
      execFileSync('git', ['init', '--initial-branch=main', '-q'], { cwd: dir, env: gitEnv() });
      execFileSync('git', ['config', 'user.email', 'test@example.com'], {
        cwd: dir,
        env: gitEnv(),
      });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, env: gitEnv() });
      return dir;
    }

    function commit(dir: string, file: string, content: string, message: string): void {
      writeFileSync(join(dir, file), content);
      execFileSync('git', ['add', file], { cwd: dir, env: gitEnv() });
      execFileSync('git', ['commit', '-q', '-m', message], { cwd: dir, env: gitEnv() });
    }

    function rev(dir: string, ref = 'HEAD'): string {
      return execFileSync('git', ['rev-parse', ref], { cwd: dir, encoding: 'utf8' }).trim();
    }

    function run(
      dir: string,
      stdin: string
    ): { status: number | null; stdout: string; stderr: string } {
      const result = spawnSync('node', [script], {
        cwd: dir,
        input: stdin,
        encoding: 'utf8',
        env: gitEnv(),
      });
      return { status: result.status, stdout: result.stdout, stderr: result.stderr };
    }

    it(
      'THE FIX, end-to-end: a ref pushed at a sha other than the checked-out HEAD is refused, ' +
        'not silently checked against the wrong tree (this is exactly the shape the pnpm/tags.ts ' +
        'incident had — a different branch pushed while another sat checked out)',
      () => {
        const dir = makeRepo();
        commit(dir, 'root.ts', 'const a = 1;\n', 'root');
        const root = rev(dir);
        execFileSync('git', ['checkout', '-q', '-b', 'checked-out-branch'], {
          cwd: dir,
          env: gitEnv(),
        });
        commit(dir, 'other.ts', 'const b = 2;\n', 'checked-out-branch commit');

        // stdin claims a push of a DIFFERENT ref, at the ROOT commit — not
        // reachable from, and not equal to, the checked-out HEAD.
        const stdin = `refs/heads/other-branch ${root} refs/heads/other-branch ${NULL_SHA}\n`;
        const result = run(dir, stdin);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain(`git checkout ${root}`);
        // Never got as far as trying to fetch or merge-tree — a mismatch is
        // refused before any git plumbing that could look like an answer runs.
        expect(result.stderr).not.toContain('conflicts with origin/main');
      }
    );

    it('a push whose remote ref is refs/heads/main is skipped, even though origin does not exist here', () => {
      const dir = makeRepo();
      commit(dir, 'a.ts', 'const a = 1;\n', 'root');
      const head = rev(dir);

      const stdin = `refs/heads/main ${head} ${MAIN_REF} ${NULL_SHA}\n`;
      const result = run(dir, stdin);

      // If this were NOT skipped, `git fetch origin main` would fail (no
      // `origin` remote in this throwaway repo) and the exit code would be 1.
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('nothing pushed needs the conflict/line-budget checks');
    });

    it('a ref pushed at HEAD, with a real local origin remote, actually runs the line-budget check against the pushed sha', () => {
      const dir = makeRepo();
      const originDir = mkdtempSync(join(tmpdir(), 'pre-push-check-refs-origin-'));
      repos.push(originDir);
      execFileSync('git', ['init', '--bare', '-q', '--initial-branch=main'], {
        cwd: originDir,
        env: gitEnv(),
      });

      const body = (n: number): string =>
        `${Array.from({ length: n }, (_, i) => `console.error(${i});`).join('\n')}\n`;

      commit(dir, 'shared.ts', body(199), 'root: shared.ts at 199 lines');
      execFileSync('git', ['remote', 'add', 'origin', originDir], { cwd: dir, env: gitEnv() });
      execFileSync('git', ['push', '-q', 'origin', 'main'], { cwd: dir, env: gitEnv() });

      execFileSync('git', ['checkout', '-q', '-b', 'topic'], { cwd: dir, env: gitEnv() });
      commit(
        dir,
        'shared.ts',
        `${body(199)}console.error('a');\nconsole.error('b');\n`,
        'topic: +2 lines, 201 total'
      );
      const topicSha = rev(dir);

      const stdin = `refs/heads/topic ${topicSha} refs/heads/topic ${NULL_SHA}\n`;
      const result = run(dir, stdin);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('shared.ts');
      expect(result.stdout).toContain('OVER the 200-line cap');
    });

    it('a ref pushed at HEAD, with a real local origin remote, PASSES when it stays under the cap', () => {
      const dir = makeRepo();
      const originDir = mkdtempSync(join(tmpdir(), 'pre-push-check-refs-origin-'));
      repos.push(originDir);
      execFileSync('git', ['init', '--bare', '-q', '--initial-branch=main'], {
        cwd: originDir,
        env: gitEnv(),
      });

      commit(dir, 'shared.ts', 'const a = 1;\n', 'root: small file');
      execFileSync('git', ['remote', 'add', 'origin', originDir], { cwd: dir, env: gitEnv() });
      execFileSync('git', ['push', '-q', 'origin', 'main'], { cwd: dir, env: gitEnv() });

      execFileSync('git', ['checkout', '-q', '-b', 'topic'], { cwd: dir, env: gitEnv() });
      commit(dir, 'shared.ts', 'const a = 1;\nconst b = 2;\n', 'topic: one more line');
      const topicSha = rev(dir);

      const stdin = `refs/heads/topic ${topicSha} refs/heads/topic ${NULL_SHA}\n`;
      const result = run(dir, stdin);

      expect(result.status).toBe(0);
    });

    it('end-to-end: a checked-out child uses its declared parent instead of origin/main', () => {
      const dir = makeRepo();
      const originDir = mkdtempSync(join(tmpdir(), 'pre-push-check-refs-origin-'));
      repos.push(originDir);
      execFileSync('git', ['init', '--bare', '-q', '--initial-branch=main'], {
        cwd: originDir,
        env: gitEnv(),
      });
      execFileSync('git', ['remote', 'add', 'origin', originDir], { cwd: dir, env: gitEnv() });

      commit(dir, 'shared.ts', 'const value = "root";\n', 'root');
      execFileSync('git', ['push', '-q', 'origin', 'main'], { cwd: dir, env: gitEnv() });

      execFileSync('git', ['checkout', '-q', '-b', 'parent'], { cwd: dir, env: gitEnv() });
      commit(dir, 'shared.ts', 'const value = "parent";\n', 'parent change');
      execFileSync('git', ['push', '-q', 'origin', 'parent'], { cwd: dir, env: gitEnv() });

      execFileSync('git', ['checkout', '-q', 'main'], { cwd: dir, env: gitEnv() });
      commit(dir, 'shared.ts', 'const value = "main";\n', 'main change');
      execFileSync('git', ['push', '-q', 'origin', 'main'], { cwd: dir, env: gitEnv() });

      execFileSync('git', ['checkout', '-q', '-b', 'child', 'parent'], {
        cwd: dir,
        env: gitEnv(),
      });
      commit(dir, 'child.ts', 'const child = true;\n', 'child change');
      execFileSync('git', ['config', 'branch.child.remote', 'origin'], { cwd: dir, env: gitEnv() });
      execFileSync('git', ['config', 'branch.child.merge', 'refs/heads/parent'], {
        cwd: dir,
        env: gitEnv(),
      });

      const childSha = rev(dir);
      const stdin = `refs/heads/child ${childSha} refs/heads/child ${NULL_SHA}\n`;
      const result = run(dir, stdin);

      expect(result.status).toBe(0);
    });

    it('an annotated tag pushed at HEAD is checked against its commit, not refused as a HEAD mismatch', () => {
      const dir = makeRepo();
      const originDir = mkdtempSync(join(tmpdir(), 'pre-push-check-refs-origin-'));
      repos.push(originDir);
      execFileSync('git', ['init', '--bare', '-q', '--initial-branch=main'], {
        cwd: originDir,
        env: gitEnv(),
      });

      commit(dir, 'shared.ts', 'const a = 1;\n', 'root: small file');
      execFileSync('git', ['remote', 'add', 'origin', originDir], { cwd: dir, env: gitEnv() });
      execFileSync('git', ['push', '-q', 'origin', 'main'], { cwd: dir, env: gitEnv() });
      execFileSync('git', ['tag', '-a', 'v0.1.0', '-m', 'Release v0.1.0'], {
        cwd: dir,
        env: gitEnv(),
      });
      const tagObject = rev(dir, 'v0.1.0');
      expect(tagObject).not.toBe(rev(dir));

      const stdin = `refs/tags/v0.1.0 ${tagObject} refs/tags/v0.1.0 ${NULL_SHA}\n`;
      const result = run(dir, stdin);

      expect(result.stderr).not.toContain('which is not the checked-out HEAD');
      expect(result.status).toBe(0);
    });
  }
);

describe('peelToCommits', () => {
  const tagObject = 't'.repeat(40);
  const commitSha = 'c'.repeat(40);

  it('replaces an annotated tag object sha with the commit it points at', () => {
    const asked: string[] = [];
    const [peeled] = peelToCommits(
      [
        {
          localRef: 'refs/tags/v1',
          localSha: tagObject,
          remoteRef: 'refs/tags/v1',
          remoteSha: NULL_SHA,
        },
      ],
      (revision) => {
        asked.push(revision);
        return commitSha;
      }
    );

    expect(asked).toEqual([`${tagObject}^{commit}`]);
    expect(peeled?.localSha).toBe(commitSha);
  });

  it('leaves a delete untouched and never asks git about it', () => {
    const update = {
      localRef: '(delete)',
      localSha: NULL_SHA,
      remoteRef: 'refs/heads/x',
      remoteSha: 'b'.repeat(40),
    };
    const peeled = peelToCommits([update], () => {
      throw new Error('a delete must not be resolved');
    });

    expect(peeled).toEqual([update]);
  });

  it('keeps the sha as given when it cannot be peeled, so it stays a mismatch rather than passing', () => {
    const update = {
      localRef: 'refs/heads/x',
      localSha: tagObject,
      remoteRef: 'refs/heads/x',
      remoteSha: NULL_SHA,
    };

    expect(peelToCommits([update], () => undefined)).toEqual([update]);
  });
});
