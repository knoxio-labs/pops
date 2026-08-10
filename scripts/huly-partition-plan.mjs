#!/usr/bin/env node
/**
 * The recipe for reading a whole tracker backlog through an API that will not
 * hand one over, and the check that proves a given read was complete.
 *
 * `mcp__huly-knoxiolabs__list_issues` accepts `limit` with a hard maximum of
 * 200 and offers no offset, cursor or total count. Results come back sorted by
 * modification date, newest first. So a filter matching 400 issues returns the
 * newest 200 and says nothing about the other 200 — the caller sees a full
 * page and cannot distinguish it from a complete answer. That is the shape
 * this file exists to defeat: a sweep written the obvious way reports "no
 * orphans" over a partial view and reads as a clean bill of health.
 *
 * ## The recipe
 *
 * Split the query space until every leaf comes back under the cap, then read
 * the leaves and union them.
 *
 *   1. **Root cells: one per workflow status.** Take the status list from
 *      `list_statuses`, which returns a `total` and is not paginated — if
 *      `total` equals the row count, that list is complete. Every issue has
 *      exactly one status, so `{status: S}` for each S is a partition.
 *   2. **A cell whose row count reaches the limit is truncated.** Discard it
 *      and query its children instead. Never keep a capped result.
 *   3. **Children come from the total boolean filters, in a fixed order:**
 *      `hasComponent`, then `hasAssignee`, then `hasDueDate`. Each is asked
 *      both ways; `true` and `false` are complementary and exhaustive, so a
 *      split adds no overlap and loses no rows.
 *   4. **A cell that has spent all three booleans and still caps** is split by
 *      `component`, replacing `hasComponent: true` with one cell per label
 *      from `list_components`. That list is itself subject to a 200 cap, so it
 *      only partitions the space when it comes back under it.
 *
 * ## What is proven, and what is assumed
 *
 * `assessCoverage` proves the structural half: that the declared cells tile
 * the whole status list with no gap and no duplicate, that no cell reached the
 * cap, and that the row count adds up. `findUncovered` refines each root the
 * same way a caller would and reports any branch nothing accounted for, so a
 * missing cell is named rather than silently absorbed.
 *
 * Three things it cannot prove and takes on trust, each verifiable at the API
 * rather than in code:
 *
 *   - **The boolean filters are total.** `hasAssignee: true` plus
 *     `hasAssignee: false` is asserted to equal the unfiltered set. Check it
 *     by splitting a cell that is comfortably under the cap and confirming the
 *     two counts sum to the parent's.
 *   - **The status list is complete.** Taken from `list_statuses`; its `total`
 *     is the check.
 *   - **The component list is complete.** Same argument, against the 200 cap
 *     on `list_components`.
 *
 * `isTopLevel` is deliberately unused. It is not a partition: `true` returns
 * top-level issues, but `false` returns everything rather than the sub-issues,
 * so the pair does not complement.
 *
 * Usage:
 *   node scripts/huly-partition-plan.mjs --roots --statuses Backlog,Done
 *   node scripts/huly-partition-plan.mjs --refine '{"status":"Merged"}' --components ios,bfm
 *   node scripts/huly-partition-plan.mjs --assess <export.json>
 *   node scripts/huly-partition-plan.mjs --self-test
 *
 * Exit 0 = ran, and for `--assess`, coverage is complete. Exit 1 = self-test
 * failed, or the assessed export is incomplete. Exit 2 = usage error.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The hard cap `list_issues` enforces on `limit`. */
export const DEFAULT_LIMIT = 200;

/**
 * @typedef {{
 *   status?: string,
 *   component?: string,
 *   hasComponent?: boolean,
 *   hasAssignee?: boolean,
 *   hasDueDate?: boolean,
 * }} Cell A `list_issues` filter combination.
 * @typedef {{ filter: Cell, count: number }} CoverageCell One executed query and how many rows it returned.
 * @typedef {{
 *   limit?: number,
 *   statuses?: string[],
 *   components?: string[],
 *   cells?: CoverageCell[],
 * }} Coverage The provenance block an enumerated export carries.
 */

/**
 * Whether a result of `rowCount` rows under `limit` has to be assumed
 * incomplete.
 *
 * The comparison is `>=`, not `===`. Equality is the case that actually
 * happens, but a server that clamped or ignored the limit and returned more is
 * not thereby trustworthy — reading only equality would call that result
 * complete, which is the one answer it cannot be.
 *
 * @param {number} rowCount
 * @param {number} [limit]
 * @returns {boolean}
 */
