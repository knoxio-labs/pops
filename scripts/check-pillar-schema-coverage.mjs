#!/usr/bin/env node
/**
 * Pillar schema coverage guard.
 *
 * Post lake-migration the per-pillar `*-db` packages were collapsed into
 * the pillars themselves: a pillar at `pillars/<x>` owns its schema under
 * `pillars/<x>/src/db/schema/**`, its services under
 * `pillars/<x>/src/db/services/**`, its migrations journal under
 * `pillars/<x>/migrations/`, and exposes an `open<Pillar>Db()` opener from
 * its built `dist/db/index.js`. Tables that more than one pillar persists
 * (e.g. `entities`, `aiInferenceLog`) are no longer shared via a package —
 * each pillar owns a byte-compatible local copy under
 * `pillars/<x>/src/db/schema/**` and surfaces it through its
 * `src/db/schema.ts` barrel.
 *
 * For each discovered pillar:
 *   1. Open a fresh SQLite DB (temp file — `:memory:` is incompatible
 *      with the pillar opener's `journal_mode=WAL` pragma).
 *   2. Apply the pillar's migrations journal via its `open<Pillar>Db()`
 *      export (discovered dynamically from `dist/db/index.js`).
 *   3. Walk `src/db/services/**`, collect every table symbol imported from
 *      the pillar's schema barrel (`.../schema.js`) or a specific schema
 *      module (`.../schema/<name>.js`).
 *   4. Map each symbol to its physical table name, expected index list and
 *      literal column defaults (parsed from the pillar's own
 *      `src/db/schema/**`).
 *   5. Assert every expected table exists in `sqlite_master`. Assert every
 *      expected index exists. Assert every column whose schema declares a
 *      literal `.default(...)` carries the matching `DEFAULT` clause.
 *   6. Exit non-zero with a precise diff if anything is missing or disagrees.
 *
 * This catches the systemic gap that let Track N4 (#2908) merge with a
 * latent "no such table" because the migration baseline was never
 * extended.
 *
 * The default comparison closes a second gap of the same shape (POPS-3033):
 * the guard asserted tables and indexes and never looked at column defaults,
 * so `home_inventory.condition` sat with a lowercase `'good'` in its DDL while
 * the schema said `'Good'` and nothing reported it. drizzle applies a static
 * `.default(value)` client-side instead of emitting `DEFAULT`, which is why
 * the divergence stayed invisible — dead configuration for exactly as long as
 * drizzle is the only writer, and wrong the moment a raw INSERT is not.
 *
 * The pillar set is derived from disk (every `pillars/<x>` that exposes a
 * `src/db/schema.ts` barrel) — there is no hard-coded pillar list. Discovery
 * by one filename cuts both ways, so two things follow from it. A pillar that
 * carries a `migrations/` or `src/db/` directory and no barrel is REPORTED and
 * fails the run rather than quietly leaving the set, because leaving the set
 * also removes it from the job matrix `--list-pillars` feeds. And a pillar
 * that is discovered but yields no table symbols, or no references to them,
 * fails as "could not analyse" instead of scoring as full coverage — that
 * branch used to return the guard's success value before the database was
 * ever opened (POPS-1626, POPS-1629).
 *
 * Usage:
 *   node scripts/check-pillar-schema-coverage.mjs --pillar finance
 *   node scripts/check-pillar-schema-coverage.mjs --all
 *   node scripts/check-pillar-schema-coverage.mjs --list-pillars
 *   node scripts/check-pillar-schema-coverage.mjs --pillar finance --ignore-allowlist
 *   node scripts/check-pillar-schema-coverage.mjs --pillar finance --inject-fake-table finance:fake_table
 *   node scripts/check-pillar-schema-coverage.mjs --pillar finance --inject-fake-default
 *
 * Exit code 0 on full coverage (or allowlisted). Non-zero on any miss.
 * Non-zero on usage errors.
 */

import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The expectation `--inject-fake-default` plants so the workflow can prove the
 * default check reports rather than merely passes (ADR-045). No DDL default
 * can equal it, and it is deliberately checked against a column that DOES
 * carry a real default, so the branch exercised is "the two disagree" — the
 * one an actual drift would take — not "the column is missing".
 */
const FAKE_SELF_TEST_DEFAULT = '__fake_self_test_default__';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

/**
 * A column whose drizzle schema declares a literal default, paired with the
 * `DEFAULT` clause its migration DDL is expected to carry.
 *
 * @typedef {object} ColumnDefault
 * @property {string} column   Physical column name.
 * @property {string} expected Normalised default, as `normaliseDdlDefault` would render the DDL side.
 */

/**
 * @typedef {object} Pillar
 * @property {string} name    Pillar dir name, e.g. `finance`.
 * @property {string} pkgDir  Repo-relative pillar root, e.g. `pillars/finance`.
 */

/**
 * The narrow slice of the better-sqlite3 `Database` surface this script
 * touches, declared locally rather than imported from `better-sqlite3` —
 * that package is a per-pillar dependency, not a root one, so its types are
 * not reachable from this script's tsconfig.
 *
 * @typedef {object} SqliteStatement
 * @property {(...params: unknown[]) => unknown} get
 * @property {(...params: unknown[]) => unknown[]} all
 */

/**
 * @typedef {object} SqliteHandle
 * @property {(sql: string) => SqliteStatement} prepare
 * @property {() => void} close
 */

/**
 * Discover the pillar set from disk. A pillar is any `pillars/<x>` that
 * exposes a `src/db/schema.ts` barrel — the canonical signal that it owns
 * a migrated schema surface this guard can check. No static list.
 *
 * @param {string} [pillarsRoot] Absolute path to the `pillars` directory.
 * @returns {Pillar[]}
 */
