/**
 * ADR-045: a guard ships with a test proving it REPORTS, not merely that it
 * passes. This guard exits zero on a collision by design (see its header), so
 * the exit code carries almost none of its verdict — which makes the
 * reporting assertions here the whole test rather than a nicety. Every check
 * in the `reports` block below would still pass if the collision detection
 * were deleted and only the exit code were asserted, and that is exactly the
 * blind spot a guard's own self-test cannot find (POPS-2110).
 *
 * The pure core (`collisionsFor`) is driven over the shapes it must flag and
 * the shapes it must NOT — in particular a file one side is already over
 * budget on alone, which belongs to `check-line-budget-headroom.mjs` and
 * would otherwise be reported twice across two jobs.
 *
 * `deltasFor` gets one end-to-end run against a throwaway git repo, because
 * the counted-line delta is the number the whole projection rests on and
 * `git show`/`git diff` behaviour is not something to assume.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  annotationsFor,
  cappedFilesFrom,
  collisionsFor,
  deltasFor,
  describeCollision,
  summaryMarkdown,
} from '../check-cross-pr-line-budget.mjs';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

/**
 * git's repository-location overrides, scrubbed — mirrors the sibling guard's
 * test. Without this, a run from inside `.husky/pre-push` (which exports
 * `GIT_DIR` for the repo being pushed) would point these throwaway fixtures
 * at that repo instead of their own temp directory.
 */
function gitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY']) {
    delete env[name];
  }
  return env;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: gitEnv() });
}

/** `n` counted (non-blank, non-comment) lines. */
function lines(n: number): string {
  return (
    Array.from({ length: n }, (_, i) => `const v${String(i)} = ${String(i)};`).join('\n') + '\n'
  );
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function throwawayRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cross-pr-budget-'));
  tempDirs.push(dir);
  git(dir, 'init', '--initial-branch=main', '--quiet');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  return dir;
}

describe('collisionsFor — the projection', () => {
  const baseCounts = new Map([['a.ts', 198]]);

  it('flags a pair that crosses the cap while neither side crosses it alone', () => {
    const found = collisionsFor({
      baseCounts,
      mine: [{ file: 'a.ts', delta: 2 }],
      others: [{ number: 7, title: 'other', deltas: [{ file: 'a.ts', delta: 1 }] }],
      max: 200,
    });

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: 'a.ts', otherPr: 7, projected: 201, max: 200 });
  });

  it('says nothing when the pair lands exactly on the cap', () => {
    expect(
      collisionsFor({
        baseCounts,
        mine: [{ file: 'a.ts', delta: 1 }],
        others: [{ number: 7, title: 'other', deltas: [{ file: 'a.ts', delta: 1 }] }],
        max: 200,
      })
    ).toEqual([]);
  });

  // The sibling guard owns "this branch alone is over". Reporting it here too
  // would make every such failure appear twice, in two jobs, with two
  // different remedies.
  it('leaves a file this branch already busts on its own to the sibling guard', () => {
    expect(
      collisionsFor({
        baseCounts,
        mine: [{ file: 'a.ts', delta: 5 }],
        others: [{ number: 7, title: 'other', deltas: [{ file: 'a.ts', delta: 1 }] }],
        max: 200,
      })
    ).toEqual([]);
  });

  it('leaves a file the OTHER branch already busts on its own alone too', () => {
    expect(
      collisionsFor({
        baseCounts,
        mine: [{ file: 'a.ts', delta: 1 }],
        others: [{ number: 7, title: 'other', deltas: [{ file: 'a.ts', delta: 9 }] }],
        max: 200,
      })
    ).toEqual([]);
  });

  it('ignores a file only one of the two branches touches', () => {
    expect(
      collisionsFor({
        baseCounts: new Map([
          ['a.ts', 198],
          ['b.ts', 199],
        ]),
        mine: [{ file: 'a.ts', delta: 2 }],
        others: [{ number: 7, title: 'other', deltas: [{ file: 'b.ts', delta: 2 }] }],
        max: 200,
      })
    ).toEqual([]);
  });

  it('ignores a file with no count on the base — it is new to both, not a collision', () => {
    expect(
      collisionsFor({
        baseCounts: new Map(),
        mine: [{ file: 'a.ts', delta: 150 }],
        others: [{ number: 7, title: 'other', deltas: [{ file: 'a.ts', delta: 150 }] }],
        max: 200,
      })
    ).toEqual([]);
  });

  // Deltas chosen so neither other PR busts the cap alone (197+2 and 197+3
  // are both under 200): a PR that is already over by itself is excluded by
  // the rule above, and picking such a delta here would test that rule twice
  // instead of the ordering.
  it('reports one row per colliding PR when several would each tip the same file', () => {
    const found = collisionsFor({
      baseCounts: new Map([['a.ts', 197]]),
      mine: [{ file: 'a.ts', delta: 2 }],
      others: [
        { number: 7, title: 'seven', deltas: [{ file: 'a.ts', delta: 2 }] },
        { number: 9, title: 'nine', deltas: [{ file: 'a.ts', delta: 3 }] },
      ],
      max: 200,
    });

    expect(found.map((c) => c.otherPr)).toEqual([9, 7]);
    expect(found.map((c) => c.projected)).toEqual([202, 201]);
  });
});