export function isTruncated(rowCount, limit = DEFAULT_LIMIT) {
  return rowCount >= limit;
}

/**
 * A cell rendered in a fixed key order, so it doubles as an identity key: two
 * filters are the same cell exactly when their descriptions match.
 *
 * @param {Cell} cell
 * @returns {string}
 */
export function describeCell(cell) {
  /** @type {string[]} */
  const parts = [];
  if (cell.status !== undefined) parts.push(`status=${cell.status}`);
  if (cell.component !== undefined) parts.push(`component=${cell.component}`);
  if (cell.hasComponent !== undefined) parts.push(`hasComponent=${cell.hasComponent}`);
  if (cell.hasAssignee !== undefined) parts.push(`hasAssignee=${cell.hasAssignee}`);
  if (cell.hasDueDate !== undefined) parts.push(`hasDueDate=${cell.hasDueDate}`);
  return parts.length === 0 ? '(unfiltered)' : parts.join(' ');
}

/**
 * One root cell per workflow status — the top of the refinement tree.
 *
 * @param {string[]} statuses
 * @returns {Cell[]}
 */
export function partitionRoots(statuses) {
  return statuses.map((status) => ({ status }));
}

/**
 * @param {Cell} cell
 * @param {string[]} components
 * @returns {Cell[]}
 */
function componentCells(cell, components) {
  return components.map((component) => ({
    status: cell.status,
    hasAssignee: cell.hasAssignee,
    hasDueDate: cell.hasDueDate,
    component,
  }));
}

/**
 * The cells that replace a truncated one, or `undefined` when the filter set
 * has nothing left to divide by.
 *
 * `undefined` is the honest answer, not a failure to try: it means this API
 * cannot enumerate that cell, and a caller that receives it must say so rather
 * than report the capped rows as the whole of it.
 *
 * @param {Cell} cell
 * @param {string[]} [components] Every component label, needed only for the last split.
 * @returns {Cell[] | undefined}
 */
export function refineCell(cell, components = []) {
  if (cell.hasComponent === undefined && cell.component === undefined) {
    return [
      { ...cell, hasComponent: true },
      { ...cell, hasComponent: false },
    ];
  }
  if (cell.hasAssignee === undefined) {
    return [
      { ...cell, hasAssignee: true },
      { ...cell, hasAssignee: false },
    ];
  }
  if (cell.hasDueDate === undefined) {
    return [
      { ...cell, hasDueDate: true },
      { ...cell, hasDueDate: false },
    ];
  }
  if (cell.hasComponent === true && components.length > 0) {
    return componentCells(cell, components);
  }
  return undefined;
}

/**
 * @param {Cell[]} children
 * @param {Cell[][]} gaps
 * @returns {boolean}
 */
function isWhollyUncovered(children, gaps) {
  if (gaps.length !== children.length) return false;
  for (const [index, gap] of gaps.entries()) {
    const only = gap.length === 1 ? gap[0] : undefined;
    const child = children[index];
    if (only === undefined || child === undefined) return false;
    if (describeCell(only) !== describeCell(child)) return false;
  }
  return true;
}

/**
 * The branches of `target` that `present` does not account for.
 *
 * A branch nothing touched is reported at its own level rather than exploded
 * into leaves: a status absent from the export should read as one missing
 * status, not as eighty-four missing filter combinations.
 *
 * @param {Cell} target
 * @param {Set<string>} present Cell descriptions the export declares.
 * @param {string[]} components
 * @returns {Cell[]}
 */
export function findUncovered(target, present, components) {
  if (present.has(describeCell(target))) return [];
  const children = refineCell(target, components);
  if (children === undefined) return [target];
  const gaps = children.map((child) => findUncovered(child, present, components));
  return isWhollyUncovered(children, gaps) ? [target] : gaps.flat();
}

/**
 * @typedef {{
 *   declared: boolean,
 *   complete: boolean,
 *   limit: number,
 *   cellCount: number,
 *   declaredTotal: number,
 *   rowCount: number,
 *   truncated: CoverageCell[],
 *   uncovered: Cell[],
 *   duplicateCells: string[],
 *   duplicateIdentifiers: string[],
 *   problems: string[],
 * }} CoverageVerdict
 */

/**
 * @param {CoverageCell[]} cells
 * @returns {string[]}
 */
function duplicateCellKeys(cells) {
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {Set<string>} */
  const repeated = new Set();
  for (const cell of cells) {
    const key = describeCell(cell.filter);
    if (seen.has(key)) repeated.add(key);
    seen.add(key);
  }
  return [...repeated];
}

