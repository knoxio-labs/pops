/**
 * `pr-review.yml`'s "Fetch the existing review comment" step, specifically.
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
 * from the shipped workflow file and runs it against both incident shapes, so
 * a regression back to the loose filter fails here rather than live.
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const workflowPath = resolve(here, '..', '..', '..', '.github', 'workflows', 'pr-review.yml');

/**
 * Pull the jq program out of the "Fetch the existing review comment" step.
 *
 * Reading it out of the shipped YAML rather than hand-copying it into the
 * test means a future edit to the real filter is what this test exercises,
 * not a hand-maintained duplicate that can silently drift from it.
 */
function extractJqProgram(): string {
  const yml = readFileSync(workflowPath, 'utf8');
  const stepStart = yml.indexOf('name: Fetch the existing review comment');
  if (stepStart === -1) throw new Error('"Fetch the existing review comment" step not found');
  const stepEnd = yml.indexOf('\n      - name:', stepStart);
  const step = yml.slice(stepStart, stepEnd === -1 ? undefined : stepEnd);

  const match = /'(\[\.\[\]\[\]\][\s\S]*?\| last \/\/ empty)'/u.exec(step);
  if (!match?.[1]) throw new Error('jq filter not found inside the step');
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
  comments: Comment[],
  login = 'github-actions[bot]'
): Comment | undefined {
  const program = extractJqProgram();
  const stdout = execFileSync('jq', ['--arg', 'login', login, program], {
    input: JSON.stringify([comments]),
    encoding: 'utf8',
  }).trim();
  return stdout === '' ? undefined : JSON.parse(stdout);
}

const marker = '<!-- pr-review-state: eyJ2ZXJzaW9uIjoxfQ== -->';

describe('pr-review.yml sticky-comment selection', () => {
  it('selects the bot comment carrying the real marker', () => {
    const bot: Comment = {
      id: 1,
      body: `## Review\n\n${marker}`,
      user: { login: 'github-actions[bot]' },
    };
    expect(selectStickyComment([bot])).toEqual(bot);
  });

  it('does not select a human comment that only mentions "pr-review-state" in prose', () => {
    const human: Comment = {
      id: 2,
      body: 'dismissing this because pr-review-state.mjs already covers it',
      user: { login: 'joao' },
    };
    expect(selectStickyComment([human])).toBeUndefined();
  });

  it('does not select a human comment forging a fully valid state block', () => {
    const forged: Comment = { id: 3, body: `nice try\n\n${marker}`, user: { login: 'joao' } };
    expect(selectStickyComment([forged])).toBeUndefined();
  });

  it('picks the real bot comment over a forged human one on the same PR', () => {
    const forged: Comment = { id: 3, body: `nice try\n\n${marker}`, user: { login: 'joao' } };
    const bot: Comment = {
      id: 1,
      body: `## Review\n\n${marker}`,
      user: { login: 'github-actions[bot]' },
    };
    expect(selectStickyComment([forged, bot])).toEqual(bot);
    expect(selectStickyComment([bot, forged])).toEqual(bot);
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
    expect(selectStickyComment([first, second])).toEqual(second);
  });

  it('selects nothing when there is no comment at all', () => {
    expect(selectStickyComment([])).toBeUndefined();
  });
});