describe('what the guard SAYS (ADR-045)', () => {
  const collision = {
    file: 'pillars/finance/src/db/index.ts',
    otherPr: 4321,
    otherTitle: 'add the thing',
    baseCount: 198,
    myDelta: 2,
    theirDelta: 1,
    projected: 201,
    max: 200,
  };

  it('names both PRs, the file, and how far over the pair lands', () => {
    const text = describeCollision(collision);
    expect(text).toContain('pillars/finance/src/db/index.ts');
    expect(text).toContain('#4321');
    expect(text).toContain('add the thing');
    expect(text).toContain('198 on base');
    expect(text).toContain('1 over the 200-line cap');
  });

  it('emits a workflow WARNING annotation, not an error — the exit code stays zero', () => {
    const [annotation] = annotationsFor([collision]);
    expect(annotation).toMatch(/^::warning file=pillars\/finance\/src\/db\/index\.ts::/);
    expect(annotation).not.toContain('::error');
  });

  // A summary that says "no collision" without saying what it compared
  // against reads identically whether it looked at eleven PRs or none.
  it('says how many PRs it compared against even when nothing collided', () => {
    expect(summaryMarkdown([], 11)).toContain('11 other open PR');
    expect(summaryMarkdown([], 11)).toContain('No collision');
  });

  // A raw git path can carry a comma or colon (core.quotePath=false), and
  // `otherTitle` is free text from somebody else's PR. Unescaped, the first
  // splits one annotation into a broken pair and the second can inject a
  // whole second workflow command.
  it('escapes the path and the message, so a hostile PR title cannot forge a command', () => {
    const annotations = annotationsFor([
      {
        ...collision,
        file: 'pillars/x/a,b:c.ts',
        otherTitle: '100% done\n::error::forged',
      },
    ]);
    expect(annotations).toHaveLength(1);
    const annotation = annotations[0] ?? '';

    // The property is fully escaped: a raw comma would end `file=` early and
    // a raw colon would end the command. The human message after `::` keeps
    // its commas and colons — only `%`, CR and LF matter there, and it is the
    // newline that would have let the injected `::error::` start a line of
    // its own and become a second command.
    expect(annotation.startsWith('::warning file=pillars/x/a%2Cb%3Ac.ts::')).toBe(true);
    expect(annotation).toContain('100%25 done%0A::error::forged');
    expect(annotation.split('\n')).toHaveLength(1);
  });

  // "asked and found none" and "never asked" are different facts.
  it('says it fetched nothing, rather than "0 other open PRs", when it never queried', () => {
    const md = summaryMarkdown([], null);
    expect(md).toContain('no other PR was fetched');
    expect(md).not.toContain('0 other open PR');
  });

  it('renders a collision as a table row carrying both deltas', () => {
    const md = summaryMarkdown([collision], 3);
    expect(md).toContain(
      '| `pillars/finance/src/db/index.ts` | #4321 | 198 | +2 | +1 | **201** / 200 |'
    );
    expect(md).toContain('Neither PR crosses it alone');
  });
});

