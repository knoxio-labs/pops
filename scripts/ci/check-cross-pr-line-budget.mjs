#!/usr/bin/env node
/**
 * Cross-PR line-budget collision guard (POPS-3028).
 *
 * `check-line-budget-headroom.mjs` answers "does THIS branch cross the
 * `max-lines` cap once it lands on the target's tip". That is not the same
 * question as "can this branch and the one merging beside it cross it
 * together", and the difference is what ejected three merge groups on
 * 2026-09-05 (runs 33985405778, 33985300153, 33985299312) on
 * `pillars/finance/src/db/index.ts:269:39 File has too many lines (201)`.
 * Two branches each added a few lines to a file sitting near 200. Neither
 * crossed it alone. Both together did, and the first thing to say so was
 * oxlint, inside the merge group, seconds before the ejection.
 *
 * WHY THE OTHER GUARD CANNOT ANSWER THIS. The merge queue's projected head is
 * reachable from exactly one of the three lanes that guard runs in, and it is
 * the lane where knowing is already too late:
 *
 *   - `merge_group` — the checkout IS the projected head, so the existing
 *     projection is exact, and it is also where the ejection happens.
 *   - `pull_request` — the group does not exist yet. Which PRs share a merge
 *     group is decided at enqueue time, after these checks run, and the other
 *     PR may not even be open. No ref reachable from the checkout describes
 *     it.
 *   - `.husky/pre-push` — offline, and the branch has not been pushed.
 *
 * WHAT THIS APPROXIMATES INSTEAD. At `pull_request` time the reachable
 * approximation is not the queue's head but the heads of the other open PRs
 * targeting the same base. For each capped file that this branch and another
 * open PR both touch:
 *
 *   projected = countAt(base tip) + myDelta + theirDelta
 *
 * where each delta is that branch's own net change measured against its own
 * merge-base — the same arithmetic the sibling guard already does for one
 * branch, applied to two. It answers "if PR #N lands before me, does this
 * file cross the cap", which is the collision, one enqueue-ordering earlier.
 *
 * WHY THIS IS A SEPARATE SCRIPT RATHER THAN AN EDIT TO THAT ONE.
 * `check-line-budget-headroom.mjs` is Tier A (ADR-045 amendment): install-free,
 * node builtins and `git` only, and it runs from `.husky/pre-push` where there
 * is no network and no token. Cross-PR projection needs both. Bolting a
 * network dependency onto a guard that must keep working offline would break
 * the lane it is most useful in.
 *
 * WHY A COLLISION WARNS AND DOES NOT FAIL. Two open PRs that both touch a
 * near-cap file will frequently never share a merge group — they may merge
 * days apart, and the second will then be measured against a base that
 * already contains the first, which is precisely the case the sibling guard
 * already covers correctly. Failing the build on a maybe would make this the
 * noisiest check in the repo and teach everyone to ignore it. So a collision
 * is a `::warning` annotation and a step-summary row, and the exit code stays
 * zero.
 *
 * The exit code is NOT zero when the guard cannot answer — an unresolvable
 * base, a `gh` call that failed, a ref it could not fetch, an `.oxlintrc.json`
 * shape it does not model. That distinction is the whole point: "no collision"
 * and "could not look" must never render the same, which is the POPS-2110
 * shape (a guard that passes because it never looked). A caller reading this
 * as advisory should leave the job non-required, not make the script quieter.
 *
 * COUNTING SEMANTICS are `countBudgetLines`'s, imported rather than
 * reimplemented, so the two guards can never disagree about what a line is.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  countBudgetLines,
  globToRegExp,
  matchesAnyGlob,
  parseMaxLinesConfig,
} from './check-line-budget-headroom.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

const LINTED_EXT = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

/**
 * @typedef {object} BranchDelta
 * @property {string} file Repo-relative path.
 * @property {number} delta Net counted-line change this branch makes to it.
 */

/**
 * @typedef {object} Collision
 * @property {string} file
 * @property {number} otherPr
 * @property {string} otherTitle
 * @property {number} baseCount Counted lines on the base tip.
 * @property {number} myDelta
 * @property {number} theirDelta
 * @property {number} projected `baseCount + myDelta + theirDelta`.
 * @property {number} max
 */

