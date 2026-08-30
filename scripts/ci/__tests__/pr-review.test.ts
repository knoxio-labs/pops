/**
 * The compounding reviewer end to end, against a real git repository.
 *
 * The unit-level bookkeeping is covered next door in
 * `pr-review-state.test.ts`. What is asserted here is the part that only shows
 * up when the two subcommands are run in sequence over real commits: that the
 * second run reviews the new commits rather than the whole PR again, that an
 * open finding is carried into the next prompt so the model does not report it
 * twice, that a fix flips it to resolved without anybody saying so, and that a
 * force-push falls back to a full review instead of diffing against a commit
 * that no longer exists.
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseState } from '../pr-review-state.mjs';
import { carriedBlock, fill, PROMPT_TEMPLATE, RUBRIC, SCOPE } from '../pr-review.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const driver = resolve(here, '..', 'pr-review.mjs');

let repo: string;
let work: string;

function git(...args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function commit(file: string, contents: string, message: string): string {
  writeFileSync(join(repo, file), contents);
  git('add', '-A');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', message);
  return git('rev-parse', 'HEAD');
}

function run(args: string[]): string {
  return execFileSync(process.execPath, [driver, ...args], { encoding: 'utf8' });
}

function plan(base: string, head: string, priorComment?: string): { mode: string; prompt: string } {
  const outDir = join(work, 'review');
  const comment = join(work, 'prior.md');
  if (priorComment !== undefined) writeFileSync(comment, priorComment);
  run([
    'plan',
    '--repo-root',
    repo,
    '--base',
    base,
    '--head',
    head,
    '--out-dir',
    outDir,
    '--findings-path',
    join(outDir, 'findings.json'),
    ...(priorComment === undefined ? [] : ['--comment-file', comment]),
  ]);
  const mode = readFileSync(join(outDir, 'mode'), 'utf8');
  const promptPath = join(outDir, 'prompt.txt');
  return { mode, prompt: mode === 'empty' ? '' : readFileSync(promptPath, 'utf8') };
}

function publish(head: string, mode: string, findings: unknown, priorComment?: string): string {
  const findingsPath = join(work, 'findings.json');
  const comment = join(work, 'prior.md');
  const out = join(work, 'comment.md');
  writeFileSync(findingsPath, typeof findings === 'string' ? findings : JSON.stringify(findings));
  if (priorComment !== undefined) writeFileSync(comment, priorComment);
  run([
    'publish',
    '--repo-root',
    repo,
    '--head',
    head,
    '--mode',
    mode,
    '--findings',
    findingsPath,
    '--out',
    out,
    ...(priorComment === undefined ? [] : ['--comment-file', comment]),
  ]);
  return readFileSync(out, 'utf8');
}

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'pr-review-'));
  repo = join(work, 'repo');
  mkdirSync(repo);
  git('init', '-q', '-b', 'main');
});

afterEach(() => rmSync(work, { recursive: true, force: true }));

describe('a pull request reviewed across three pushes', () => {
  it('reviews fully, then incrementally, then reports the fix', () => {
    const base = commit('a.ts', 'export const a = 1;\n', 'base');
    const head1 = commit('a.ts', 'export const a = 1 as unknown as number;\n', 'add a cast');

    const first = plan(base, head1);
    expect(first.mode).toBe('full');
    expect(first.prompt).toContain('as unknown as number');
    expect(first.prompt).toContain(SCOPE.full);
    expect(first.prompt).toContain('This is the first review');

    const comment1 = publish(head1, 'full', {
      findings: [
        {
          file: 'a.ts',
          title: 'unchecked cast',
          severity: 'high',
          snippet: 'as unknown as number',
          body: 'The cast defeats the type system.',
        },
      ],
    });
    expect(comment1).toContain('1 open finding.');
    expect(comment1).toContain('HIGH');

    // Second push: an unrelated change. The diff must cover only the new
    // commit, and the still-open finding must be handed to the model as
    // already-reported rather than left to be found and reported twice.
    const head2 = commit('b.ts', 'export const b = 2;\n', 'add b');
    const second = plan(base, head2, comment1);
    expect(second.mode).toBe('incremental');
    expect(second.prompt).toContain('export const b = 2;');
    expect(second.prompt).not.toContain('a.ts: unchecked cast\n- ');
    expect(second.prompt).toContain('- a.ts: unchecked cast');
    expect(second.prompt).toContain(SCOPE.incremental);

    const comment2 = publish(head2, 'incremental', { findings: [] }, comment1);
    expect(comment2).toContain('1 open finding.');
    // The finding was first reported on an earlier commit, so it is dated.
    expect(comment2).toContain(`since \`${head1.slice(0, 7)}\``);

    // Third push: the cast is gone. Nobody tells the reviewer; it recomputes.
    const head3 = commit('a.ts', 'export const a = 1;\n', 'drop the cast');
    const comment3 = publish(head3, 'incremental', { findings: [] }, comment2);
    expect(comment3).toContain('No open findings.');
    expect(comment3).toContain('~~unchecked cast~~');
    expect(parseState(comment3).findings[0]).toMatchObject({
      status: 'resolved',
      resolved_in: head3,
    });
  });

  it('marks a finding resolved when the fix lands in a different file', () => {
    // POPS-2705, reproduced end to end. The finding is anchored to the file
    // that declares the secret — correctly, and that declaration stays — and
    // the fix is the entry added to the file that must supply it. Before the
    // remedy, the next pass re-checked only the anchor, found the declaration
    // still there, and re-posted the finding as open on a branch that had
    // already fixed it.
    const base = commit('defaults.yml', 'secrets: {}\n', 'base');
    writeFileSync(join(repo, 'compose.yml'), 'secrets:\n  finance_api_key:\n    external: true\n');
    const head1 = commit('defaults.yml', 'secrets: {}\n', 'declare the secret');

    const comment1 = publish(head1, 'full', {
      findings: [
        {
          file: 'compose.yml',
          title: 'finance_api_key has no source',
          severity: 'high',
          snippet: 'finance_api_key:',
          body: 'Nothing supplies this secret, so `docker compose up` cannot resolve it.',
          remedy: { file: 'defaults.yml', contains: 'finance_api_key:' },
        },
      ],
    });
    expect(comment1).toContain('1 open finding.');
    expect(comment1).toContain('Resolves when `defaults.yml` contains:');

    // The fix: the entry lands in the other file. The anchor is untouched.
    const head2 = commit(
      'defaults.yml',
      'secrets:\n  finance_api_key: "{{ vault_key }}"\n',
      'supply it'
    );
    const comment2 = publish(head2, 'incremental', { findings: [] }, comment1);
    expect(comment2).toContain('No open findings.');
    expect(comment2).toContain('~~finance_api_key has no source~~');
    expect(parseState(comment2).findings[0]).toMatchObject({
      status: 'resolved',
      resolved_in: head2,
    });

    // And it is not a one-way latch: revert the supplying file and the finding
    // comes back, because status is recomputed rather than remembered.
    const head3 = commit('defaults.yml', 'secrets: {}\n', 'revert it');
    const comment3 = publish(head3, 'incremental', { findings: [] }, comment2);
    expect(comment3).toContain('1 open finding.');
    expect(base).not.toBe(head3);
  });

  it('reports empty when head has not moved since the last review', () => {
    const base = commit('a.ts', 'a\n', 'base');
    const head = commit('a.ts', 'b\n', 'change');
    const comment = publish(head, 'full', { findings: [] });
    expect(plan(base, head, comment).mode).toBe('empty');
  });

  it('falls back to a full review after a force-push rewrites the reviewed commit', () => {
    const base = commit('a.ts', 'a\n', 'base');
    const rewritten = commit('a.ts', 'b\n', 'change');
    const comment = publish(rewritten, 'full', { findings: [] });

    git('reset', '--hard', base);
    const head = commit('a.ts', 'c\n', 'different change');
    expect(head).not.toBe(rewritten);

    const after = plan(base, head, comment);
    expect(after.mode).toBe('full');
    expect(after.prompt).toContain('+c');
  });
});

describe('the reviewer misbehaving', () => {
  it('keeps prior state when the findings file is unparseable', () => {
    commit('a.ts', 'export const a = 1;\n', 'base');
    const head = commit('a.ts', 'export const a = 2;\n', 'change');
    const first = publish(head, 'full', {
      findings: [{ file: 'a.ts', title: 'kept', snippet: 'export const a = 2;', severity: 'low' }],
    });

    const after = publish(head, 'incremental', 'not json at all', first);
    expect(after).toContain('1 open finding.');
    expect(after).toContain('kept');
  });

  it('keeps prior state when the findings file was never written', () => {
    const head = commit('a.ts', 'export const a = 2;\n', 'base');
    const first = publish(head, 'full', {
      findings: [{ file: 'a.ts', title: 'kept', snippet: 'export const a = 2;', severity: 'low' }],
    });

    const out = join(work, 'comment2.md');
    execFileSync(process.execPath, [
      driver,
      'publish',
      '--repo-root',
      repo,
      '--head',
      head,
      '--mode',
      'incremental',
      '--findings',
      join(work, 'absent.json'),
      '--comment-file',
      join(work, 'prior.md'),
      '--out',
      out,
    ]);
    writeFileSync(join(work, 'prior.md'), first);
    expect(readFileSync(out, 'utf8')).toContain('Review');
  });

  it('drops one malformed finding and keeps the rest of the run', () => {
    const head = commit('a.ts', 'export const a = 2;\n', 'base');
    const comment = publish(head, 'full', {
      findings: [
        { title: 'no file at all', severity: 'high' },
        { file: 'a.ts', title: 'real one', snippet: 'export const a = 2;', severity: 'high' },
      ],
    });
    expect(comment).toContain('1 open finding.');
    expect(comment).toContain('real one');
    expect(comment).not.toContain('no file at all');
  });

  it('verifies a finding against the reviewed commit, not the working tree', () => {
    // The reviewer runs with Write access in this checkout. A stray write must
    // not be able to talk the verifier out of a real finding.
    const head = commit('a.ts', 'export const a = 1 as unknown as number;\n', 'base');
    writeFileSync(join(repo, 'a.ts'), 'export const a = 1;\n');
    const comment = publish(head, 'full', {
      findings: [
        { file: 'a.ts', title: 'cast', snippet: 'as unknown as number', severity: 'high' },
      ],
    });
    expect(comment).toContain('1 open finding.');
  });
});

describe('the prompt', () => {
  it('names every non-negotiable invariant', () => {
    const prompt = fill(PROMPT_TEMPLATE, {
      scope: SCOPE.full,
      rubric: RUBRIC.join('\n- '),
      carried: carriedBlock([]),
      out: '/x/findings.json',
      diff: 'diff body',
    });
    for (const rule of RUBRIC) expect(prompt).toContain(rule);
  });

  it('does not re-expand a placeholder that appears inside the diff', () => {
    // The diff is attacker-adjacent text: a PR can contain the literal string
    // `{rubric}`, and a naive sequence of replacements would expand it.
    const prompt = fill(PROMPT_TEMPLATE, {
      scope: SCOPE.full,
      rubric: 'RUBRIC-MARKER',
      carried: carriedBlock([]),
      out: '/x/findings.json',
      diff: '+const s = "{rubric}";',
    });
    expect(prompt).toContain('+const s = "{rubric}";');
    expect(prompt.match(/RUBRIC-MARKER/gu)).toHaveLength(1);
  });

  it('tells the model not to re-report carried findings', () => {
    expect(carriedBlock(['a.ts: cast'])).toContain('Do NOT report them again');
    expect(carriedBlock(['a.ts: cast'])).toContain('- a.ts: cast');
  });

  it('says it is a first review when nothing is carried', () => {
    expect(carriedBlock([])).toContain('first review');
  });
});

describe('usage', () => {
  it('exits 2 on an unknown command', () => {
    expect(() => run(['frobnicate'])).toThrowError(/status 2|Command failed/u);
  });

  it('exits 2 when a required flag is missing', () => {
    expect(() => run(['plan', '--base', 'a'])).toThrowError(/status 2|Command failed/u);
  });

  it('passes its own self-test', () => {
    expect(run(['--self-test'])).toContain('self-test OK');
  });
});