describe('cappedFilesFrom, against the real .oxlintrc.json', () => {
  it('reads the repo cap and covers a normal pillar source file', () => {
    const { max, isCapped } = cappedFilesFrom(REPO_ROOT);
    expect(max).toBeGreaterThan(0);
    expect(isCapped('pillars/finance/src/db/index.ts')).toBe(true);
  });

  it('excludes a path the config exempts, so the guard does not project a cap nothing enforces', () => {
    const { isCapped } = cappedFilesFrom(REPO_ROOT);
    expect(isCapped('pillars/finance/src/contract/api-types.generated.ts')).toBe(false);
  });
});

describe('deltasFor, end to end against a throwaway repo', () => {
  it('measures the branch net change against its own merge-base, not the base tip', () => {
    const dir = throwawayRepo();
    writeFileSync(join(dir, 'a.ts'), lines(10));
    git(dir, 'add', '.');
    git(dir, 'commit', '--quiet', '-m', 'base');

    git(dir, 'checkout', '--quiet', '-b', 'feature');
    writeFileSync(join(dir, 'a.ts'), lines(13));
    git(dir, 'commit', '--quiet', '-am', 'grow by three');

    // main moves on after the branch forked: the delta must NOT absorb this.
    git(dir, 'checkout', '--quiet', 'main');
    writeFileSync(join(dir, 'a.ts'), lines(40));
    git(dir, 'commit', '--quiet', '-am', 'main grows a lot');

    expect(deltasFor('feature', 'main', () => true, dir)).toEqual([{ file: 'a.ts', delta: 3 }]);
  });

  it('omits a file the branch touched without changing its counted line total', () => {
    const dir = throwawayRepo();
    writeFileSync(join(dir, 'a.ts'), lines(10));
    git(dir, 'add', '.');
    git(dir, 'commit', '--quiet', '-m', 'base');

    git(dir, 'checkout', '--quiet', '-b', 'feature');
    writeFileSync(join(dir, 'a.ts'), `${lines(10)}\n\n// a comment, and blank lines\n`);
    git(dir, 'commit', '--quiet', '-am', 'comments only');

    expect(deltasFor('feature', 'main', () => true, dir)).toEqual([]);
  });

  it('skips a path the cap does not cover', () => {
    const dir = throwawayRepo();
    writeFileSync(join(dir, 'a.ts'), lines(10));
    git(dir, 'add', '.');
    git(dir, 'commit', '--quiet', '-m', 'base');

    git(dir, 'checkout', '--quiet', '-b', 'feature');
    writeFileSync(join(dir, 'a.ts'), lines(13));
    git(dir, 'commit', '--quiet', '-am', 'grow');

    expect(deltasFor('feature', 'main', (p) => p !== 'a.ts', dir)).toEqual([]);
  });

  // "Could not look" must not render as "touched nothing" — the caller turns
  // undefined into a non-zero exit, and an empty array into a clean pass.
  it('returns undefined rather than an empty list when there is no merge base', () => {
    const dir = throwawayRepo();
    writeFileSync(join(dir, 'a.ts'), lines(10));
    git(dir, 'add', '.');
    git(dir, 'commit', '--quiet', '-m', 'base');

    expect(deltasFor('HEAD', 'no-such-ref', () => true, dir)).toBeUndefined();
  });
});