/**
 * @param {{ identifier: string }[]} issues
 * @returns {string[]}
 */
function duplicateIdentifiers(issues) {
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {Set<string>} */
  const repeated = new Set();
  for (const issue of issues) {
    if (seen.has(issue.identifier)) repeated.add(issue.identifier);
    seen.add(issue.identifier);
  }
  return [...repeated];
}

/**
 * The verdict for an export that declares no coverage at all.
 *
 * `complete` is false, and that is the point. An undeclared export is not
 * presumed whole and is not presumed broken — it is presumed unknown, which is
 * the only claim the data supports. The one thing worth saying about it is
 * whether its row count sits exactly on the cap, because that is what a single
 * unpartitioned `list_issues` call looks like from the outside.
 *
 * @param {{ identifier: string }[]} issues
 * @returns {CoverageVerdict}
 */
function undeclaredVerdict(issues) {
  const rowCount = issues.length;
  const problems = [
    'no coverage block — nothing states which queries produced this export, so it cannot be told apart from a truncated one',
  ];
  if (rowCount === DEFAULT_LIMIT) {
    problems.push(
      `the export holds exactly ${DEFAULT_LIMIT} rows, the API cap: this is what one truncated call looks like`
    );
  }
  return {
    declared: false,
    complete: false,
    limit: DEFAULT_LIMIT,
    cellCount: 0,
    declaredTotal: 0,
    rowCount,
    truncated: [],
    uncovered: [],
    duplicateCells: [],
    duplicateIdentifiers: duplicateIdentifiers(issues),
    problems,
  };
}

/**
 * @param {CoverageVerdict} verdict
 * @param {string[]} statuses
 * @returns {void}
 */
function describeStructuralProblems(verdict, statuses) {
  if (statuses.length === 0) {
    verdict.problems.push(
      'coverage declares no statuses, so "every cell is accounted for" is a claim about nothing'
    );
  }
  for (const cell of verdict.truncated) {
    verdict.problems.push(
      `cell ${describeCell(cell.filter)} returned ${cell.count} rows against a limit of ${verdict.limit} — truncated`
    );
  }
  for (const cell of verdict.uncovered) {
    verdict.problems.push(`no query covers ${describeCell(cell)}`);
  }
  for (const key of verdict.duplicateCells) {
    verdict.problems.push(`cell ${key} is declared more than once, so its rows are double-counted`);
  }
  if (verdict.declaredTotal !== verdict.rowCount) {
    verdict.problems.push(
      `the cells claim ${verdict.declaredTotal} rows but the export holds ${verdict.rowCount}`
    );
  }
  for (const identifier of verdict.duplicateIdentifiers) {
    verdict.problems.push(`${identifier} appears more than once, so the cells overlap`);
  }
}

/**
 * Whether an export can be trusted to be the whole of what its filters
 * describe, and if not, precisely why not.
 *
 * @param {Coverage | undefined} coverage
 * @param {{ identifier: string }[]} issues
 * @returns {CoverageVerdict}
 */
export function assessCoverage(coverage, issues) {
  if (coverage === undefined) return undeclaredVerdict(issues);

  const limit = coverage.limit ?? DEFAULT_LIMIT;
  const cells = coverage.cells ?? [];
  const statuses = coverage.statuses ?? [];
  const components = coverage.components ?? [];
  const present = new Set(cells.map((cell) => describeCell(cell.filter)));

  /** @type {CoverageVerdict} */
  const verdict = {
    declared: true,
    complete: false,
    limit,
    cellCount: cells.length,
    declaredTotal: cells.reduce((total, cell) => total + cell.count, 0),
    rowCount: issues.length,
    truncated: cells.filter((cell) => isTruncated(cell.count, limit)),
    uncovered: partitionRoots(statuses).flatMap((root) => findUncovered(root, present, components)),
    duplicateCells: duplicateCellKeys(cells),
    duplicateIdentifiers: duplicateIdentifiers(issues),
    problems: [],
  };

  describeStructuralProblems(verdict, statuses);
  verdict.complete = verdict.problems.length === 0;
  return verdict;
}

/**
 * The coverage block of a parsed export, or `undefined` when it declares none.
 *
 * A block that is present but malformed is a hard error rather than a fall
 * back to `undefined`: silently downgrading it to "undeclared" would turn a
 * broken proof into a missing one, and the two deserve different reactions.
 *
 * @param {unknown} parsed
 * @returns {Coverage | undefined}
 * @throws {Error} when a declared coverage block cannot be read.
 */