/**
 * The collisions between one branch and a set of other open PRs.
 *
 * Pure: every count and delta is supplied, so the whole verdict is testable
 * without a git repository or a network. `baseCounts` is keyed by file.
 *
 * A file is reported only when the pair crosses the cap **and** neither side
 * crosses it alone — a branch that is over budget by itself is the sibling
 * guard's finding, and reporting it here too would double every such failure
 * across two jobs.
 *
 * @param {object} params
 * @param {Map<string, number>} params.baseCounts Counted lines per file on the base tip.
 * @param {BranchDelta[]} params.mine
 * @param {{ number: number, title: string, deltas: BranchDelta[] }[]} params.others
 * @param {number} params.max
 * @returns {Collision[]}
 */
export function collisionsFor({ baseCounts, mine, others, max }) {
  const myDeltas = new Map(mine.map((d) => [d.file, d.delta]));
  /** @type {Collision[]} */
  const found = [];

  for (const other of others) {
    for (const { file, delta: theirDelta } of other.deltas) {
      const myDelta = myDeltas.get(file);
      if (myDelta === undefined) continue;

      const baseCount = baseCounts.get(file);
      if (baseCount === undefined) continue;

      const projected = baseCount + myDelta + theirDelta;
      if (projected <= max) continue;
      // Already over on its own: the sibling guard owns that finding.
      if (baseCount + myDelta > max || baseCount + theirDelta > max) continue;

      found.push({
        file,
        otherPr: other.number,
        otherTitle: other.title,
        baseCount,
        myDelta,
        theirDelta,
        projected,
        max,
      });
    }
  }

  return found.sort((a, b) => b.projected - a.projected || a.file.localeCompare(b.file));
}

/**
 * One line per collision, in the shape a reader can act on: which two PRs,
 * which file, and how far over the pair lands.
 *
 * @param {Collision} c
 * @returns {string}
 */
export function describeCollision(c) {
  const over = c.projected - c.max;
  return (
    `${c.file}: ${c.baseCount} on base +${c.myDelta} here +${c.theirDelta} from #${c.otherPr} ` +
    `= ${c.projected}, ${over} over the ${c.max}-line cap ("${c.otherTitle}")`
  );
}

/**
 * GitHub workflow-command annotations for the collisions, one per line.
 *
 * `warning` rather than `error` deliberately — see the file header. An
 * annotation carries no exit code of its own, so this is the only place the
 * verdict is visible on a run that exits zero.
 *
 * @param {Collision[]} collisions
 * @returns {string[]}
 */
export function annotationsFor(collisions) {
  return collisions.map((c) => `::warning file=${c.file}::${describeCollision(c)}`);
}

/**
 * The step-summary table, or the sentence that says nothing collided.
 *
 * @param {Collision[]} collisions
 * @param {number} otherPrCount How many open PRs were compared against.
 * @returns {string}
 */
export function summaryMarkdown(collisions, otherPrCount) {
  const scope = `Compared against ${otherPrCount} other open PR(s) on the same base.`;
  if (collisions.length === 0) {
    return `### Cross-PR line budget\n\nNo collision. ${scope}\n`;
  }
  const rows = collisions
    .map(
      (c) =>
        `| \`${c.file}\` | #${c.otherPr} | ${c.baseCount} | +${c.myDelta} | +${c.theirDelta} | **${c.projected}** / ${c.max} |`
    )
    .join('\n');
  return (
    `### Cross-PR line budget\n\n` +
    `${collisions.length} file(s) would cross the cap if the paired PR lands first. ` +
    `Neither PR crosses it alone, so neither will be told by any other check. ${scope}\n\n` +
    `| file | with | on base | this PR | other PR | projected |\n` +
    `| --- | --- | --- | --- | --- | --- |\n${rows}\n`
  );
}

/** A git invocation that returns `undefined` rather than throwing. */
function tryGit(/** @type {string[]} */ args, /** @type {string} */ cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return undefined;
  }
}

