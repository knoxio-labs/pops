/**
 * Reading an enumerated tracker export, and deciding whether it can be trusted
 * to be the whole of what its filters describe.
 *
 * The recipe that produces such an export, and the reason its last axis cannot
 * be proven, are in `huly-partition.mjs`. This module is the other half: given
 * what an export *claims* about how it was gathered, say whether the claim
 * holds.
 *
 * ## What is proven
 *
 * That the declared cells tile the whole status list with no gap and no
 * duplicate, that no cell reached the cap, that the row count adds up, and that
 * no identifier arrived twice. A missing branch is named rather than silently
 * absorbed. When an export also declares `titleNarrowing` cross-checks (see
 * `narrowingQueries` in `huly-partition.mjs`), an identifier one of them
 * returns that the export never harvested any other way is proven missing,
 * not merely suspected — that promotes the export to INCOMPLETE with the
 * identifier named, the same as any other structural problem.
 *
 * ## What is taken on trust
 *
 * Four things, each verifiable at the API rather than in code:
 *
 *   - **The boolean filters are total.** `hasAssignee: true` plus
 *     `hasAssignee: false` is asserted to equal the unfiltered set. Check it by
 *     splitting a cell comfortably under the cap and confirming the two counts
 *     sum to the parent's.
 *   - **The status list is complete.** Taken from `list_statuses`; its `total`
 *     is the check.
 *   - **The component list is complete.** Same argument, against the 200 cap on
 *     `list_components`.
 *   - **A title partition tiles its branch.** This one is not merely unchecked
 *     but uncheckable here, so it is reported as an assumption on its own line
 *     rather than folded into the verdict — even when a narrowing cross-check
 *     found nothing wrong. Absence of a caught gap is not proof of no gap: a
 *     title sharing none of the patterns' leading substrings anywhere would
 *     slip past `titleSearch` exactly as it slipped past `titleRegex`. The
 *     line says `narrowed`, never `verified`.
 *
 * Every refusal in this module names the row it choked on. That message is the
 * value — a caller that catches these must print it.
 */

import {
  DEFAULT_LIMIT,
  describeCell,
  findUncovered,
  isTruncated,
  partitionRoots,
  titleBase,
  titlePartitions,
} from './huly-partition.mjs';

/**
 * @typedef {import('./huly-partition.mjs').Cell} Cell
 * @typedef {import('./huly-partition.mjs').Coverage} Coverage
 * @typedef {import('./huly-partition.mjs').CoverageCell} CoverageCell
 * @typedef {import('./huly-partition.mjs').NarrowingResult} NarrowingResult
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
 * @typedef {{ branch: string, prefixes: string[], missing: string[] }} NarrowingByBranch
 */

/**
 * Fold the declared `titleNarrowing` cross-checks against the identifiers the
 * export actually harvested, keyed by the branch each cross-check queried.
 *
 * A cross-check's `identifiers` are compared against `harvested` — every
 * identifier the export holds, from any cell — not just the branch's own
 * cells, since the partition's whole premise is that branches never overlap:
 * an identifier `titleSearch` returns for this branch that appears ANYWHERE
 * else in the export is still a query this branch's own leaves never made,
 * which is the gap the cross-check exists to catch.
 *
 * @param {NarrowingResult[]} narrowing
 * @param {Set<string>} harvested
 * @returns {{ byBranch: Map<string, NarrowingByBranch>, problems: string[] }}
 */
function foldNarrowing(narrowing, harvested) {
  /** @type {Map<string, NarrowingByBranch>} */
  const byBranch = new Map();
  /** @type {string[]} */
  const problems = [];
  for (const { query, identifiers } of narrowing) {
    const branch = describeCell(titleBase(query));
    const prefix = /** @type {string} */ (query.titleSearch);
    const missing = identifiers.filter((identifier) => !harvested.has(identifier));
    const entry = byBranch.get(branch) ?? { branch, prefixes: [], missing: [] };
    entry.prefixes.push(prefix);
    entry.missing.push(...missing);
    byBranch.set(branch, entry);
    for (const identifier of missing) {
      problems.push(
        `narrowing cross-check titleSearch="${prefix}" on ${branch} found ${identifier}, which no ` +
          `declared query returned — the title patterns dividing that branch missed it`
      );
    }
  }
  return { byBranch, problems };
}

/**
 * One assumption line: the branch, its patterns, and — when a narrowing
 * cross-check was declared for it — whether that cross-check turned up
 * anything the patterns missed. Never claims `verified`; at best `narrowed`.
 *
 * @param {import('./huly-partition.mjs').Assumption} assumption
 * @param {Map<string, NarrowingByBranch>} narrowingByBranch
 * @returns {string}
 */
function formatAssumption(assumption, narrowingByBranch) {
  const branch = describeCell(assumption.branch);
  const base =
    `${branch} is covered only by ${assumption.patterns.length} title pattern(s), and nothing ` +
    `here can prove they tile it: ${assumption.patterns.join(' | ')}`;
  const check = narrowingByBranch.get(branch);
  if (check === undefined) return `${base} — not cross-checked`;
  if (check.missing.length > 0) {
    return (
      `${base} — cross-checked via titleSearch (${check.prefixes.join(', ')}): ` +
      `found a gap, see the problem(s) above`
    );
  }
  return `${base} — narrowed: titleSearch (${check.prefixes.join(', ')}) found nothing the patterns missed`;
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
  const assumed = gaps.flatMap((gap) => gap.assumed);
  const harvested = new Set(issues.map((issue) => issue.identifier));
  const narrowing = foldNarrowing(coverage.titleNarrowing ?? [], harvested);

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
    problems: [...narrowing.problems],
    assumptions: assumed.map((assumption) => formatAssumption(assumption, narrowing.byBranch)),
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
    titleNarrowing: readNarrowing(record['titleNarrowing']),
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
  const trimmed = value.map((entry) => String(entry).trim());
  // Same refusal as `readFilter`, for the same reason: an empty entry becomes a
  // root nothing can match, and the export is then condemned for an uncovered
  // `status=` rather than for the typo that produced it.
  const empty = trimmed.indexOf('');
  if (empty !== -1) throw new Error(`${where}[${empty}] is empty`);
  return trimmed;
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
    return { filter: readFilter(record['filter'], `coverage.cells[${index}].filter`), count };
  });
}

