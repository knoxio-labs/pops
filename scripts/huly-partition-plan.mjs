#!/usr/bin/env node
/**
 * Command line over the backlog partitioning recipe: emit the queries that
 * read a whole tracker backlog past the 200-row cap, and audit a finished
 * export against them.
 *
 * The recipe itself, and the reason its last axis cannot be proven, live in
 * `huly-partition.mjs`. What an export must declare about how it was gathered,
 * and what that declaration does and does not establish, live in
 * `huly-coverage.mjs`. Read those before trusting a `complete` verdict.
 *
 * Usage:
 *   node scripts/huly-partition-plan.mjs --roots --statuses Backlog,Done
 *   node scripts/huly-partition-plan.mjs --refine '{"status":"Merged"}' --components ios,bfm
 *   node scripts/huly-partition-plan.mjs --narrow '{"status":"Merged"}' --patterns 'd%,f[^e]%'
 *   node scripts/huly-partition-plan.mjs --assess <export.json>
 *   node scripts/huly-partition-plan.mjs --self-test
 *
 * Exit 0 = ran, and for `--assess`, coverage is complete.
 * Exit 1 = the tool ran and the answer is no: `--self-test` failed, `--assess`
 *          found the export incomplete, `--refine` has no enumerable filter
 *          left for that cell and the caller must write `titleRegex` patterns,
 *          or `--narrow` has nothing to check because every pattern given
 *          starts with a wildcard or bracket class.
 * Exit 2 = usage error, or an export this tool could not read. Deliberately not
 *          1: "your file is malformed" and "your backlog is short" are
 *          different events, and a caller switching on the code must not
 *          conflate them.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readFlag } from './cli-flags.mjs';
import { assessCoverage, formatCoverage, readCoverage, readRows } from './huly-coverage.mjs';
import {
  describeCell,
  isTruncated,
  narrowingQueries,
  partitionRoots,
  refineCell,
} from './huly-partition.mjs';

/**
 * @typedef {import('./huly-partition.mjs').Cell} Cell
 * @typedef {import('./huly-partition.mjs').Coverage} Coverage
 */

export const HELP = `Usage: node scripts/huly-partition-plan.mjs --roots --statuses <a,b,c>
       node scripts/huly-partition-plan.mjs --refine '<cell json>' [--components <a,b>]
       node scripts/huly-partition-plan.mjs --narrow '<branch json>' --patterns <a,b,c>
       node scripts/huly-partition-plan.mjs --assess <export.json>
       node scripts/huly-partition-plan.mjs --self-test

--roots   prints the query per workflow status to start from.
--refine  prints the queries that replace one truncated cell.
--narrow  prints the titleSearch cross-check queries for a branch that had to
          be divided by titleRegex — run them, then add the results to the
          export's "coverage.titleNarrowing" before --assess.
--assess  reads an export's "coverage" block and says whether it covers the
          whole backlog. Exits 1 when it does not.

A cell whose row count reaches the limit is truncated: discard it, refine it,
and query the children. Never keep a capped result.

status, the three booleans and component are enumerable, so --assess proves
those tile. Past them only titleRegex is left, it is hand-written, and no
finite set bounds it — a branch divided that way is reported as an assumption
this tool did not check. --narrow is the fallback: titleSearch is a different
read path over the same branch, so an identifier it finds that the titleRegex
leaves never returned is a proven gap, not another assumption. It narrows the
risk; it does not close it, and --assess never reports a narrowed branch as
verified.`;

/**
 * @param {string | undefined} value
 * @returns {string[]}
 */