/**
 * The counted-line delta a ref makes to each capped file it touches, measured
 * against its own merge-base with `baseRef`.
 *
 * Returns `undefined` when git could not answer, which the caller must treat
 * as "could not look" rather than "touched nothing".
 *
 * @param {string} ref
 * @param {string} baseRef
 * @param {(path: string) => boolean} isCapped
 * @param {string} cwd
 * @returns {BranchDelta[] | undefined}
 */
export function deltasFor(ref, baseRef, isCapped, cwd) {
  const mergeBase = tryGit(['merge-base', baseRef, ref], cwd)?.trim();
  if (!mergeBase) return undefined;

  const changed = tryGit(
    [
      '-c',
      'core.quotePath=false',
      'diff',
      '-z',
      '--name-only',
      '--diff-filter=ACMR',
      mergeBase,
      ref,
    ],
    cwd
  );
  if (changed === undefined) return undefined;

  const files = changed
    .split('\0')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && LINTED_EXT.test(l) && isCapped(l));

  /** @type {BranchDelta[]} */
  const deltas = [];
  for (const file of files) {
    const head = tryGit(['show', `${ref}:${file}`], cwd);
    if (head === undefined) continue; // deleted on this branch — nothing to budget.
    const before = tryGit(['show', `${mergeBase}:${file}`], cwd);
    const delta = countBudgetLines(head) - (before === undefined ? 0 : countBudgetLines(before));
    if (delta !== 0) deltas.push({ file, delta });
  }
  return deltas;
}

/**
 * The open PRs targeting `base`, excluding `self`.
 *
 * Isolated behind its own function so everything above it stays unit-testable
 * without a token: the network round trip is the part worth trusting to an
 * integration environment, not the arithmetic.
 *
 * @param {string} repo
 * @param {string} base
 * @param {number} self
 * @returns {{ number: number, title: string }[]}
 */
