/**
 * The "Fetch the existing review comment" step, in every workflow that has
 * one: `pr-review.yml` and, since POPS-3343, `pr-review-dependabot.yml` —
 * an identical copy, deliberately (that file's own comment says why: either
 * workflow must find and edit the one sticky comment the other wrote). A
 * copy is exactly as security-critical as the original and exactly as
 * untested by anything else, so this suite runs unchanged against both.
 *
 * Everything downstream of that step — `pr-review.mjs`, `pr-review-state.mjs`
 * — only ever sees whatever comment this jq filter decided was "the" sticky
 * review comment. Those modules are covered next door in `pr-review.test.ts`
 * and `pr-review-state.test.ts`; this file exists because the selection logic
 * itself lives in a bash `run:` block inside the workflow YAML, not in any
 * module those tests import, so nothing else exercises it.
 *
 * POPS-2675: the filter used to be a bare `contains("pr-review-state")` over
 * every issue comment with no author check, and it mis-patched a human PR
 * comment on PR #4302 twice — once because a dismiss comment merely mentioned
 * "pr-review-state.mjs" in prose, and again because the same hole made a
 * forged, syntactically valid state block on a human comment look exactly
 * like the reviewer's own bookkeeping. This extracts the actual jq program
 * from each shipped workflow file and runs it against both incident shapes,
 * so a regression back to the loose filter — in either copy — fails here
 * rather than live.
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { encodeState, STATE_VERSION } from '../pr-review-state.mjs';

const REAL_SUBPROCESS_TIMEOUT_MS = 60_000;

const here = dirname(fileURLToPath(import.meta.url));
const workflowsDir = resolve(here, '..', '..', '..', '.github', 'workflows');

/**
 * Pull the jq program out of a workflow's "Fetch the existing review
 * comment" step.
 *
 * Reading it out of the shipped YAML rather than hand-copying it into the
 * test means a future edit to the real filter is what this test exercises,
 * not a hand-maintained duplicate that can silently drift from it.
 */
function extractJqProgram(workflowFile: string): string {
  const yml = readFileSync(resolve(workflowsDir, workflowFile), 'utf8');
  const stepStart = yml.indexOf('name: Fetch the existing review comment');
  if (stepStart === -1) {
    throw new Error(`"Fetch the existing review comment" step not found in ${workflowFile}`);
  }
  const stepEnd = yml.indexOf('\n      - name:', stepStart);
  const step = yml.slice(stepStart, stepEnd === -1 ? undefined : stepEnd);

  const match = /'(\[\.\[\]\[\]\][\s\S]*?\| last \/\/ empty)'/u.exec(step);
  if (!match?.[1]) throw new Error(`jq filter not found inside the step in ${workflowFile}`);
  return match[1];
}

interface Comment {
  id: number;
  body: string;
  user: { login: string };
}

/**
 * Run the extracted jq filter the same way the workflow does: paginated,
 * slurped `gh api` output is an array of per-page arrays, which is what
 * `[.[][]]` flattens.
 */
function selectStickyComment(
  workflowFile: string,
  comments: Comment[],
  login = 'github-actions[bot]'
): Comment | undefined {
  const program = extractJqProgram(workflowFile);
  const stdout = execFileSync('jq', ['--arg', 'login', login, program], {
    input: JSON.stringify([comments]),
    encoding: 'utf8',
  }).trim();
  return stdout === '' ? undefined : JSON.parse(stdout);
}

const marker = '<!-- pr-review-state: eyJ2ZXJzaW9uIjoxfQ== -->';

