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
 *   5. **Past that, only `titleRegex` is left**, and it is the caller's to
 *      write. See below — this is where the recipe stops being provable.
 *
 * ## Where the recipe runs out, and what that cost on real data
 *
 * Steps 1–4 dead-end, and not hypothetically. Measured 2026-08-10: status
 * `Merged` holds 1140 issues, of which 1138 have no component, no assignee and
 * no due date. Every boolean split hands the same 1138 rows to one child, and
 * the component fan-out never fires because the capped branch is the one
 * *without* components. `{Merged, hasComponent:false, hasAssignee:false,
 * hasDueDate:false}` returns 200 with all four filters spent.
 *
 * `titleRegex` is what gets past it. On the Postgres backend it is SQL
 * `SIMILAR TO` — whole-title, case-sensitive — and it accepts bracket classes
 * and alternation, so a caller can bisect on leading characters (`d%`,
 * `f[^e]%`, `feat\\([a-e]%`) until each piece lands under the cap. That is how
 * the 1140 were read, in 16 leaves.
 *
 * But a set of title patterns is hand-written, and **nothing here can prove a
 * set of them tiles anything.** There is no finite enumeration to check them
 * against the way `list_statuses` and `list_components` bound the other axes,
 * and the residual class at each step ("the next character is not a lowercase
 * letter") is not divisible by any enumerable set. A real gap is easy to write
 * and invisible: `c[^h]%` and `ch%` together miss the title that is exactly
 * `"c"`. So a title-partitioned branch is recorded as an **assumption** — the
 * export asserted it, this tool did not check it, and `formatCoverage` says so
 * on its own line rather than folding it into a clean verdict.
 *
 * Proving the whole thing would take a total count to reconcile against, or an
 * offset/cursor. Both are the upstream server's to add.
 *
 * ## What the structural check does prove
 *
 * `assessCoverage` proves that the declared cells tile the whole status list
 * with no gap and no duplicate, that no cell reached the cap, that the row
 * count adds up, and that no identifier arrived twice. `findUncovered` refines
 * each root the same way a caller would and names any branch nothing accounted
 * for, so a missing cell is reported rather than silently absorbed.
 *
 * Three further things it takes on trust, each verifiable at the API rather
 * than in code:
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
 * failed, or the assessed export is incomplete. Exit 2 = usage error, or an
 * export this tool could not read — which is deliberately not 1, because "your
 * file is malformed" and "your backlog is short" are different events and a
 * caller switching on the code must not conflate them.
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
 *   titleRegex?: string,
 * }} Cell A `list_issues` filter combination.
 * @typedef {{ filter: Cell, count: number }} CoverageCell One executed query and how many rows it returned.
 * @typedef {{
 *   limit?: number,
 *   statuses?: string[],
 *   components?: string[],
 *   cells: CoverageCell[],
 * }} Coverage The provenance block an enumerated export carries. `cells` is
 * required: a coverage block that names no queries is a proof of nothing, and
 * `readCoverage` refuses it rather than reading it as an empty one. The other
 * three default — an absent `limit` means the API cap, and absent `statuses`
 * or `components` are caught by the assessment as a claim about nothing.
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
  if (cell.titleRegex !== undefined) parts.push(`titleRegex=${cell.titleRegex}`);
  return parts.length === 0 ? '(unfiltered)' : parts.join(' ');
}

/**
 * The same cell with any title pattern stripped — the branch a title split
 * divides.
 *
 * @param {Cell} cell
 * @returns {Cell}
 */
function titleBase(cell) {
  return {
    status: cell.status,
    component: cell.component,
    hasComponent: cell.hasComponent,
    hasAssignee: cell.hasAssignee,
    hasDueDate: cell.hasDueDate,
  };
}

/**
 * Every title pattern the export declares, indexed by the branch it divides.
 *
 * @param {CoverageCell[]} cells
 * @returns {Map<string, string[]>}
 */