export function readCoverage(parsed) {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
  const raw = /** @type {Record<string, unknown>} */ (parsed)['coverage'];
  if (raw === undefined) return undefined;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('"coverage" must be an object');
  }
  const record = /** @type {Record<string, unknown>} */ (raw);
  return {
    limit: readOptionalNumber(record['limit'], 'coverage.limit'),
    statuses: readStringArray(record['statuses'], 'coverage.statuses'),
    components: readStringArray(record['components'], 'coverage.components'),
    cells: readCells(record['cells']),
  };
}

/**
 * @param {unknown} value
 * @param {string} where
 * @returns {number | undefined}
 */
function readOptionalNumber(value, where) {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${where} must be a positive integer`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} where
 * @returns {string[]}
 */
function readStringArray(value, where) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`${where} must be an array of strings`);
  }
  return value.map((entry) => String(entry).trim());
}

/**
 * @param {unknown} value
 * @returns {CoverageCell[]}
 */
function readCells(value) {
  if (!Array.isArray(value)) throw new Error('coverage.cells must be an array');
  return value.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`coverage.cells[${index}] is not an object`);
    }
    const record = /** @type {Record<string, unknown>} */ (entry);
    const count = record['count'];
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
      throw new Error(`coverage.cells[${index}].count must be a non-negative integer`);
    }
    return { filter: readFilter(record['filter'], index), count };
  });
}

/**
 * @param {unknown} value
 * @param {number} index
 * @returns {Cell}
 */
function readFilter(value, index) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`coverage.cells[${index}].filter must be an object`);
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  /** @type {Cell} */
  const cell = {};
  for (const key of /** @type {const} */ (['status', 'component'])) {
    const raw = record[key];
    if (raw === undefined) continue;
    if (typeof raw !== 'string')
      throw new Error(`coverage.cells[${index}].filter.${key} must be a string`);
    cell[key] = raw.trim();
  }
  for (const key of /** @type {const} */ (['hasComponent', 'hasAssignee', 'hasDueDate'])) {
    const raw = record[key];
    if (raw === undefined) continue;
    if (typeof raw !== 'boolean') {
      throw new Error(`coverage.cells[${index}].filter.${key} must be a boolean`);
    }
    cell[key] = raw;
  }
  return cell;
}

/**
 * @param {CoverageVerdict} verdict
 * @returns {string[]}
 */
export function formatCoverage(verdict) {
  if (verdict.complete) {
    return [
      `COVERAGE: complete — ${verdict.cellCount} queries, none within ${verdict.limit} rows of ` +
        `the cap, tiling every declared status with no gap and no overlap; ${verdict.rowCount} issues.`,
    ];
  }
  const headline = verdict.declared
    ? `COVERAGE: INCOMPLETE — this export does not account for the whole backlog (${verdict.rowCount} issues read).`
    : `COVERAGE: UNKNOWN — this export makes no completeness claim (${verdict.rowCount} issues read).`;
  return [headline, ...verdict.problems.map((problem) => `  - ${problem}`)];
}

export const HELP = `Usage: node scripts/huly-partition-plan.mjs --roots --statuses <a,b,c>
       node scripts/huly-partition-plan.mjs --refine '<cell json>' [--components <a,b>]
       node scripts/huly-partition-plan.mjs --assess <export.json>
       node scripts/huly-partition-plan.mjs --self-test

--roots   prints the query per workflow status to start from.
--refine  prints the queries that replace one truncated cell.
--assess  reads an export's "coverage" block and says whether it covers the
          whole backlog. Exits 1 when it does not.

A cell whose row count reaches the limit is truncated: discard it, refine it,
and query the children. Never keep a capped result.`;

/**
 * @param {string[]} args
 * @param {string} flag
 * @returns {string | undefined}
 */
export function readFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('-')) return undefined;
  return value;
}

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
  const children = refineCell(JSON.parse(raw), readList(readFlag(args, '--components')));
  if (children === undefined) {
    console.error(
      'FAIL — no filter is left to divide this cell by. This API cannot enumerate it; ' +
        'say so rather than reporting the capped rows as the whole of it.'
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
function runAssess(args) {
  const path = readFlag(args, '--assess');
  if (path === undefined) {
    console.error('FAIL — --assess needs a path to an export.');
    return 2;
  }
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const rows = Array.isArray(parsed) ? parsed : (parsed?.result ?? []);
  const verdict = assessCoverage(readCoverage(parsed), rows);
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