export function fetchOpenPrs(repo, base, self) {
  const raw = execFileSync(
    'gh',
    [
      'api',
      '--paginate',
      '--slurp',
      `repos/${repo}/pulls?state=open&base=${encodeURIComponent(base)}&per_page=100`,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  /** @type {{ number: number, title: string, draft?: boolean }[][]} */
  const pages = JSON.parse(raw);
  return pages
    .flat()
    .filter((pr) => pr.number !== self)
    .map((pr) => ({ number: pr.number, title: pr.title }));
}

/**
 * The `max-lines` cap and a predicate for which paths it covers, read from
 * the real `.oxlintrc.json`.
 *
 * Throws rather than defaulting when the config carries a shape the sibling
 * guard does not model — projecting a phantom cap is a guess, and neither
 * guard guesses.
 *
 * @param {string} cwd
 * @returns {{ max: number, isCapped: (path: string) => boolean }}
 */
export function cappedFilesFrom(cwd) {
  const configPath = join(cwd, '.oxlintrc.json');
  const { max, exemptGlobs, ignoreGlobs, unmodelled } = parseMaxLinesConfig(
    JSON.parse(readFileSync(configPath, 'utf8'))
  );
  if (unmodelled.length > 0) {
    throw new Error(
      `.oxlintrc.json has max-lines shapes this guard does not model: ${unmodelled.join('; ')}`
    );
  }
  const skipGlobs = [...exemptGlobs, ...ignoreGlobs];
  for (const glob of skipGlobs) globToRegExp(glob);
  return { max, isCapped: (path) => !matchesAnyGlob(path, skipGlobs) };
}

/**
 * @param {object} params
 * @param {string} params.repo
 * @param {number} params.pr
 * @param {string} params.base Base branch name, e.g. `main`.
 * @param {string} params.cwd
 * @returns {{ collisions: Collision[], otherPrCount: number } | { error: string }}
 */
export function evaluate({ repo, pr, base, cwd }) {
  /** @type {{ max: number, isCapped: (path: string) => boolean }} */
  let capped;
  try {
    capped = cappedFilesFrom(cwd);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  const baseRef = `origin/${base}`;
  if (tryGit(['rev-parse', '--verify', `${baseRef}^{commit}`], cwd) === undefined) {
    return { error: `cannot resolve ${baseRef} — fetch it (actions/checkout \`fetch-depth: 0\`)` };
  }

  const mine = deltasFor('HEAD', baseRef, capped.isCapped, cwd);
  if (mine === undefined) {
    return { error: `git could not describe HEAD against ${baseRef}` };
  }
  if (mine.length === 0) return { collisions: [], otherPrCount: 0 };

  /** @type {{ number: number, title: string }[]} */
  let openPrs;
  try {
    openPrs = fetchOpenPrs(repo, base, pr);
  } catch (error) {
    return {
      error: `could not list open PRs (${error instanceof Error ? error.message.split('\n')[0] : String(error)})`,
    };
  }

  /** @type {{ number: number, title: string, deltas: BranchDelta[] }[]} */
  const others = [];
  /** @type {string[]} */
  const unfetchable = [];
  for (const other of openPrs) {
    const ref = `refs/pull/${other.number}/head`;
    if (
      tryGit(['fetch', '--no-tags', '--depth=200', 'origin', `+${ref}:${ref}`], cwd) === undefined
    ) {
      unfetchable.push(`#${other.number}`);
      continue;
    }
    const deltas = deltasFor(ref, baseRef, capped.isCapped, cwd);
    if (deltas === undefined) {
      unfetchable.push(`#${other.number}`);
      continue;
    }
    others.push({ number: other.number, title: other.title, deltas });
  }
  if (unfetchable.length > 0) {
    return { error: `could not read ${unfetchable.length} PR head(s): ${unfetchable.join(', ')}` };
  }

  /** @type {Map<string, number>} */
  const baseCounts = new Map();
  const wanted = new Set([
    ...mine.map((d) => d.file),
    ...others.flatMap((o) => o.deltas.map((d) => d.file)),
  ]);
  for (const file of wanted) {
    const text = tryGit(['show', `${baseRef}:${file}`], cwd);
    if (text !== undefined) baseCounts.set(file, countBudgetLines(text));
  }

  return {
    collisions: collisionsFor({ baseCounts, mine, others, max: capped.max }),
    otherPrCount: others.length,
  };
}

function usage() {
  return (
    'usage: check-cross-pr-line-budget.mjs --repo <owner/name> --pr <number> --base <branch>\n' +
    '  Needs `gh` authenticated and a full-history checkout.\n'
  );
}

function main() {
  const args = process.argv.slice(2);
  const valueOf = (/** @type {string} */ name) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };

  const repo = valueOf('--repo');
  const prRaw = valueOf('--pr');
  const base = valueOf('--base');
  if (repo === undefined || prRaw === undefined || base === undefined) {
    process.stderr.write(usage());
    process.exit(2);
  }
  const pr = Number(prRaw);
  if (!Number.isInteger(pr)) {
    process.stderr.write(`--pr must be an integer, got "${prRaw}"\n`);
    process.exit(2);
  }

  const result = evaluate({ repo, pr, base, cwd: repoRoot });
  if ('error' in result) {
    process.stderr.write(`cross-PR line budget: ${result.error}\n`);
    process.exit(1);
  }

  for (const line of annotationsFor(result.collisions)) process.stdout.write(`${line}\n`);
  process.stdout.write(
    result.collisions.length === 0
      ? `cross-PR line budget: no collision against ${result.otherPrCount} other open PR(s)\n`
      : `cross-PR line budget: ${result.collisions.length} collision(s)\n` +
          `${result.collisions.map((c) => `  ${describeCollision(c)}`).join('\n')}\n`
  );

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath !== undefined && summaryPath !== '') {
    try {
      execFileSync('tee', ['-a', summaryPath], {
        input: summaryMarkdown(result.collisions, result.otherPrCount),
        stdio: ['pipe', 'ignore', 'inherit'],
      });
    } catch (error) {
      process.stderr.write(
        `cross-PR line budget: could not write $GITHUB_STEP_SUMMARY (${error instanceof Error ? error.message.split('\n')[0] : String(error)})\n`
      );
      process.exit(1);
    }
  }
}

if (import.meta.main) {
  main();
}