export function discoverPillars(pillarsRoot = join(repoRoot, 'pillars')) {
  if (!existsSync(pillarsRoot)) return [];
  /** @type {Pillar[]} */
  const out = [];
  for (const entry of readdirSync(pillarsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!existsSync(join(pillarsRoot, entry.name, 'src', 'db', 'schema.ts'))) continue;
    out.push({ name: entry.name, pkgDir: join('pillars', entry.name) });
  }
  return out.toSorted((a, b) => a.name.localeCompare(b.name));
}

/**
 * The pillars this guard would want to check and cannot: a `pillars/<x>`
 * carrying a `migrations/` or a `src/db/` directory but exposing no
 * `src/db/schema.ts` barrel for `discoverPillars` to find.
 *
 * Discovery by one hardcoded filename means a renamed barrel does not fail
 * the guard, it removes the pillar from it — and nine of ten pillars passing
 * prints exactly the same as ten of ten. The workflow mirrors this discovery
 * to build its job matrix, so the pillar loses its CI job too and the
 * workflow still reports green. Naming the pillars that fell out is what
 * makes that difference visible; `main` turns the list into a failure.
 *
 * A `pillars/<x>` with neither directory is not a candidate — plenty of
 * units under `pillars/` legitimately persist nothing.
 *
 * Nor is a pillar without a root `package.json`. This guard reads drizzle
 * schema declarations out of TypeScript and applies migrations through a
 * pillar's `open<Pillar>Db()` export; a pillar written in another language
 * has neither, and `pillars/contacts` is exactly that — Rust, with a
 * `migrations/` directory and a `Cargo.toml`. Reporting it would be a
 * standing false failure that teaches people to ignore this message, which
 * costs more than the case it would catch.
 *
 * @param {string} [pillarsRoot] Absolute path to the `pillars` directory.
 * @returns {string[]} Pillar directory names, sorted.
 */
export function discoverUnanalysablePillars(pillarsRoot = join(repoRoot, 'pillars')) {
  if (!existsSync(pillarsRoot)) return [];
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(pillarsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(pillarsRoot, entry.name);
    if (existsSync(join(dir, 'src', 'db', 'schema.ts'))) continue;
    if (!existsSync(join(dir, 'package.json'))) continue;
    const looksPersistent =
      existsSync(join(dir, 'migrations')) || existsSync(join(dir, 'src', 'db'));
    if (looksPersistent) out.push(entry.name);
  }
  return out.toSorted((a, b) => a.localeCompare(b));
}

const PILLARS = discoverPillars();
const PILLARS_WITHOUT_BARREL = discoverUnanalysablePillars();

/**
 * Pre-existing drift between the drizzle schema in `@pops/db-types` and
 * the per-pillar migration journals. Each entry is allowlisted so the
 * guard can land on a known-good baseline; close out an entry by adding
 * the missing CREATE INDEX statement to the listed pillar's migrations
 * and removing it from this map.
 *
 * Format: `<pillar>` → set of `"<table>:<index>"` strings (missing
 * indexes only).
 *
 * @type {Record<string, Set<string>>}
 */
const ALLOWLISTED_MISSING_INDEXES = {};

/**
 * Pre-existing missing tables — only as a transitional grandfather while
 * the dependent fix-PR is in flight. Adding to this set is a code smell
 * and should be rare. Each entry MUST be paired with an open PR/issue
 * link in the inline comment.
 *
 * Both entries below are schema scaffolding that the lake-migration
 * relocated into the pillar (drizzle table def + row schemas + barrel
 * re-export) but whose `CREATE TABLE` was never added to the pillar's
 * migrations journal. Neither table is referenced by any service or API
 * handler yet — they are declared surface awaiting wire-up. Close out an
 * entry by adding the `CREATE TABLE` to the listed pillar's migrations and
 * removing it here.
 *
 *   - finance:tier_overrides — relocated by #3344 (REST slice 1); the
 *     finance migrations journal does not create `tier_overrides`.
 *   - registry:environments — relocated by the registry pillar scaffold
 *     (Phase 0; the pillar was formerly named `core`); the registry
 *     migrations journal does not create `environments`.
 *
 * @type {Record<string, Set<string>>}
 */
const ALLOWLISTED_MISSING_TABLES = {
  finance: new Set(['tier_overrides']),
  registry: new Set(['environments']),
};

/**
 * Walk every file under `dir` recursively and return absolute paths
 * matching `.ts` (no `.d.ts`).
 *
 * @param {string} dir
 * @returns {string[]}
 */
function walkTsFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Locate the matching closing paren for `sqliteTable(` starting at
 * `openIdx` (which must point at the `(`). Returns the index of the
 * matching `)`. Throws if unbalanced.
 *
 * Handles single-quoted, double-quoted, template-literal, and `/* … *\/`
 * comments so quoted parens don't confuse the depth counter. Line
 * comments are also stripped.
 *
 * @param {string} src
 * @param {number} openIdx
 * @returns {number}
 */