/**
 * @param {unknown} value
 * @returns {NarrowingResult[]}
 */
function readNarrowing(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('coverage.titleNarrowing must be an array');
  return value.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`coverage.titleNarrowing[${index}] is not an object`);
    }
    const record = /** @type {Record<string, unknown>} */ (entry);
    const query = readFilter(record['query'], `coverage.titleNarrowing[${index}].query`);
    if (query.titleSearch === undefined) {
      throw new Error(
        `coverage.titleNarrowing[${index}].query.titleSearch is required — a cross-check with ` +
          `no search term is not a cross-check`
      );
    }
    // Required, unlike the top-level `statuses`/`components` lists: those are
    // optional axes an export may simply not use, but an entry that names a
    // query without saying what it returned is not "found nothing", it is
    // incomplete — the same distinction `readCells` draws by requiring `count`.
    const where = `coverage.titleNarrowing[${index}].identifiers`;
    if (record['identifiers'] === undefined) {
      throw new Error(`${where} must be an array of strings`);
    }
    const identifiers = readStringArray(record['identifiers'], where);
    return { query, identifiers };
  });
}

/**
 * A `Cell` embedded in a coverage block — either a query's `filter` or a
 * narrowing cross-check's `query`. Both shapes are read the same way.
 *
 * @param {unknown} value
 * @param {string} where Path to this filter, e.g. `coverage.cells[0].filter`.
 * @returns {Cell}
 */
function readFilter(value, where) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${where} must be an object`);
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  /** @type {Cell} */
  const cell = {};
  for (const key of /** @type {const} */ (['status', 'component'])) {
    const raw = record[key];
    if (raw === undefined) continue;
    if (typeof raw !== 'string') throw new Error(`${where}.${key} must be a string`);
    // Refused, not trimmed to nothing. `" "` would become a filter matching no
    // root, so the branch it was meant to cover reads as uncovered and the
    // export is condemned for the wrong reason — a misleading verdict instead
    // of a message naming the row that needs fixing.
    if (raw.trim() === '') throw new Error(`${where}.${key} is empty`);
    cell[key] = raw.trim();
  }
  for (const key of /** @type {const} */ (['hasComponent', 'hasAssignee', 'hasDueDate'])) {
    const raw = record[key];
    if (raw === undefined) continue;
    if (typeof raw !== 'boolean') {
      throw new Error(`${where}.${key} must be a boolean`);
    }
    cell[key] = raw;
  }
  for (const key of /** @type {const} */ (['titleRegex', 'titleSearch'])) {
    const raw = record[key];
    if (raw === undefined) continue;
    if (typeof raw !== 'string') {
      throw new Error(`${where}.${key} must be a string`);
    }
    // Not trimmed, unlike every other field: a pattern's or search term's
    // leading and trailing whitespace is part of what it matches, and quietly
    // removing it would change which rows the cell claims to have covered.
    cell[key] = raw;
  }
  // The API itself refuses both at once (`titleRegex` and `titleSearch` are
  // mutually exclusive `list_issues` parameters), so a filter naming both can
  // never have been the query that actually ran. Accepting it here would let
  // an impossible cell stand in as part of a coverage proof.
  if (cell.titleRegex !== undefined && cell.titleSearch !== undefined) {
    throw new Error(`${where} sets both titleRegex and titleSearch — the API allows only one`);
  }
  return cell;
}

/**
 * The issue rows of a parsed export, from either accepted envelope.
 *
 * A `result` that is present but not an array is refused rather than coerced
 * to empty: an export of zero issues assesses as a tiny clean backlog, which
 * is the most convincing wrong answer this tool can give. Rows are validated
 * here too rather than left to blow up in `duplicateIdentifiers`, which runs
 * outside a caller's read guard.
 *
 * @param {unknown} parsed
 * @returns {{ identifier: string }[]}
 * @throws {Error} on an envelope this tool cannot read.
 */
export function readRows(parsed) {
  const rows = Array.isArray(parsed) ? parsed : resultArrayOf(parsed);
  return rows.map((row, index) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      throw new Error(`issue at index ${index} is not an object`);
    }
    const identifier = /** @type {Record<string, unknown>} */ (row)['identifier'];
    if (typeof identifier !== 'string' || identifier.trim() === '') {
      throw new Error(`issue at index ${index} has no string "identifier"`);
    }
    return { identifier: identifier.trim() };
  });
}

/**
 * @param {unknown} parsed
 * @returns {unknown[]}
 */
function resultArrayOf(parsed) {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('expected a JSON array of issues, or an object with a "result" array');
  }
  const result = /** @type {Record<string, unknown>} */ (parsed)['result'];
  if (!Array.isArray(result)) throw new Error('"result" must be an array of issues');
  return result;
}

/**
 * The verdict as lines a reader can act on.
 *
 * The complete-with-assumptions headline is deliberately not the same sentence
 * as the fully-verified one. Reusing it would let a branch nobody could check
 * read as one that was checked, which is the failure this whole module exists
 * to prevent, arriving through the report instead of the data.
 *
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
