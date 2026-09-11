/**
 * The commit attribution guard, against its own fixtures and against real
 * history on `main`.
 *
 * `--self-test` owns the planted cases and runs for real in the first block.
 * A self-test cannot find the blind spot that produced it (POPS-2110), so the
 * second block points the guard at two commits already on `main`: one squash
 * commit that carried a copied co-author trailer onto `main`, and one that
 * carried nothing. If the guard does not tell those apart, it does not catch
 * what it claims to.
 *
 * The names the guard rejects are never written out here, for the same reason
 * the guard spells them indirectly: this file is a source file, and the rule
 * covers source files too.
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  attributionLines,
  commitsInRange,
  commitViolations,
  findViolations,
} from '../check-commit-attribution.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const guard = resolve(repoRoot, 'scripts', 'ci', 'check-commit-attribution.mjs');

/** This file spawns `node` and `git` against temporary repositories and this one. */
const REAL_SUBPROCESS_TIMEOUT_MS = 60_000;

const ASSISTANT = String.fromCharCode(99, 108, 97, 117, 100, 101);
const VENDOR = String.fromCharCode(97, 110, 116, 104, 114, 111, 112, 105, 99);
const TRAILER = `Co-Authored-By: ${ASSISTANT} Model <noreply@${VENDOR}.com>`;

/**
 * Two commits already on `main`, read out of history rather than planted.
 * The scripts-tests job checks out with `fetch-depth: 0`, so both, and their
 * parents, are reachable in CI.
 */
const ON_MAIN = {
  carriedATrailer: '8a215477a',
  carriedNothing: '6f97b2e34',
} as const;

describe('the guard proves itself', { timeout: REAL_SUBPROCESS_TIMEOUT_MS }, () => {
  it('passes its own --self-test', () => {
    const output = execFileSync(process.execPath, [guard, '--self-test'], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: REAL_SUBPROCESS_TIMEOUT_MS,
    });
    expect(output).toMatch(/self-test mutations behave as stated/u);
  });

  it('refuses to run without a range rather than reporting OK over nothing', () => {
    let status = 0;
    try {
      execFileSync(process.execPath, [guard], {
        cwd: repoRoot,
        stdio: 'pipe',
        timeout: REAL_SUBPROCESS_TIMEOUT_MS,
      });
    } catch (error) {
      status = (error as { status?: number }).status ?? -1;
    }
    expect(status).not.toBe(0);
  });
});

describe('real history on main', { timeout: REAL_SUBPROCESS_TIMEOUT_MS }, () => {
  const onlyCommit = (sha: string) => commitsInRange({ base: `${sha}^`, head: sha });

  it('catches the trailer a squash merge copied onto main', () => {
    const commits = onlyCommit(ON_MAIN.carriedATrailer);

    expect(commits).toHaveLength(1);
    expect(findViolations({ commits }).length).toBeGreaterThan(0);
  });

  it('passes a commit on main that credits nobody', () => {
    const commits = onlyCommit(ON_MAIN.carriedNothing);

    expect(commits).toHaveLength(1);
    expect(findViolations({ commits })).toEqual([]);
  });

  it('throws on a range git cannot read, rather than returning no commits', () => {
    expect(() => commitsInRange({ base: 'refs/heads/no-such-branch-anywhere' })).toThrow();
  });
});

describe('attributionLines', () => {
  it('finds a co-author trailer', () => {
    expect(attributionLines(`fix: one\n\n${TRAILER}`)).toEqual([TRAILER]);
  });

  it('finds a generated-with footer, whatever follows it', () => {
    expect(attributionLines('Body.\n\nGenerated with some tool')).toEqual([
      'Generated with some tool',
    ]);
  });

  it('matches the names case-insensitively', () => {
    expect(attributionLines(ASSISTANT.toUpperCase())).toHaveLength(1);
    expect(attributionLines(`by ${VENDOR.toUpperCase()}`)).toHaveLength(1);
  });

  it('does not match a word that only contains the same letters', () => {
    expect(attributionLines(`the ${ASSISTANT}tte widget and ${VENDOR}al notes`)).toEqual([]);
  });

  it('ignores a clean message', () => {
    expect(attributionLines('fix(finance): something\n\nCloses POPS-1.')).toEqual([]);
  });
});

describe('commitViolations', () => {
  const clean = {
    sha: 'abcdef1234567890',
    authorEmail: 'someone@knoxio.dev',
    committerEmail: 'someone@knoxio.dev',
    message: 'fix: one',
  };

  it('names the commit and the offending line', () => {
    const [violation] = commitViolations({ ...clean, message: `fix: one\n\n${TRAILER}` });
    expect(violation).toContain('abcdef123');
    expect(violation).toContain(TRAILER);
  });

  it('reports a fixture author', () => {
    expect(commitViolations({ ...clean, authorEmail: 'fixture@example.invalid' })).toHaveLength(1);
  });

  it('reports a fixture committer that differs from the author', () => {
    expect(commitViolations({ ...clean, committerEmail: 'fixture@example.invalid' })).toHaveLength(
      1
    );
  });

  it('reports one fixture identity once when it is both author and committer', () => {
    const both = {
      ...clean,
      authorEmail: 'fixture@example.invalid',
      committerEmail: 'fixture@example.invalid',
    };
    expect(commitViolations(both)).toHaveLength(1);
  });

  it('reports nothing for a clean commit', () => {
    expect(commitViolations(clean)).toEqual([]);
  });
});