export function titlePartitions(cells) {
  /** @type {Map<string, string[]>} */
  const byBranch = new Map();
  for (const { filter } of cells) {
    if (filter.titleRegex === undefined) continue;
    const key = describeCell(titleBase(filter));
    byBranch.set(key, [...(byBranch.get(key) ?? []), filter.titleRegex]);
  }
  return byBranch;
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
 * @typedef {{ branch: Cell, patterns: string[] }} Assumption A branch covered only by title patterns.
 * @typedef {{ uncovered: Cell[], assumed: Assumption[] }} Gaps
 */

/**
 * What `present` does not account for in `target`, split into what is missing
 * outright and what is covered only by an unverifiable title partition.
 *
 * A branch nothing touched is reported at its own level rather than exploded
 * into leaves: a status absent from the export should read as one missing
 * status, not as eighty-four missing filter combinations.
 *
 * A branch reached only through `titleRegex` patterns is neither covered nor
 * missing. Whether those patterns tile it is not decidable here — see this
 * file's header — so it is recorded as an assumption and surfaced as one.
 *
 * @param {Cell} target
 * @param {Set<string>} present Cell descriptions the export declares.
 * @param {string[]} components
 * @param {Map<string, string[]>} [titles] Title patterns by the branch they divide.
 * @returns {Gaps}
 */
export function findUncovered(target, present, components, titles = new Map()) {
  if (present.has(describeCell(target))) return { uncovered: [], assumed: [] };
  const patterns = titles.get(describeCell(target));
  if (patterns !== undefined && patterns.length > 0) {
    return { uncovered: [], assumed: [{ branch: target, patterns }] };
  }
  const children = refineCell(target, components);
  if (children === undefined) return { uncovered: [target], assumed: [] };
  const gaps = children.map((child) => findUncovered(child, present, components, titles));
  const assumed = gaps.flatMap((gap) => gap.assumed);
  const uncovered = gaps.map((gap) => gap.uncovered);
  return isWhollyUncovered(children, uncovered)
    ? { uncovered: [target], assumed }
    : { uncovered: uncovered.flat(), assumed };
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
 *   assumptions: string[],
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
    assumptions: [],
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
  const cells = coverage.cells;
  const statuses = coverage.statuses ?? [];
  const components = coverage.components ?? [];
  const present = new Set(cells.map((cell) => describeCell(cell.filter)));
  const titles = titlePartitions(cells);
  const gaps = partitionRoots(statuses).map((root) =>
    findUncovered(root, present, components, titles)
  );

  /** @type {CoverageVerdict} */
  const verdict = {
    declared: true,
    complete: false,
    limit,
    cellCount: cells.length,
    declaredTotal: cells.reduce((total, cell) => total + cell.count, 0),
    rowCount: issues.length,
    truncated: cells.filter((cell) => isTruncated(cell.count, limit)),
    uncovered: gaps.flatMap((gap) => gap.uncovered),
    duplicateCells: duplicateCellKeys(cells),
    duplicateIdentifiers: duplicateIdentifiers(issues),
    problems: [],
    assumptions: gaps
      .flatMap((gap) => gap.assumed)
      .map(
        (assumption) =>
          `${describeCell(assumption.branch)} is covered only by ${assumption.patterns.length} ` +
          `title pattern(s), and nothing here can prove they tile it: ` +
          assumption.patterns.join(' | ')
      ),
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
    // Refused, not trimmed to nothing. `" "` would become a filter matching no
    // root, so the branch it was meant to cover reads as uncovered and the
    // export is condemned for the wrong reason — a misleading verdict instead
    // of a message naming the row that needs fixing.
    if (raw.trim() === '') throw new Error(`coverage.cells[${index}].filter.${key} is empty`);
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
  const titleRegex = record['titleRegex'];
  if (titleRegex !== undefined) {
    if (typeof titleRegex !== 'string') {
      throw new Error(`coverage.cells[${index}].filter.titleRegex must be a string`);
    }
    // Not trimmed, unlike every other field: a pattern's leading and trailing
    // whitespace is part of what it matches, and quietly removing it would
    // change which rows the cell claims to have covered.
    cell.titleRegex = titleRegex;
  }
  return cell;
}

/**
 * @param {CoverageVerdict} verdict
 * @returns {string[]}
 */
export function formatCoverage(verdict) {
  const assumptions = verdict.assumptions.map(
    (assumption) => `  ASSUMED, not verified: ${assumption}`
  );
  if (verdict.complete) {
    const scope = assumptions.length === 0 ? 'complete' : 'complete on every axis it can verify';
    return [
      `COVERAGE: ${scope} — ${verdict.cellCount} queries, none of them reaching the ` +
        `${verdict.limit}-row cap, tiling every declared status with no gap and no overlap; ` +
        `${verdict.rowCount} issues.`,
      ...assumptions,
    ];
  }
  const headline = verdict.declared
    ? `COVERAGE: INCOMPLETE — this export does not account for the whole backlog (${verdict.rowCount} issues read).`
    : `COVERAGE: UNKNOWN — this export makes no completeness claim (${verdict.rowCount} issues read).`;
  return [headline, ...verdict.problems.map((problem) => `  - ${problem}`), ...assumptions];
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
and query the children. Never keep a capped result.

status, the three booleans and component are enumerable, so --assess proves
those tile. Past them only titleRegex is left, it is hand-written, and no
finite set bounds it — a branch divided that way is reported as an assumption
this tool did not check.`;

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
  /** @type {Cell} */
  let cell;
  try {
    cell = JSON.parse(raw);
  } catch (error) {
    console.error(`FAIL — --refine could not read that as JSON: ${String(error)}`);
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
    // Exit 2, not 1. An export this tool cannot read is a different event from
    // one it read and found wanting, and a caller switching on the exit code
    // must not confuse "your file is malformed" with "your backlog is short".
    console.error(
      `FAIL — could not read ${path}: ${error instanceof Error ? error.message : String(error)}`
    );
    return 2;
  }
  const verdict = assessCoverage(coverage, rows);
  console.log(formatCoverage(verdict).join('\n'));
  return verdict.complete ? 0 : 1;
}

/**
 * The issue rows of a parsed export, from either accepted envelope.
 *
 * A `result` that is present but not an array is refused rather than coerced
 * to empty: an export of zero issues assesses as a tiny clean backlog, which
 * is the most convincing wrong answer this tool can give.
 *
 * @param {unknown} parsed
 * @returns {{ identifier: string }[]}
 * @throws {Error} on an envelope this tool cannot read.
 */
export function readRows(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('expected a JSON array of issues, or an object with a "result" array');
  }
  const result = /** @type {Record<string, unknown>} */ (parsed)['result'];
  if (!Array.isArray(result)) throw new Error('"result" must be an array of issues');
  return result;
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
    'a title-partitioned branch is recorded as an assumption, not as proof':
      titleSplit.complete && titleSplit.assumptions.length === 1,
    'and the report says so out loud rather than reading clean': formatCoverage(titleSplit)
      .join('\n')
      .includes('ASSUMED, not verified'),
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