function readList(value) {
  if (value === undefined) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

/**
 * @param {string[]} args
 * @returns {number}
 */
function runRoots(args) {
  const statuses = readList(readFlag(args, '--statuses'));
  if (statuses.length === 0) {
    console.error('FAIL — --roots needs --statuses <a,b,c>, taken from list_statuses.');
    return 2;
  }
  console.log(JSON.stringify(partitionRoots(statuses), null, 2));
  return 0;
}

/**
 * @param {string[]} args
 * @returns {number}
 */
function runRefine(args) {
  const raw = readFlag(args, '--refine');
  if (raw === undefined) {
    console.error('FAIL — --refine needs a cell, e.g. --refine \'{"status":"Merged"}\'.');
    return 2;
  }
  /** @type {Cell} */
  let cell;
  try {
    cell = readCell(raw);
  } catch (error) {
    console.error(`FAIL — --refine could not read that as a cell: ${messageOf(error)}`);
    return 2;
  }
  const children = refineCell(cell, readList(readFlag(args, '--components')));
  if (children === undefined) {
    console.error(
      'FAIL — every enumerable filter is spent on this cell. What is left is `titleRegex` ' +
        '(SQL SIMILAR TO: whole-title, case-sensitive, bracket classes and alternation), ' +
        'bisected on leading characters until each piece lands under the cap. Those patterns ' +
        'are yours to write and yours to argue tile the branch — --assess records them as an ' +
        'assumption and will not vouch for them.'
    );
    return 1;
  }
  console.log(JSON.stringify(children, null, 2));
  return 0;
}

/**
 * @param {string[]} args
 * @returns {number}
 */
function runNarrow(args) {
  const raw = readFlag(args, '--narrow');
  if (raw === undefined) {
    console.error('FAIL — --narrow needs a branch cell, e.g. --narrow \'{"status":"Merged"}\'.');
    return 2;
  }
  /** @type {Cell} */
  let branch;
  try {
    branch = readCell(raw);
  } catch (error) {
    console.error(`FAIL — --narrow could not read that as a cell: ${messageOf(error)}`);
    return 2;
  }
  const patterns = readList(readFlag(args, '--patterns'));
  if (patterns.length === 0) {
    console.error(
      'FAIL — --narrow needs --patterns <a,b,c>, the titleRegex set that divides this branch.'
    );
    return 2;
  }
  const queries = narrowingQueries(branch, patterns);
  if (queries.length === 0) {
    console.error(
      'FAIL — every pattern given has no literal leading substring (e.g. `[a-m]%`), so ' +
        'titleSearch has nothing narrower than the whole branch to check. Rewrite the split to ' +
        'bisect on a leading character, or accept this branch as unnarrowable.'
    );
    return 1;
  }
  console.log(JSON.stringify(queries, null, 2));
  return 0;
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A `--refine` argument read as a cell.
 *
 * Valid JSON is not enough: `null` and `"x"` both parse, and `refineCell` would
 * meet the first as a TypeError and the second as a string spread into a
 * nonsense filter. Both are the caller mistyping an argument, which is a usage
 * error with a message, not a stack trace.
 *
 * @param {string} raw
 * @returns {Cell}
 * @throws {Error} when the argument is not a JSON object.
 */
export function readCell(raw) {
  const parsed = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('a cell must be a JSON object, e.g. {"status":"Merged"}');
  }
  return parsed;
}

/**
 * @param {string[]} args
 * @returns {number}
 */
function runAssess(args) {
  const path = readFlag(args, '--assess');
  if (path === undefined) {
    console.error('FAIL — --assess needs a path to an export.');
    return 2;
  }
  /** @type {{ identifier: string }[]} */
  let rows;
  /** @type {Coverage | undefined} */
  let coverage;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    rows = readRows(parsed);
    coverage = readCoverage(parsed);
  } catch (error) {
    console.error(`FAIL — could not read ${path}: ${messageOf(error)}`);
    return 2;
  }
  const verdict = assessCoverage(coverage, rows);
  console.log(formatCoverage(verdict).join('\n'));
  return verdict.complete ? 0 : 1;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(HELP);
    process.exit(2);
  }
  if (args.includes('--self-test')) process.exit(selfTest() ? 0 : 1);
  if (args.includes('--roots')) process.exit(runRoots(args));
  if (args.includes('--refine')) process.exit(runRefine(args));
  if (args.includes('--narrow')) process.exit(runNarrow(args));
  if (args.includes('--assess')) process.exit(runAssess(args));
  console.error('FAIL — no mode given. See --help.');
  process.exit(2);
}

/**
 * The handful of shapes that decide whether a caller can tell a complete
 * enumeration from a truncated one. Each is a way the check could fail open.
 *
 * @returns {boolean}
 */