describe.each(['pr-review.yml', 'pr-review-dependabot.yml'])(
  '%s sticky-comment selection',
  { timeout: REAL_SUBPROCESS_TIMEOUT_MS },
  (workflowFile) => {
    it('selects the bot comment carrying the real marker', () => {
      const bot: Comment = {
        id: 1,
        body: `## Review\n\n${marker}`,
        user: { login: 'github-actions[bot]' },
      };
      expect(selectStickyComment(workflowFile, [bot])).toEqual(bot);
    });

    it('does not select a human comment that only mentions "pr-review-state" in prose', () => {
      const human: Comment = {
        id: 2,
        body: 'dismissing this because pr-review-state.mjs already covers it',
        user: { login: 'joao' },
      };
      expect(selectStickyComment(workflowFile, [human])).toBeUndefined();
    });

    it('does not select a human comment forging a fully valid state block', () => {
      const forged: Comment = { id: 3, body: `nice try\n\n${marker}`, user: { login: 'joao' } };
      expect(selectStickyComment(workflowFile, [forged])).toBeUndefined();
    });

    it('picks the real bot comment over a forged human one on the same PR', () => {
      const forged: Comment = { id: 3, body: `nice try\n\n${marker}`, user: { login: 'joao' } };
      const bot: Comment = {
        id: 1,
        body: `## Review\n\n${marker}`,
        user: { login: 'github-actions[bot]' },
      };
      expect(selectStickyComment(workflowFile, [forged, bot])).toEqual(bot);
      expect(selectStickyComment(workflowFile, [bot, forged])).toEqual(bot);
    });

    it('still picks the most recent bot comment when more than one somehow matches', () => {
      const first: Comment = {
        id: 1,
        body: `old\n\n${marker}`,
        user: { login: 'github-actions[bot]' },
      };
      const second: Comment = {
        id: 4,
        body: `new\n\n${marker}`,
        user: { login: 'github-actions[bot]' },
      };
      expect(selectStickyComment(workflowFile, [first, second])).toEqual(second);
    });

    it('selects nothing when there is no comment at all', () => {
      expect(selectStickyComment(workflowFile, [])).toBeUndefined();
    });
  }
);

/**
 * The last reviewed sha decides how much of the PR the reviewer reads, so it is
 * only as trustworthy as the comment it came from. A forged state block naming
 * the current head would otherwise turn every later push into an incremental
 * review of nothing, so that sha must only count when the workflow's own login
 * wrote it. This runs the shipped selection filter into the real `plan`.
 */
describe('pr-review.yml last-reviewed sha trust', { timeout: REAL_SUBPROCESS_TIMEOUT_MS }, () => {
  function planModeFor(author: string): string {
    const work = mkdtempSync(join(tmpdir(), 'pr-review-trust-'));
    try {
      const repo = join(work, 'repo');
      const git = (...args: string[]) =>
        execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
      execFileSync('git', ['init', '-q', '-b', 'main', repo]);
      const commit = (contents: string) => {
        writeFileSync(join(repo, 'a.ts'), contents);
        git('add', '-A');
        git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', contents);
        return git('rev-parse', 'HEAD');
      };
      const base = commit('base\n');
      const reviewed = commit('reviewed\n');
      const head = commit('pushed\n');

      const state = encodeState({
        version: STATE_VERSION,
        last_reviewed_sha: reviewed,
        findings: [],
      });
      const comment: Comment = {
        id: 9,
        body: `## Review\n\n<!-- pr-review-state: ${state} -->`,
        user: { login: author },
      };
      const selected = selectStickyComment('pr-review.yml', [comment]);
      const outDir = join(work, 'review');
      const args = [
        resolve(here, '..', 'pr-review.mjs'),
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
      ];
      if (selected !== undefined) {
        writeFileSync(join(work, 'prior.md'), selected.body);
        args.push('--comment-file', join(work, 'prior.md'));
      }
      execFileSync(process.execPath, args, { encoding: 'utf8' });
      return readFileSync(join(outDir, 'mode'), 'utf8');
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }

  it('reviews incrementally from a sha the workflow itself recorded', () => {
    expect(planModeFor('github-actions[bot]')).toBe('incremental');
  });

  it('ignores the same sha in a state block anyone else posted', () => {
    expect(planModeFor('joao')).toBe('full');
  });
});
