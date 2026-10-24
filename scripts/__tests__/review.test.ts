/**
 * `mise review` with the model call stubbed: the exit code is the contract an
 * agent acts on before its first push, so every way the review can end is
 * pinned here against a real git repository.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RUBRIC } from '../ci/pr-review.mjs';
import { runLocalReview } from '../review.mjs';

const REAL_SUBPROCESS_TIMEOUT_MS = 60_000;

let repo: string;
let out: string[];
let err: string[];

function git(...args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function commit(file: string, contents: string): void {
  writeFileSync(join(repo, file), contents);
  git('add', '-A');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', file);
}

type Runner = NonNullable<Parameters<typeof runLocalReview>[0]['runModel']>;

/** A reviewer that writes `payload` to the findings path the prompt names. */
function reviewerWriting(payload: unknown, seen: string[] = []): Runner {
  return ({ prompt }) => {
    seen.push(prompt);
    const path = /Write your findings as JSON to `([^`]+)`/u.exec(prompt)?.[1];
    if (path === undefined) throw new Error('prompt names no findings path');
    writeFileSync(path, typeof payload === 'string' ? payload : JSON.stringify(payload));
    return { status: 0 };
  };
}

function review(runModel: Runner, base = 'main'): number {
  return runLocalReview({
    repoRoot: repo,
    base,
    model: 'stub',
    runModel,
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  });
}

const finding = (severity: string | undefined) => ({
  file: 'a.ts',
  title: `a ${severity ?? 'missing'} finding`,
  ...(severity === undefined ? {} : { severity }),
  snippet: 'export const a = 2;',
  body: 'what is wrong',
});

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'mise-review-'));
  git('init', '-q', '-b', 'main');
  commit('a.ts', 'export const a = 1;\n');
  git('checkout', '-q', '-b', 'feature');
  commit('a.ts', 'export const a = 2;\n');
  out = [];
  err = [];
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('mise review', { timeout: REAL_SUBPROCESS_TIMEOUT_MS }, () => {
  it('sends the CI prompt and rubric over base...HEAD', () => {
    const seen: string[] = [];
    review(reviewerWriting({ findings: [] }, seen));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain(RUBRIC[0]);
    expect(seen[0]).toContain('+export const a = 2;');
    expect(seen[0]).toContain('Review the complete diff of this pull request');
  });

  it('exits 1 on a blocking finding and prints it with its severity', () => {
    expect(review(reviewerWriting({ findings: [finding('low'), finding('high')] }))).toBe(1);
    expect(out[out.findIndex((l) => l.startsWith('HIGH'))]).toBe('HIGH — a high finding');
    expect(out.findIndex((l) => l.startsWith('HIGH'))).toBeLessThan(
      out.findIndex((l) => l.startsWith('LOW'))
    );
    expect(out.at(-1)).toBe('2 findings: 1 blocking, 1 advisory.');
  });

  it('exits 1 on a medium finding', () => {
    expect(review(reviewerWriting({ findings: [finding('medium')] }))).toBe(1);
  });

  it('treats a finding with no severity as blocking, as the gate does', () => {
    expect(review(reviewerWriting({ findings: [finding(undefined)] }))).toBe(1);
    expect(out).toContain('MEDIUM — a missing finding');
  });

  it('exits 0 when every finding is advisory', () => {
    expect(review(reviewerWriting({ findings: [finding('low')] }))).toBe(0);
    expect(out).toContain('LOW — a low finding');
  });

  it('exits 0 on a clean review', () => {
    expect(review(reviewerWriting({ findings: [] }))).toBe(0);
    expect(out).toContain('No findings.');
  });

  it('exits 2 when the reviewer writes no findings file', () => {
    expect(review(() => ({ status: 1 }))).toBe(2);
    expect(err.join('\n')).toContain('wrote no findings file');
  });

  it('exits 2 when the findings file is not JSON, rather than reporting clean', () => {
    expect(review(reviewerWriting('not json'))).toBe(2);
  });

  it('exits 2 when the findings file has no findings array', () => {
    expect(review(reviewerWriting({ resolved: [] }))).toBe(2);
  });

  it('does not reuse a findings file left over from an earlier run', () => {
    review(reviewerWriting({ findings: [finding('high')] }));
    expect(review(() => ({ status: 0 }))).toBe(2);
  });

  it('exits 2 when the CLI cannot be started', () => {
    expect(review(() => ({ status: null, error: 'the `claude` CLI is not on PATH' }))).toBe(2);
  });

  it('exits 2 for a base that does not resolve, without calling the model', () => {
    const seen: string[] = [];
    expect(review(reviewerWriting({ findings: [] }, seen), 'origin/nope')).toBe(2);
    expect(seen).toHaveLength(0);
  });

  it('exits 0 without calling the model when there is nothing to review', () => {
    const seen: string[] = [];
    expect(review(reviewerWriting({ findings: [finding('high')] }, seen), 'feature')).toBe(0);
    expect(seen).toHaveLength(0);
  });
});
