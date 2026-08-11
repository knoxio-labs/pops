/**
 * The recipe for reading a whole tracker backlog through an API that will not
 * hand one over.
 *
 * `mcp__huly-knoxiolabs__list_issues` accepts `limit` with a hard maximum of
 * 200 and offers no offset, cursor or total count. Results come back sorted by
 * modification date, newest first. So a filter matching 400 issues returns the
 * newest 200 and says nothing about the other 200 — the caller sees a full
 * page and cannot distinguish it from a complete answer. That is the shape
 * this module exists to defeat: a sweep written the obvious way reports "no
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
 * ## Where the recipe runs out
 *
 * Steps 1–4 dead-end, and not hypothetically: a status whose issues mostly
 * carry no component, no assignee and no due date hands the same rows to one
 * child at every boolean split, and never reaches the component fan-out at all,
 * because the capped branch is the one *without* components. That is the real
 * shape of `Merged` on this tracker, not a constructed worst case — the figures
 * as measured are in the `--assess` verification notes rather than here, since
 * they date instantly.
 *
 * `titleRegex` is what gets past it. On the Postgres backend it is SQL
 * `SIMILAR TO` — whole-title, case-sensitive — and it accepts bracket classes
 * and alternation, so a caller can bisect on leading characters (`d%`,
 * `f[^e]%`, `feat\\([a-e]%`) until each piece lands under the cap.
 *
 * But a set of title patterns is hand-written, and **nothing here can prove a
 * set of them tiles anything.** There is no finite enumeration to check them
 * against the way `list_statuses` and `list_components` bound the other axes,
 * and the residual class at each step ("the next character is not a lowercase
 * letter") is not divisible by any enumerable set. A real gap is easy to write
 * and invisible: `c[^h]%` and `ch%` together miss the title that is exactly
 * `"c"`. So `findUncovered` reports a title-partitioned branch as an
 * **assumption** — neither covered nor missing — and the assessment carries
 * that through to its own line in the report rather than folding it into a
 * clean verdict.
 *
 * Proving the whole thing would take a total count to reconcile against, or an
 * offset/cursor. Both are the upstream server's to add — checked as of
 * 2026-08-11 against the live `mcp__huly-knoxiolabs__list_issues` tool schema
 * and its responses, neither exists. Failing that, `narrowingQueries` gives
 * the fallback the risk admits: `titleSearch` is a second, unrelated read path
 * (case-insensitive substring, not `SIMILAR TO` prefix) over the same branch,
 * so an identifier it turns up that no title-regex leaf ever returned is
 * *proof* of a missed row, not another assumption stacked on the first. It
 * cannot prove the reverse — a title sharing none of the patterns' leading
 * substrings anywhere slips past both reads alike — so this narrows the
 * risk in a hand-written pattern set without closing the axis. `assessCoverage`
 * in `huly-coverage.mjs` folds a declared cross-check into its verdict; the
 * `ASSUMED, not verified` line never upgrades to verified, only to narrowed.
 *
 * `isTopLevel` is deliberately unused. It is not a partition: `true` returns
 * top-level issues, but `false` returns everything rather than the sub-issues,
 * so the pair does not complement.
 */

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
 *   titleSearch?: string,
 * }} Cell A `list_issues` filter combination. `titleRegex` and `titleSearch`
 * are mutually exclusive at the API, mirroring the tool itself: a title
 * partition leaf carries the former, a narrowing cross-check carries the
 * latter, and no cell this module builds carries both.
 * @typedef {{ filter: Cell, count: number }} CoverageCell One executed query and how many rows it returned.
 * @typedef {{ query: Cell, identifiers: string[] }} NarrowingResult One
 * executed `titleSearch` cross-check (see `narrowingQueries`) and the
 * identifiers it returned. `query.titleSearch` says which branch it checks;
 * `identifiers` is compared against the whole export, not just that branch's
 * declared cells, since the two must never overlap in the first place.
 * @typedef {{
 *   limit?: number,
 *   statuses?: string[],
 *   components?: string[],
 *   cells: CoverageCell[],
 *   titleNarrowing?: NarrowingResult[],
 * }} Coverage The provenance block an enumerated export carries. `cells` is
 * required: a coverage block that names no queries is a proof of nothing, and
 * `readCoverage` refuses it rather than reading it as an empty one. The other
 * four default, and not to the same effect. An absent `limit` means the API
 * cap. An absent `statuses` is called out by the assessment, because "every
 * declared status is covered" over no statuses is a claim about nothing. An
 * absent `components` is NOT called out on its own — it only bites where a
 * branch needed the component fan-out, and there it shows up as an uncovered
 * `hasComponent=true` cell rather than as a complaint about the list. An
 * absent `titleNarrowing` is not called out either: not every export runs the
 * fallback, and the assumption line says plainly when none did.
 * @typedef {{ branch: Cell, patterns: string[] }} Assumption A branch covered only by title patterns.
 * @typedef {{ uncovered: Cell[], assumed: Assumption[] }} Gaps
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
  if (cell.titleSearch !== undefined) parts.push(`titleSearch=${cell.titleSearch}`);
  return parts.length === 0 ? '(unfiltered)' : parts.join(' ');
}