function findMatchingParen(src, openIdx) {
  if (src[openIdx] !== '(') throw new Error(`expected '(' at ${openIdx}`);
  let depth = 0;
  let i = openIdx;
  /** @type {'' | "'" | '"' | '`' | '//' | '/*'} */
  let mode = '';
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (mode === '//') {
      if (ch === '\n') mode = '';
      i++;
      continue;
    }
    if (mode === '/*') {
      if (ch === '*' && next === '/') {
        mode = '';
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (mode === "'" || mode === '"' || mode === '`') {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === mode) mode = '';
      i++;
      continue;
    }
    if (ch === '/' && next === '/') {
      mode = '//';
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      mode = '/*';
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      mode = ch;
      i++;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  throw new Error(`unbalanced parens starting at ${openIdx}`);
}

/**
 * Split a call/object body on its top-level commas, using the same
 * string/comment state machine as `findMatchingParen` so a comma inside a
 * string, a comment, a nested call, an object or an array does not split.
 *
 * @param {string} inner
 * @returns {string[]}
 */
function splitTopLevelCommas(inner) {
  /** @type {string[]} */
  const parts = [];
  let depth = 0;
  /** @type {'' | "'" | '"' | '`' | '//' | '/*'} */
  let mode = '';
  let start = 0;
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    const next = inner[i + 1];
    if (mode === '//') {
      if (ch === '\n') mode = '';
      continue;
    }
    if (mode === '/*') {
      if (ch === '*' && next === '/') {
        mode = '';
        i += 1;
      }
      continue;
    }
    if (mode === "'" || mode === '"' || mode === '`') {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === mode) mode = '';
      continue;
    }
    if (ch === '/' && next === '/') {
      mode = '//';
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      mode = '/*';
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      mode = ch;
      continue;
    }
    if (ch === '(' || ch === '{' || ch === '[') depth += 1;
    else if (ch === ')' || ch === '}' || ch === ']') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(inner.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

/**
 * The DDL default a drizzle `.default(...)` is expected to produce, as a
 * string, or `null` when the two are not comparable.
 *
 * Only literal arguments are comparable. `sql`…`` defaults and
 * `$defaultFn`/`$default` (which drizzle applies client-side and never emits
 * into the DDL at all) are deliberately skipped rather than guessed at — a
 * guard that invents an expectation it cannot justify reports noise, and
 * noise is how a guard stops being read.
 *
 * @param {string} entry One column entry from the table's column object.
 * @returns {string | null}
 */
function expectedDefaultFrom(entry) {
  if (/\.\$default(?:Fn)?\s*\(/u.test(entry)) return null;
  const at = entry.search(/\.default\s*\(/u);
  if (at === -1) return null;
  const open = entry.indexOf('(', at);
  let close;
  try {
    close = findMatchingParen(entry, open);
  } catch {
    return null;
  }
  const arg = entry.slice(open + 1, close).trim();
  const quoted = /^'([^'\\]*)'$/u.exec(arg) ?? /^"([^"\\]*)"$/u.exec(arg);
  if (quoted && quoted[1] !== undefined) return quoted[1];
  if (/^-?\d+(?:\.\d+)?$/u.test(arg)) return arg;
  if (arg === 'true') return '1';
  if (arg === 'false') return '0';
  return null;
}

/**
 * SQLite's `dflt_value` as the same string an `expectedDefaultFrom` result
 * would be.
 *
 * `DEFAULT 'x'` comes back quoted, and `DEFAULT true` comes back as the
 * literal text `true` — SQLite stores the keyword rather than folding it to
 * 1, even though a row inserted without the column gets 1. Comparing the raw
 * strings would report every `.default(true)` in the repo as a mismatch;
 * measured against a real DB, `DEFAULT true`/`false` insert 1/0.
 *
 * @param {string | null | undefined} raw
 * @returns {string | null}
 */
function normaliseDdlDefault(raw) {
  if (raw === null || raw === undefined) return null;
  const text = raw.trim();
  if (/^'(?:[^']|'')*'$/su.test(text)) return text.slice(1, -1).replaceAll("''", "'");
  if (text === 'true') return '1';
  if (text === 'false') return '0';
  return text;
}

/**
 * Whether a parsed drizzle default and a DDL default say the same thing.
 * Numeric forms are compared numerically so `0` and `0.0` agree.
 *
 * @param {string} expected
 * @param {string} actual
 * @returns {boolean}
 */
function defaultsAgree(expected, actual) {
  if (expected === actual) return true;
  const a = Number(expected);
  const b = Number(actual);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

/**
 * Scan a single schema TS file and yield every `export const X =
 * sqliteTable('y', …)` block along with the indexes and the comparable
 * column defaults declared inside that block.
 *
 * @param {string} src
 * @param {string} file
 * @returns {Array<{ symbol: string; tableName: string; indexNames: string[]; columnDefaults: ColumnDefault[] }>}
 */
function parseTableEntriesInFile(src, file) {
  /** @type {Array<{ symbol: string; tableName: string; indexNames: string[]; columnDefaults: ColumnDefault[] }>} */
  const out = [];
  const headerRe = /export\s+const\s+(\w+)\s*=\s*sqliteTable\s*\(\s*['"]([^'"]+)['"]/g;
  for (const m of src.matchAll(headerRe)) {
    const symbol = m[1];
    const tableName = m[2];
    if (symbol === undefined || tableName === undefined) continue;
    const sqliteTableIdx = src.indexOf('sqliteTable', m.index ?? 0);
    if (sqliteTableIdx < 0) continue;
    const openParen = src.indexOf('(', sqliteTableIdx);
    if (openParen < 0) continue;
    let closeParen;
    try {
      closeParen = findMatchingParen(src, openParen);
    } catch (err) {
      throw new Error(`failed to parse table block for ${symbol} in ${file}`, { cause: err });
    }
    const block = src.slice(openParen, closeParen + 1);
    /** @type {string[]} */
    const indexNames = [];
    const indexRe = /(?:uniqueIndex|index)\(\s*['"]([^'"]+)['"]\s*\)/g;
    for (const im of block.matchAll(indexRe)) {
      const indexName = im[1];
      if (indexName !== undefined) indexNames.push(indexName);
    }
    out.push({
      symbol,
      tableName,
      indexNames,
      columnDefaults: parseColumnDefaults(block, symbol, file),
    });
  }
  return out;
}

/**
 * The comparable defaults declared in one `sqliteTable(...)` call.
 *
 * The call's second argument is the column object; each of its top-level
 * entries is `key: builder('physical_name', …)` with an optional `.default()`
 * somewhere in the chain. Entries whose default is not a literal are dropped
 * by `expectedDefaultFrom`, so this returns only what can actually be checked.
 *
 * @param {string} block The `(` … `)` of the sqliteTable call, inclusive.
 * @param {string} symbol
 * @param {string} file
 * @returns {ColumnDefault[]}
 */
function parseColumnDefaults(block, symbol, file) {
  const args = splitTopLevelCommas(block.slice(1, -1));
  const columnArg = args[1];
  if (columnArg === undefined) return [];
  const braceOpen = columnArg.indexOf('{');
  const braceClose = columnArg.lastIndexOf('}');
  if (braceOpen === -1 || braceClose <= braceOpen) {
    throw new Error(`failed to parse the column object for ${symbol} in ${file}`);
  }

  /** @type {ColumnDefault[]} */
  const out = [];
  for (const entry of splitTopLevelCommas(columnArg.slice(braceOpen + 1, braceClose))) {
    const header = /^(\w+)\s*:\s*\w+\s*\(\s*['"]([^'"]+)['"]/u.exec(entry);
    if (!header) continue;
    const columnName = header[2];
    if (columnName === undefined) continue;
    const expected = expectedDefaultFrom(entry);
    if (expected !== null) out.push({ column: columnName, expected });
  }
  return out;
}

/**
 * Build a symbol→table map for one pillar by parsing every drizzle table
 * definition the pillar owns under `src/db/schema/**\/*.ts` — including its
 * local copies of tables that other pillars also persist (e.g. `entities`,
 * `aiInferenceLog`).
 *
 * The map is built per pillar (not globally) so same-named symbols owned
 * by different pillars — e.g. `tierOverrides` in both finance and media,
 * each backed by a distinct physical table — never collide.
 *
 * The parser is regex-based (matches `export const FOO = sqliteTable(
 * 'table_name'`, then collects every `index('...')` / `uniqueIndex('...')`
 * literal inside that call). Drizzle's schema files are flat enough that
 * the regex is reliable; anything new the parser doesn't understand fails
 * the script loudly — we don't silently miss tables.
 *
 * @param {Pillar} pillar
 * @param {string} [root] Absolute path `pillar.pkgDir` is resolved against.
 * @returns {Map<string, { tableName: string; indexNames: string[]; columnDefaults: ColumnDefault[]; sourceFile: string }>}
 */
export function buildSymbolToTableMap(pillar, root = repoRoot) {
  /** @type {Map<string, { tableName: string; indexNames: string[]; columnDefaults: ColumnDefault[]; sourceFile: string }>} */
  const map = new Map();

  const schemaDir = join(root, pillar.pkgDir, 'src', 'db', 'schema');

  if (existsSync(schemaDir)) {
    for (const file of walkTsFiles(schemaDir)) {
      if (file.endsWith('-row-schemas.ts')) continue;
      const src = readFileSync(file, 'utf8');
      for (const entry of parseTableEntriesInFile(src, file)) {
        map.set(entry.symbol, {
          tableName: entry.tableName,
          indexNames: entry.indexNames,
          columnDefaults: entry.columnDefaults,
          sourceFile: file,
        });
      }
    }
  }

  return map;
}

/**
 * Why this pillar cannot be checked, or `null` when it can.
 *
 * This branch used to `return true` — the guard's success value — before the
 * database was ever opened, so a pillar the analyser could not read scored as
 * fully covered. Every route into it is silent: `src/db/schema/` renamed
 * (no symbols), `src/db/services/` renamed (no references), or the barrel
 * switched to a re-export form the parser does not model. Those are precisely
 * the conditions this guard exists to survive, and the CI `--inject-fake-table`
 * self-test cannot see the difference because it injects further down.
 *
 * Discovery already requires a `src/db/schema.ts` barrel, so every pillar
 * reaching here claims to own a migrated schema surface. Zero of anything is
 * therefore a broken analyser, not an empty pillar, and the two causes are
 * reported separately because they are fixed in different places.
 *
 * @param {{ pillar: string; symbolCount: number; usedCount: number }} counts
 * @returns {string | null}
 */
export function analysabilityFailure({ pillar, symbolCount, usedCount }) {
  if (symbolCount === 0) {
    return (
      `[${pillar}] FAIL — could not analyse this pillar: no \`sqliteTable(...)\` declaration ` +
      `was found under src/db/schema/. The pillar exposes a src/db/schema.ts barrel, so it ` +
      `claims a migrated schema surface; a schema directory that has been renamed or a table ` +
      `declaration form the parser does not model would both look like this.`
    );
  }
  if (usedCount === 0) {
    return (
      `[${pillar}] FAIL — could not analyse this pillar: ${symbolCount} table symbol(s) were ` +
      `found under src/db/schema/, but nothing in src/db/services/ or the src/db/schema.ts ` +
      `barrel references any of them. A renamed services directory or an import form the ` +
      `parser does not model would both look like this.`
    );
  }
  return null;
}

/**
 * Parse a single TS file's imports and return the list of `from`-clauses
 * paired with their imported specifiers. Handles:
 *   - `import { a, b as c } from '...'`
 *   - `import { type T } from '...'`
 *   - `import * as ns from '...'`
 *   - multi-line `import { ... } from '...'`
 *
 * Skips type-only specifiers (`type T` inside the destructure) because
 * we only care about runtime tables. A pure `import type` line is also
 * skipped (it never produces runtime references).
 *
 * @param {string} src
 * @returns {Array<{ from: string; symbols: string[]; isNamespace: boolean }>}
 */
function parseImports(src) {
  /** @type {Array<{ from: string; symbols: string[]; isNamespace: boolean }>} */
  const out = [];

  const importRe = /import\s+(type\s+)?(\{[\s\S]*?\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
  for (const m of src.matchAll(importRe)) {
    const isTypeOnly = Boolean(m[1]);
    const clause = m[2];
    const from = m[3];

    if (isTypeOnly) continue;
    if (clause === undefined || from === undefined) continue;

    if (clause.startsWith('*')) {
      out.push({ from, symbols: [], isNamespace: true });
      continue;
    }

    if (!clause.startsWith('{')) {
      out.push({ from, symbols: [clause.trim()], isNamespace: false });
      continue;
    }

    const inner = clause.slice(1, -1);
    /** @type {string[]} */
    const symbols = [];
    for (const raw of inner.split(',')) {
      const piece = raw.trim();
      if (!piece) continue;
      if (piece.startsWith('type ')) continue;
      const nameCandidate = piece.split(/\s+as\s+/u)[0];
      if (nameCandidate === undefined) continue;
      const name = nameCandidate.trim();
      if (name) symbols.push(name);
    }
    out.push({ from, symbols, isNamespace: false });
  }
  return out;
}

/**
 * Inspect a `<pillar>/src/db/schema.ts` barrel and return the set of
 * symbol names it re-exports from its local table modules
 * (`export { x } from './schema/x.js'`). These are the tables the pillar
 * legitimately surfaces — used as the fallback for `import * as schema`
 * style imports.
 *
 * @param {string} schemaFile
 * @returns {Set<string>}
 */
function parsePillarSchemaReExports(schemaFile) {
  const src = readFileSync(schemaFile, 'utf8');
  /** @type {Set<string>} */
  const out = new Set();
  const reExportRe = /export\s*\{([\s\S]*?)\}\s*from\s*['"][^'"]+['"]/g;
  for (const m of src.matchAll(reExportRe)) {
    const group = m[1];
    if (group === undefined) continue;
    for (const raw of group.split(',')) {
      const piece = raw.trim();
      if (!piece) continue;
      if (piece.startsWith('type ')) continue;
      const nameCandidate = piece.split(/\s+as\s+/u)[0];
      if (nameCandidate === undefined) continue;
      const name = nameCandidate.trim();
      if (name) out.add(name);
    }
  }
  return out;
}

/**
 * True if a relative import specifier targets the pillar's schema barrel
 * (`.../schema` or `.../schema.js`) or a specific schema module
 * (`.../schema/<name>` / `.../schema/<name>.js`). Depth-agnostic: matches
 * `../schema.js`, `../../schema.js`, `../schema/foo.js`, etc. — services
 * live at varying nesting depths under `src/db/services/**`.
 *
 * @param {string} from
 * @returns {boolean}
 */
function isPillarSchemaImport(from) {
  if (!from.startsWith('.')) return false;
  const noExt = from.replace(/\.(?:js|ts)$/u, '');
  return noExt.endsWith('/schema') || /\/schema\/[^/]+$/u.test(noExt);
}

/**
 * Compute the set of table-symbol references a pillar makes.
 *
 * Walks every `src/db/services/**\/*.ts` (recursive) plus the pillar's
 * `src/db/schema.ts` re-exports, and returns symbol names that the
 * symbol→table map knows about. Symbols not in the map are dropped — they
 * are not tables (e.g. constants, types, helpers).
 *
 * @param {string} pkgRoot Absolute path to e.g. `pillars/finance`.
 * @param {Map<string, { tableName: string }>} symbolToTable
 * @returns {Set<string>}
 */
export function collectUsedTableSymbols(pkgRoot, symbolToTable) {
  const servicesDir = join(pkgRoot, 'src', 'db', 'services');
  const schemaFile = join(pkgRoot, 'src', 'db', 'schema.ts');

  const pillarReExports = existsSync(schemaFile)
    ? parsePillarSchemaReExports(schemaFile)
    : new Set();

  /** @type {Set<string>} */
  const used = new Set();
  for (const sym of pillarReExports) {
    if (symbolToTable.has(sym)) used.add(sym);
  }

  if (!existsSync(servicesDir)) return used;

  for (const file of walkTsFiles(servicesDir)) {
    const src = readFileSync(file, 'utf8');
    for (const imp of parseImports(src)) {
      if (!isPillarSchemaImport(imp.from)) continue;

      if (imp.isNamespace) {
        for (const sym of pillarReExports) {
          if (symbolToTable.has(sym)) used.add(sym);
        }
        continue;
      }
      for (const sym of imp.symbols) {
        if (symbolToTable.has(sym)) used.add(sym);
      }
    }
  }
  return used;
}

/**
 * Run the migrations for a pillar against a fresh temp-file DB by invoking
 * the pillar's exported open function.
 *
 * The opener lives in the built `dist/db/index.js` and is named
 * `open<Pillar>Db`. Rather than hard-code the PascalCase name, it's
 * discovered: the sole export matching `/^open[A-Z]\w*Db$/`. This keeps
 * the script free of any per-pillar name table.
 *
 * Returns the better-sqlite3 raw handle so the caller can query
 * `sqlite_master`. The caller is responsible for `close()` which also
 * unlinks the temp file (including the WAL/SHM sidecars).
 *
 * @param {Pillar} pillar
 * @returns {Promise<{ raw: SqliteHandle; close: () => void }>}
 */
async function openPillarInMemory(pillar) {
  const distEntry = join(repoRoot, pillar.pkgDir, 'dist', 'db', 'index.js');
  if (!existsSync(distEntry)) {
    throw new Error(
      `[${pillar.name}] dist/db/index.js not found at ${distEntry}. ` +
        `Run \`pnpm --filter @pops/${pillar.name}... build\` first.`
    );
  }
  const mod = await import(distEntry);
  const openerNames = Object.keys(mod).filter((k) => /^open[A-Z]\w*Db$/u.test(k));
  const openerName = openerNames[0];
  if (openerNames.length !== 1 || openerName === undefined) {
    throw new Error(
      `[${pillar.name}] expected exactly one open<Pillar>Db export in ${distEntry}, ` +
        `found: ${openerNames.length === 0 ? '(none)' : openerNames.join(', ')}`
    );
  }
  /** @type {(path: string) => { raw: SqliteHandle }} */
  const opener = mod[openerName];
  if (typeof opener !== 'function') {
    throw new Error(`[${pillar.name}] expected export ${openerNames[0]} to be a function`);
  }

  const tmpDbPath = join(
    tmpdir(),
    `pillar-schema-coverage-${pillar.name}-${process.pid}-${Date.now()}.db`
  );
  const opened = opener(tmpDbPath);
  return {
    raw: opened.raw,
    close: () => {
      try {
        opened.raw.close();
      } catch {
        // ignore — the file gets unlinked regardless
      }
      for (const suffix of ['', '-wal', '-shm']) {
        try {
          rmSync(`${tmpDbPath}${suffix}`, { force: true });
        } catch {
          // ignore
        }
      }
    },
  };
}

/**
 * Cross-check applied schema against expected table+index set.
 *
 * A column default is compared only when the drizzle schema declares a
 * literal one. The DDL is the side that can silently disagree: SQLite cannot
 * `ALTER COLUMN`, so a default corrected in the schema after the baseline was
 * written stays wrong in the migration unless someone rebuilds the table, and
 * nothing noticed because drizzle applies a static `.default(value)`
 * client-side rather than emitting `DEFAULT` and letting SQLite decide. That
 * makes the DDL default dead configuration for as long as drizzle is the only
 * writer — and a lie to the next reader, and a wrong value the moment a raw
 * `INSERT` from a script, a repair query or an import path writes the row
 * (POPS-3033, POPS-3020).
 *
 * @param {SqliteHandle} raw
 * @param {Set<string>} usedSymbols
 * @param {Map<string, { tableName: string; indexNames: string[]; columnDefaults: ColumnDefault[] }>} symbolToTable
 * @returns {{ missingTables: string[]; missingIndexes: Array<{ table: string; index: string }>; defaultMismatches: Array<{ table: string; column: string; expected: string; actual: string | null }> }}
 */
function diff(raw, usedSymbols, symbolToTable) {
  const tableExistsStmt = raw.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
  );
  const indexExistsStmt = raw.prepare(
    "SELECT name FROM sqlite_master WHERE type='index' AND name = ?"
  );

  /** @type {string[]} */
  const missingTables = [];
  /** @type {Array<{ table: string; index: string }>} */
  const missingIndexes = [];
  /** @type {Array<{ table: string; column: string; expected: string; actual: string | null }>} */
  const defaultMismatches = [];

  for (const sym of [...usedSymbols].toSorted()) {
    const entry = symbolToTable.get(sym);
    if (!entry) continue;
    const tableRow = tableExistsStmt.get(entry.tableName);
    if (!tableRow) {
      missingTables.push(entry.tableName);
      continue;
    }
    for (const idx of entry.indexNames) {
      const idxRow = indexExistsStmt.get(idx);
      if (!idxRow) missingIndexes.push({ table: entry.tableName, index: idx });
    }
    if (entry.columnDefaults.length > 0) {
      const ddlDefaults = ddlDefaultsFor(raw, entry.tableName);
      for (const { column, expected } of entry.columnDefaults) {
        const actual = ddlDefaults.get(column) ?? null;
        if (actual === null || !defaultsAgree(expected, actual)) {
          defaultMismatches.push({ table: entry.tableName, column, expected, actual });
        }
      }
    }
  }
  return { missingTables, missingIndexes, defaultMismatches };
}

/**
 * Whether a `PRAGMA table_info` row has the shape this script reads.
 * Always true against a real SQLite result — guards the type only.
 *
 * @param {unknown} row
 * @returns {row is { name: string; dflt_value: string | null }}
 */
function isTableInfoRow(row) {
  return (
    typeof row === 'object' &&
    row !== null &&
    'name' in row &&
    typeof row.name === 'string' &&
    'dflt_value' in row &&
    (row.dflt_value === null || typeof row.dflt_value === 'string')
  );
}

/**
 * Physical column name → normalised `DEFAULT` clause, for one applied table.
 * A column with no `DEFAULT` is absent from the map, which the caller reads as
 * "the schema declares one and the DDL does not".
 *
 * @param {SqliteHandle} raw
 * @param {string} table
 * @returns {Map<string, string>}
 */
function ddlDefaultsFor(raw, table) {
  const rows = raw.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all();
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const row of rows) {
    if (!isTableInfoRow(row)) continue;
    const normalised = normaliseDdlDefault(row.dflt_value);
    if (normalised !== null) out.set(row.name, normalised);
  }
  return out;
}

/**
 * Run the coverage check for one pillar. Returns true on full coverage,
 * false otherwise. Logs a human-readable report either way.
 *
 * The symbol→table map is built per pillar (from its own `src/db/schema/**`,
 * including its local copies of multi-pillar tables) so same-named symbols
 * owned by distinct pillars never collide.
 *
 * @param {Pillar} pillar
 * @param {{ ignoreAllowlist?: boolean; injectFakeTables?: string[]; injectFakeDefault?: boolean }} [options]
 * @returns {Promise<boolean>}
 */
async function checkPillar(pillar, options = {}) {
  const ignoreAllowlist = options.ignoreAllowlist === true;
  const injectFakeTables = options.injectFakeTables ?? [];
  const injectFakeDefault = options.injectFakeDefault === true;
  const pkgRoot = join(repoRoot, pillar.pkgDir);
  if (!existsSync(pkgRoot)) {
    console.error(`[${pillar.name}] pillar not found at ${pkgRoot}`);
    return false;
  }
  const symbolToTable = buildSymbolToTableMap(pillar);
  console.log(`[${pillar.name}] loaded ${symbolToTable.size} table symbol(s).`);
  const used = collectUsedTableSymbols(pkgRoot, symbolToTable);

  for (const fakeTable of injectFakeTables) {
    const fakeSymbol = `__injected_${fakeTable}`;
    symbolToTable.set(fakeSymbol, {
      tableName: fakeTable,
      indexNames: [],
      columnDefaults: [],
      sourceFile: '<injected>',
    });
    used.add(fakeSymbol);
    console.log(`[${pillar.name}] injected fake expected table: ${fakeTable}`);
  }

  if (injectFakeDefault) {
    const target = [...used]
      .toSorted()
      .map((sym) => symbolToTable.get(sym))
      .find((entry) => entry !== undefined && entry.columnDefaults.length > 0);
    if (target === undefined) {
      console.error(
        `[${pillar.name}] cannot inject a fake default: no checked table declares a literal ` +
          'column default. Pick a pillar that does.'
      );
      return false;
    }
    const firstDefault = target.columnDefaults[0];
    if (firstDefault === undefined) {
      console.error(
        `[${pillar.name}] cannot inject a fake default: matched table has no column defaults.`
      );
      return false;
    }
    const column = firstDefault.column;
    target.columnDefaults = [
      ...target.columnDefaults,
      { column, expected: FAKE_SELF_TEST_DEFAULT },
    ];
    console.log(
      `[${pillar.name}] injected fake expected default on ${target.tableName}.${column}: ` +
        FAKE_SELF_TEST_DEFAULT
    );
  }

  // Reported because "OK" over zero comparisons reads identically to "OK"
  // over forty, and a parser that silently stops recognising `.default(...)`
  // is exactly how this check would rot without anyone noticing.
  const comparedDefaults = [...used].reduce(
    (total, sym) => total + (symbolToTable.get(sym)?.columnDefaults.length ?? 0),
    0
  );
  console.log(
    `[${pillar.name}] inspecting ${used.size} table symbol(s), ` +
      `comparing ${comparedDefaults} column default(s)`
  );
  const unanalysable = analysabilityFailure({
    pillar: pillar.name,
    symbolCount: symbolToTable.size,
    usedCount: used.size,
  });
  if (unanalysable !== null) {
    console.error(unanalysable);
    return false;
  }

  const handle = await openPillarInMemory(pillar);
  try {
    const raw = diff(handle.raw, used, symbolToTable);
    const indexAllowlist = ignoreAllowlist
      ? new Set()
      : (ALLOWLISTED_MISSING_INDEXES[pillar.name] ?? new Set());
    const tableAllowlist = ignoreAllowlist
      ? new Set()
      : (ALLOWLISTED_MISSING_TABLES[pillar.name] ?? new Set());
    const allowedIndexes = raw.missingIndexes.filter((m) =>
      indexAllowlist.has(`${m.table}:${m.index}`)
    );
    const allowedTables = raw.missingTables.filter((t) => tableAllowlist.has(t));
    const missingTables = raw.missingTables.filter((t) => !tableAllowlist.has(t));
    const missingIndexes = raw.missingIndexes.filter(
      (m) => !indexAllowlist.has(`${m.table}:${m.index}`)
    );
    if (allowedTables.length > 0) {
      console.warn(
        `[${pillar.name}] WARN — ${allowedTables.length} allowlisted missing table(s) ` +
          `(known latent break; tracked in script header):`
      );
      for (const t of allowedTables) console.warn(`    - ${t}`);
    }
    if (allowedIndexes.length > 0) {
      console.warn(
        `[${pillar.name}] WARN — ${allowedIndexes.length} allowlisted missing index(es) ` +
          `(pre-existing drift; close out by adding to ${pillar.pkgDir}/migrations/):`
      );
      for (const m of allowedIndexes) console.warn(`    - ${m.index} on ${m.table}`);
    }
    const { defaultMismatches } = raw;
    if (
      missingTables.length === 0 &&
      missingIndexes.length === 0 &&
      defaultMismatches.length === 0
    ) {
      const allowedCount = allowedTables.length + allowedIndexes.length;
      const suffix =
        allowedCount > 0
          ? ` (with ${allowedCount} allowlisted entr${allowedCount === 1 ? 'y' : 'ies'})`
          : '';
      console.log(`[${pillar.name}] OK${suffix}.`);
      const allowedTablesSet = new Set(allowedTables);
      for (const sym of [...used].toSorted()) {
        const entry = symbolToTable.get(sym);
        if (!entry) continue;
        const wasAllowed = allowedTablesSet.has(entry.tableName);
        console.log(`  ${wasAllowed ? '~' : 'OK'} ${entry.tableName}`);
      }
      return true;
    }
    console.error(`[${pillar.name}] FAIL — schema coverage broken.`);
    if (missingTables.length > 0) {
      console.error(`  Missing tables (${missingTables.length}):`);
      for (const t of missingTables) console.error(`    - ${t}`);
    }
    if (missingIndexes.length > 0) {
      console.error(`  Missing indexes (${missingIndexes.length}):`);
      for (const m of missingIndexes) console.error(`    - ${m.index} on ${m.table}`);
    }
    if (defaultMismatches.length > 0) {
      console.error(`  Column default mismatches (${defaultMismatches.length}):`);
      for (const m of defaultMismatches) {
        const actual = m.actual === null ? '(no DEFAULT clause)' : JSON.stringify(m.actual);
        console.error(
          `    - ${m.table}.${m.column}: schema declares ${JSON.stringify(m.expected)}, DDL has ${actual}`
        );
      }
      console.error(
        '  SQLite cannot ALTER COLUMN, so correcting one means rebuilding the table in a new ' +
          'migration — or dropping the schema-side default if the DDL is the one that is right.'
      );
    }
    if (missingTables.length > 0 || missingIndexes.length > 0) {
      console.error(
        `  Fix: extend ${pillar.pkgDir}/migrations/ with the missing CREATE TABLE / CREATE INDEX statements.`
      );
    }
    return false;
  } finally {
    handle.close();
  }
}

/**
 * @param {string[]} argv
 * @returns {{ pillars: typeof PILLARS[number][]; help: boolean; listPillars: boolean; ignoreAllowlist: boolean; injections: Map<string, string[]>; injectFakeDefault: boolean }}
 */
function parseArgs(argv) {
  let pillar = '';
  let all = false;
  let help = false;
  let listPillars = false;
  let ignoreAllowlist = false;
  let injectFakeDefault = false;
  /**
   * Synthetic injections used by the self-test job. The CI workflow asks
   * the script to expect a table that the pillar's migrations do NOT
   * create — proving the guard still catches missing tables without
   * relying on a real prod-state mismatch. Format: `<pillar>:<table>`.
   *
   * @type {Map<string, string[]>}
   */
  const injections = new Map();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--pillar') pillar = argv[++i] ?? '';
    else if (arg === '--all') all = true;
    else if (arg === '--help' || arg === '-h') help = true;
    else if (arg === '--list-pillars') listPillars = true;
    else if (arg === '--ignore-allowlist') ignoreAllowlist = true;
    else if (arg === '--inject-fake-default') injectFakeDefault = true;
    else if (arg === '--inject-fake-table') {
      const spec = argv[++i] ?? '';
      const [injPillar, injTable] = spec.split(':');
      if (!injPillar || !injTable) {
        console.error(`--inject-fake-table requires <pillar>:<table>, got: ${spec}`);
        help = true;
        continue;
      }
      const list = injections.get(injPillar) ?? [];
      list.push(injTable);
      injections.set(injPillar, list);
    } else {
      console.error(`unknown arg: ${arg}`);
      help = true;
    }
  }
  const rest = { listPillars, ignoreAllowlist, injections, injectFakeDefault };
  if (help) return { pillars: [], help: true, ...rest };
  if (all) return { pillars: [...PILLARS], help: false, ...rest };
  if (!pillar) return { pillars: [...PILLARS], help: false, ...rest };
  const match = PILLARS.find((p) => p.name === pillar);
  if (!match) {
    console.error(`unknown pillar: ${pillar}. Known: ${PILLARS.map((p) => p.name).join(', ')}`);
    return { pillars: [], help: true, ...rest };
  }
  return { pillars: [match], help: false, ...rest };
}

function usage() {
  console.log(
    [
      'Usage: node scripts/check-pillar-schema-coverage.mjs [--pillar <name>] [--all] [--list-pillars] [--ignore-allowlist] [--inject-fake-table <pillar>:<table>] [--inject-fake-default]',
      '',
      'Pillars: ' + PILLARS.map((p) => p.name).join(', '),
      '',
      'With no args, every pillar is checked.',
      '',
      '--list-pillars prints the discovered pillar names as a JSON array on',
      'stdout and exits. The workflow builds its job matrix from this, so the',
      'matrix cannot disagree with the guard about which pillars exist.',
      '',
      '--ignore-allowlist disables the in-script grandfather list so the',
      'true diff (including known pre-existing drift) is reported. Use to',
      'verify a follow-up fix actually closes out an allowlisted entry.',
      '',
      '--inject-fake-table <pillar>:<table> tells the script to expect',
      'a table that does NOT exist in the pillar migrations. Used by the',
      'CI self-test to prove the guard still flags missing tables without',
      'depending on a real prod-state mismatch. Repeatable.',
      '',
      '--inject-fake-default plants an unsatisfiable expected DEFAULT on a',
      'column that already carries a real one, so the self-test proves the',
      'column-default check reports a disagreement rather than merely',
      'passing.',
    ].join('\n')
  );
}

/**
 * Report the pillars that carry a persistence surface this guard cannot
 * discover, and say what it costs. Called before anything else so the
 * `--list-pillars` matrix and a full run fail at the same point and for the
 * same reason.
 *
 * @returns {boolean} True when nothing fell out of discovery.
 */
function reportUnanalysablePillars() {
  if (PILLARS_WITHOUT_BARREL.length === 0) return true;
  console.error(
    `FAIL — ${PILLARS_WITHOUT_BARREL.length} pillar(s) carry a migrations/ or src/db/ ` +
      'directory but expose no src/db/schema.ts barrel, so this guard cannot see them ' +
      'and neither can the job matrix derived from the same discovery:'
  );
  for (const name of PILLARS_WITHOUT_BARREL) console.error(`  - pillars/${name}`);
  console.error(
    '\nEither restore the barrel at src/db/schema.ts, or — if the pillar genuinely ' +
      'persists nothing — remove the migrations/ and src/db/ directories that say it does. ' +
      'Silently dropping out of the guard is the one outcome that is not available (ADR-045).'
  );
  return false;
}

async function main() {
  const { pillars, help, listPillars, ignoreAllowlist, injections, injectFakeDefault } = parseArgs(
    process.argv.slice(2)
  );
  // Ahead of the usage branch on purpose. A barrel renamed out from under
  // the guard makes its pillar undiscoverable, so `--pillar <that one>` is
  // answered with "unknown pillar" and a usage dump — the least informative
  // reading of the situation available. Running the report before `usage()`
  // puts the actual diagnosis between the two, rather than never.
  const analysable = reportUnanalysablePillars();
  if (help) {
    usage();
    process.exit(2);
  }
  // The workflow builds its job matrix from this, so it has to be the same
  // discovery the run itself uses rather than a `find` that agrees with it
  // only by inspection. Written to stdout alone; every diagnostic goes to
  // stderr so the JSON stays machine-readable.
  if (listPillars) {
    console.log(JSON.stringify(PILLARS.map((p) => p.name)));
    process.exit(analysable ? 0 : 1);
  }
  if (!analysable) process.exit(1);
  if (pillars.length === 0) {
    console.error(
      'No pillars discovered under pillars/* with a src/db/schema.ts barrel. ' + 'Nothing to check.'
    );
    process.exit(1);
  }
  if (ignoreAllowlist) console.log('--ignore-allowlist set: every miss is treated as a failure.');

  let allOk = true;
  for (const pillar of pillars) {
    const ok = await checkPillar(pillar, {
      ignoreAllowlist,
      injectFakeTables: injections.get(pillar.name) ?? [],
      injectFakeDefault,
    });
    if (!ok) allOk = false;
  }
  process.exit(allOk ? 0 : 1);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