function selfTest() {
  const issue = (/** @type {string} */ identifier) => ({ identifier });
  const cell = (/** @type {Cell} */ filter, /** @type {number} */ count) => ({ filter, count });
  const complete = assessCoverage(
    { limit: 200, statuses: ['Backlog'], cells: [cell({ status: 'Backlog' }, 2)] },
    [issue('POPS-1'), issue('POPS-2')]
  );
  const capped = assessCoverage(
    { limit: 2, statuses: ['Backlog'], cells: [cell({ status: 'Backlog' }, 2)] },
    [issue('POPS-1'), issue('POPS-2')]
  );
  const missingStatus = assessCoverage(
    { limit: 200, statuses: ['Backlog', 'Done'], cells: [cell({ status: 'Backlog' }, 1)] },
    [issue('POPS-1')]
  );
  const titleSplit = assessCoverage(
    {
      limit: 200,
      statuses: ['Merged'],
      cells: [
        cell({ status: 'Merged', titleRegex: '[a-m]%' }, 1),
        cell({ status: 'Merged', titleRegex: '[^a-m]%' }, 1),
      ],
    },
    [issue('POPS-1'), issue('POPS-2')]
  );
  const missedTitleSplit = {
    limit: 200,
    statuses: ['Merged'],
    cells: [
      cell({ status: 'Merged', titleRegex: 'c[^h]%' }, 1),
      cell({ status: 'Merged', titleRegex: 'ch%' }, 1),
    ],
    titleNarrowing: [
      {
        query: { status: 'Merged', titleSearch: 'c' },
        identifiers: ['POPS-1', 'POPS-3'],
      },
    ],
  };
  const narrowedClean = assessCoverage(
    {
      ...missedTitleSplit,
      titleNarrowing: [{ query: { status: 'Merged', titleSearch: 'c' }, identifiers: ['POPS-1'] }],
    },
    [issue('POPS-1'), issue('POPS-2')]
  );
  const narrowedGap = assessCoverage(missedTitleSplit, [issue('POPS-1'), issue('POPS-2')]);

  const checks = {
    'a full-page result is truncated': isTruncated(200, 200),
    'an over-full result is truncated too': isTruncated(201, 200),
    'a short result is not': !isTruncated(199, 200),
    'a tiling export is complete': complete.complete,
    'a cell on the cap is not': !capped.complete,
    'a status nothing queried is named once, not exploded':
      missingStatus.uncovered.length === 1 &&
      describeCell(/** @type {Cell} */ (missingStatus.uncovered[0])) === 'status=Done',
    'an undeclared export is never complete': !assessCoverage(undefined, []).complete,
    'the boolean split is complementary': describeCell(
      /** @type {Cell} */ ((refineCell({ status: 'X' }) ?? [])[0])
    ).endsWith('hasComponent=true'),
    'a fully-divided cell reports that it cannot be divided':
      refineCell({ status: 'X', hasComponent: true, hasAssignee: true, hasDueDate: true }, []) ===
      undefined,
    'a cell already naming a component is never fanned out again':
      refineCell(
        { status: 'X', component: 'ios', hasComponent: true, hasAssignee: true, hasDueDate: true },
        ['ios', 'bfm']
      ) === undefined,
    'a title-partitioned branch is recorded as an assumption, not as proof':
      titleSplit.complete && titleSplit.assumptions.length === 1,
    'and the report says so out loud rather than reading clean': formatCoverage(titleSplit)
      .join('\n')
      .includes('ASSUMED, not verified'),
    'an un-cross-checked assumption says so':
      titleSplit.assumptions[0]?.includes('not cross-checked'),
    // The exact pair the ticket names: `c[^h]%` stops at its bracket class and
    // contributes `titleSearch: 'c'` — on its own enough to surface a title
    // that is exactly "c", since "c" contains "c". `ch%` runs on to its `%`
    // and contributes the more specific `'ch'`; the two patterns diverge
    // before either special character, so nothing here dedupes them.
    "narrowingQueries reproduces the ticket's own example as two queries":
      narrowingQueries({ status: 'Merged' }, ['c[^h]%', 'ch%'])
        .map((query) => query.titleSearch)
        .join(',') === 'c,ch',
    'narrowingQueries dedupes two patterns that share the same literal prefix':
      narrowingQueries({ status: 'Merged' }, ['c[^h]%', 'c[jk]%']).length === 1,
    'a bracket-led pattern with no literal prefix contributes no cross-check':
      narrowingQueries({ status: 'Merged' }, ['[a-m]%']).length === 0,
    'a narrowing cross-check that finds nothing missed says narrowed, never verified':
      narrowedClean.complete &&
      (narrowedClean.assumptions[0]?.includes('narrowed') ?? false) &&
      !(narrowedClean.assumptions[0]?.includes('verified') ?? true),
    'a narrowing cross-check that finds a missed identifier fails the export, not just the assumption':
      !narrowedGap.complete && narrowedGap.problems.some((problem) => problem.includes('POPS-3')),
  };

  const failed = Object.entries(checks).filter(([, ok]) => !ok);
  if (failed.length > 0) {
    console.error(`self-test FAILED: ${failed.map(([name]) => name).join('; ')}`);
    return false;
  }
  console.log(`self-test OK — ${Object.keys(checks).length} assertions passed.`);
  return true;
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}