/**
 * The same cell with any title pattern or title search stripped — the branch
 * a title split, or a narrowing cross-check, divides.
 *
 * @param {Cell} cell
 * @returns {Cell}
 */
export function titleBase(cell) {
  return {
    status: cell.status,
    component: cell.component,
    hasComponent: cell.hasComponent,
    hasAssignee: cell.hasAssignee,
    hasDueDate: cell.hasDueDate,
  };
}

/**
 * The special characters `SIMILAR TO` gives meaning beyond a literal
 * character: `%`/`_` are the SQL wildcards, the rest are the POSIX regex
 * extensions Postgres layers on top (bracket classes, alternation,
 * quantifiers, grouping, anchors).
 */
const SIMILAR_TO_SPECIAL = new Set([
  '%',
  '_',
  '(',
  ')',
  '|',
  '*',
  '+',
  '?',
  '{',
  '}',
  '[',
  ']',
  '^',
  '$',
  '.',
]);

/**
 * The leading literal substring a `titleRegex` pattern commits to — the part
 * before its first unescaped wildcard, bracket class, or other special
 * character. `\x` escapes `x` to a literal, per `SIMILAR TO`.
 *
 * This is the exact substring every title the pattern matches must contain,
 * which is what makes it usable as a `titleSearch` cross-check: `d%` and
 * `f[^e]%` and `feat\([a-e]%` yield `'d'`, `'f'`, and `'feat('`. A pattern
 * whose special character comes first (`[a-m]%`) yields `''` — nothing here
 * is more specific than the whole branch, so it contributes no cross-check.
 *
 * @param {string} pattern
 * @returns {string}
 */
export function titleSearchPrefix(pattern) {
  let prefix = '';
  let index = 0;
  while (index < pattern.length) {
    const char = pattern[index];
    if (char === '\\' && index + 1 < pattern.length) {
      prefix += pattern[index + 1];
      index += 2;
      continue;
    }
    if (SIMILAR_TO_SPECIAL.has(char)) break;
    prefix += char;
    index += 1;
  }
  return prefix;
}

/**
 * The narrowing cross-check queries for one title-partitioned branch: one
 * `titleSearch` per distinct non-empty leading substring its patterns commit
 * to, scoped by the same non-title filters as the branch itself.
 *
 * `titleSearch` reads case-insensitive substring, anywhere in the title — a
 * different mechanism from `titleRegex`'s case-sensitive, whole-title
 * `SIMILAR TO` prefix match. An identifier one of these queries returns that
 * no title-regex leaf for this branch ever did is not another assumption:
 * it is a title the patterns provably missed. See the module header for what
 * this does and does not establish.
 *
 * @param {Cell} branch A cell with no `titleRegex`/`titleSearch` of its own —
 *   the same branch the patterns in `titlePartitions` divide.
 * @param {string[]} patterns The `titleRegex` patterns dividing `branch`.
 * @returns {Cell[]}
 */
export function narrowingQueries(branch, patterns) {
  const prefixes = [...new Set(patterns.map(titleSearchPrefix))].filter((prefix) => prefix !== '');
  return prefixes.map((titleSearch) => ({ ...titleBase(branch), titleSearch }));
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
 * The cells that replace a truncated one, or `undefined` when the enumerable
 * filters have nothing left to divide it by.
 *
 * `undefined` is the honest answer, not a failure to try: it means this API
 * cannot enumerate that cell without hand-written `titleRegex` patterns, and a
 * caller that receives it must say so rather than report the capped rows as the
 * whole of it.
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
  // `component === undefined` is load-bearing, not redundant with the first
  // branch. A cell naming a component is already past the fan-out, and fanning
  // it out again would replace that label with all of them — a set of children
  // wider than the parent they claim to divide, which turns a covered branch
  // into an uncovered one and back depending on which labels were passed in.
  // The recipe never builds such a cell; a hand-written `--refine` argument can.
  if (cell.hasComponent === true && cell.component === undefined && components.length > 0) {
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
