#!/usr/bin/env node
/**
 * Real-subprocess tests must say out loud how long they are allowed to take.
 *
 * A test that spawns `mise`, `pnpm`, `tsx` or a pillar's own entry point is
 * bounded by vitest's **5000ms default** unless someone remembers `it`'s third
 * argument. Nothing checked that anyone remembered, and the consequence was
 * always the same: a correct test that passes on an idle machine and goes red
 * on a loaded one for reasons unrelated to what it asserts — inside the
 * pre-push hook, where a bad draw blocks every push.
 *
 * The same shape has been found by hand four times (POPS-1550, POPS-2007,
 * POPS-2053 twice), each time after the failure. This is the fifth sighting
 * written down as a check instead of a ticket.
 *
 * ## The trap that makes grepping for a timeout useless
 *
 * POPS-2007's `merge-group-scope.test.ts` passed `120_000` to `execFileSync`
 * and nothing to `it(...)`. The subprocess measured 6.2s and the test died at
 * 5s. **An `execFileSync` timeout looks like the bound and is not**: the two
 * numbers live in different places and the smaller one wins, silently. So this
 * guard reads the `it(...)` argument specifically and ignores every timeout
 * option passed to the spawn itself.
 *
 * ## Which tests are in scope
 *
 * An `it`/`test` must be bounded when it can reach a spawn: directly in its own
 * body, through a helper that spawns (transitively), or through a lifecycle
 * hook of a `describe` it sits inside.
 *
 * Deciding which `it` a helper's spawn belongs to is the part the ticket calls
 * hard — `run-all-clients-discovery.test.ts` calls `runAllEcho` from four
 * separate `it`s and the spawn is in none of them. The cheap answer is to bind
 * every test in a file that spawns anywhere, and it was tried: it puts 40
 * `parseToolsTable` unit tests in scope of a `git check-ignore` helper they
 * never call. A timeout added there means nothing, and a guard whose output is
 * mostly meaningless is a guard people learn to satisfy rather than read. So
 * the reachability is followed by name instead, to a fixed point — see
 * `spawningHelpers`.
 *
 * Scopes are not modelled, so a shadowed name can widen the set. That
 * direction is safe: it asks for a timeout that was not needed, and never lets
 * an unbounded spawn through.
 *
 * A spawn evaluated at module level and never called from a test is not in
 * scope at all. It runs during collection, where `testTimeout` does not apply.
 *
 * ## What counts as bounded
 *
 * Either the test's own third argument (`it(name, fn, 30_000)` or
 * `it(name, { timeout: 30_000 }, fn)`), or an enclosing
 * `describe(name, { timeout }, fn)` — which is how `release.test.ts` already
 * bounds a whole block, and is usually the cheaper remedy.
 *
 * ## How it reads the source
 *
 * By scanning, not by parsing. Comments, strings, template literals and regex
 * literals are blanked to spaces first so offsets stay put, then `describe`/
 * `it`/`test` call sites and their argument spans are found by paren depth.
 * A hand-rolled scanner is the wrong tool for a general question about
 * JavaScript and the right one for this narrow one — and the alternative,
 * building a TypeScript Program, is a dependency this check does not need.
 *
 * The one thing that scanner cannot do is tell a regex literal from division
 * with certainty; it uses the standard preceding-token heuristic. A
 * misclassification can only blank or fail to blank a span, and the self-test
 * covers both directions.
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** Directories that hold no first-party source. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'target']);

/** The roots a test file can live under. */
const SCANNED_ROOTS = ['scripts', 'libs', 'pillars', 'clients'];

const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;

/**
 * Blank every comment, string, template literal and regex literal to spaces,
 * preserving length so every offset computed afterwards still points at the
 * same character of the original.
 *
 * A template literal is a mode, not a delimited run, because `${...}` holds
 * real code that may itself contain another template. Treating the text after
 * a hole as code is what an earlier draft did, and one apostrophe in
 * `` `${file}'s scope job` `` opened a string that swallowed the rest of the
 * file — the guard then reported nothing, which is the failure ADR-045 exists
 * to make impossible to ship.
 */
export function blankNoise(/** @type {string} */ source) {
  const out = source.split('');
  const blank = (/** @type {number} */ from, /** @type {number} */ to) => {
    for (let i = from; i < to && i < out.length; i += 1) if (out[i] !== '\n') out[i] = ' ';
  };
  // A `/` opens a regex only where a value cannot already have ended. Anything
  // else — an identifier, a literal, a closing paren or bracket — means the
  // slash is division.
  const REGEX_MAY_FOLLOW =
    /(?:[([{,;:!&|?+\-*/%~^=<>]|(?:^|[^\w$])(?:return|typeof|case|in|of|new|delete|void|instanceof|do|else|yield|await))$/u;

  /** @type {number[]} */
  const holes = [];
  let braces = 0;
  let inTemplate = false;
  let textStart = -1;
  let i = 0;

  while (i < source.length) {
    if (inTemplate) {
      const c = source[i];
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === '`') {
        blank(textStart, i);
        inTemplate = false;
        i += 1;
        continue;
      }
      if (c === '$' && source[i + 1] === '{') {
        blank(textStart, i);
        holes.push(braces);
        braces += 1;
        inTemplate = false;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }

    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < source.length && source[j] !== c && source[j] !== '\n') {
        j += source[j] === '\\' ? 2 : 1;
      }
      blank(i + 1, j);
      i = j + 1;
      continue;
    }
    if (c === '`') {
      inTemplate = true;
      textStart = i + 1;
      i += 1;
      continue;
    }
    if (c === '{') {
      braces += 1;
      i += 1;
      continue;
    }
    if (c === '}') {
      braces -= 1;
      if (holes.length > 0 && braces === holes[holes.length - 1]) {
        holes.pop();
        inTemplate = true;
        textStart = i + 1;
      }
      i += 1;
      continue;
    }
    if (c === '/') {
      const before = source.slice(Math.max(0, i - 12), i).replace(/\s+$/u, '');
      if (before === '' || REGEX_MAY_FOLLOW.test(before)) {
        let j = i + 1;
        let inClass = false;
        while (j < source.length && source[j] !== '\n') {
          if (source[j] === '\\') {
            j += 2;
            continue;
          }
          if (source[j] === '[') inClass = true;
          else if (source[j] === ']') inClass = false;
          else if (source[j] === '/' && !inClass) break;
          j += 1;
        }
        if (j < source.length && source[j] === '/') {
          blank(i + 1, j);
          i = j + 1;
          continue;
        }
      }
    }
    i += 1;
  }
  if (inTemplate) blank(textStart, source.length);
  return out.join('');
}

/**
 * The local names bound to `node:child_process` spawners in this file.
 *
 * Read off the import rather than matched by name, so a local variable called
 * `spawn` that runs nothing is not mistaken for one — and so a renaming import
 * (`execFileSync as run`) is still followed.
 */
export function spawnBindings(/** @type {string} */ source) {
  /** @type {Set<string>} */
  const names = new Set();
  const SPAWNERS = new Set([
    'exec',
    'execFile',
    'execFileSync',
    'execSync',
    'fork',
    'spawn',
    'spawnSync',
  ]);
  const from = /['"](?:node:)?child_process['"]\s*\)?\s*$/u;
  for (const line of importStatements(source)) {
    if (!from.test(line)) continue;
    const namespace = /(?:\*\s*as|const)\s+([A-Za-z_$][\w$]*)\s*(?:from|=)/u.exec(line);
    const braced = /\{([^}]*)\}/u.exec(line);
    if (braced !== null) {
      for (const entry of (braced[1] ?? '').split(',')) {
        const parts = entry.trim().split(/\s+as\s+/u);
        const imported = parts[0]?.trim() ?? '';
        const local = (parts[1] ?? parts[0] ?? '').trim();
        if (imported !== '' && SPAWNERS.has(imported) && local !== '') names.add(local);
      }
      continue;
    }
    if (namespace !== null && namespace[1] !== undefined) {
      for (const spawner of SPAWNERS) names.add(`${namespace[1]}.${spawner}`);
    }
  }
  return names;
}

/** Every `import`/`require` statement in the file, one per entry. */
function importStatements(/** @type {string} */ source) {
  /** @type {string[]} */
  const statements = [];
  for (const match of source.matchAll(
    /(?:^|\n)\s*(?:import[\s\S]*?from\s*['"][^'"]+['"]|(?:const|let|var)\s[\s\S]*?require\s*\(\s*['"][^'"]+['"]\s*\))/gu
  )) {
    statements.push(match[0]);
  }
  return statements;
}

/** The offset just past the matching `)` for the `(` at `open`. */
function closingParen(/** @type {string} */ source, /** @type {number} */ open) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return source.length;
}

/** Split a call's argument text into top-level arguments. */
function topLevelArgs(/** @type {string} */ argText) {
  /** @type {string[]} */
  const args = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < argText.length; i += 1) {
    const c = argText[i] ?? '';
    if ('([{'.includes(c)) depth += 1;
    else if (')]}'.includes(c)) depth -= 1;
    else if (c === ',' && depth === 0) {
      args.push(argText.slice(start, i));
      start = i + 1;
    }
  }
  const last = argText.slice(start);
  if (last.trim() !== '' || args.length > 0) args.push(last);
  return args;
}

/**
 * @typedef {object} CallSite
 * @property {'describe' | 'it'} kind
 * @property {string} name
 * @property {number} start Offset of the callee identifier.
 * @property {number} argsStart Offset just inside the opening paren.
 * @property {number} end Offset of the matching closing paren.
 * @property {string[]} args The call's top-level arguments, as source text.
 */

const CALL_SITE =
  /(?<![.\w$])(describe|it|test)((?:\.(?:each|for|concurrent|sequential|skip|only|todo|fails|runIf|skipIf|extend))*)\s*(\()/gu;

/**
 * Every `describe`/`it`/`test` call in the file, with the span it encloses.
 *
 * `it.each(rows)(name, fn, timeout)` is two calls: the modifier chain is
 * matched first and its argument list stepped over, so the span recorded is
 * the one that actually holds the callback.
 */
export function callSites(/** @type {string} */ clean) {
  /** @type {CallSite[]} */
  const sites = [];
  for (const match of clean.matchAll(CALL_SITE)) {
    const kind = match[1] === 'describe' ? 'describe' : 'it';
    let open = (match.index ?? 0) + match[0].length - 1;
    const chain = match[2] ?? '';
    if (/\.(?:each|for|extend|runIf|skipIf)$/u.test(chain)) {
      const afterTable = closingParen(clean, open) + 1;
      const nextOpen = clean.indexOf('(', afterTable);
      if (nextOpen === -1 || clean.slice(afterTable, nextOpen).trim() !== '') continue;
      open = nextOpen;
    }
    const close = closingParen(clean, open);
    sites.push({
      kind: /** @type {'describe' | 'it'} */ (kind),
      name: match[1] + chain,
      start: match.index ?? 0,
      argsStart: open + 1,
      end: close,
      args: topLevelArgs(clean.slice(open + 1, close)),
    });
  }
  return sites;
}

const TIMEOUT_OPTION = /(?<![.\w$])timeout\s*:/u;

/**
 * Whether a call's own arguments state a timeout.
 *
 * Only an argument that is itself an object literal is read for a `timeout:`
 * key. The callback is an argument too, and its body routinely contains
 * `timeout:` — passed to the spawn, which is precisely the number that is not
 * the bound (POPS-2007). Reading it would make the guard bless exactly the
 * shape it exists to catch.
 */
function statesOwnTimeout(/** @type {CallSite} */ site) {
  const options = site.args.filter((arg) => arg.trim().startsWith('{'));
  if (options.some((arg) => TIMEOUT_OPTION.test(arg))) return true;
  return site.kind === 'it' && site.args.length >= 3 && site.args[2]?.trim() !== '';
}

/** The 1-based line the offset falls on. */
function lineOf(/** @type {string} */ source, /** @type {number} */ offset) {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i += 1) if (source[i] === '\n') line += 1;
  return line;
}

/**
 * The tests in one file that spawn a real subprocess and do not say how long
 * they may take.
 *
 * @param source The file's text.
 * @returns One entry per unbounded test, with the line it starts on.
 */
export function unboundedSpawningTests(/** @type {string} */ source) {
  const bindings = spawnBindings(source);
  if (bindings.size === 0) return [];
  const clean = blankNoise(source);

  /** @type {number[]} */
  const spawnOffsets = [];
  for (const name of bindings) {
    const pattern = new RegExp(`(?<![.\\w$])${name.replace('.', '\\.')}\\s*\\(`, 'gu');
    for (const match of clean.matchAll(pattern)) spawnOffsets.push(match.index ?? 0);
  }
  if (spawnOffsets.length === 0) return [];

  const spawning = spawningHelpers(clean, spawnOffsets);
  const reachesASpawn = (/** @type {number} */ from, /** @type {number} */ to) =>
    spawnOffsets.some((offset) => offset > from && offset < to) ||
    [...spawning].some((name) => callsWithin(clean, name, from, to));

  const sites = callSites(clean);
  const describes = sites.filter((site) => site.kind === 'describe');
  const hooks = hookSites(clean);

  /** @type {{ line: number; describe: number | null }[]} */
  const offenders = [];
  for (const site of sites) {
    if (site.kind !== 'it') continue;
    if (statesOwnTimeout(site)) continue;

    const enclosing = describes
      .filter((block) => site.start > block.start && site.end <= block.end)
      .toSorted((a, b) => b.start - a.start);
    if (enclosing.some((block) => statesOwnTimeout(block))) continue;

    const innermost = enclosing[0];
    // A hook that spawns is paid by every test it runs around, so the whole
    // block it belongs to is in scope — including a hook declared outside
    // every describe, which runs around every test in the file.
    const spawningHook = hooks.some(
      (hook) =>
        (hook.describe === null || enclosing.some((block) => block.start === hook.describe)) &&
        reachesASpawn(hook.start, hook.end)
    );
    if (!reachesASpawn(site.start, site.end) && !spawningHook) continue;

    offenders.push({
      line: lineOf(source, site.start),
      describe: innermost === undefined ? null : lineOf(source, innermost.start),
    });
  }
  return offenders;
}

const DECLARATION =
  /(?<![.\w$])(?:(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=(?=[^=]))/gu;

/** Whether `name` is called anywhere in `[from, to)`. */
function callsWithin(
  /** @type {string} */ clean,
  /** @type {string} */ name,
  /** @type {number} */ from,
  /** @type {number} */ to
) {
  const pattern = new RegExp(`(?<![.\\w$])${name}\\s*\\(`, 'gu');
  for (const match of clean.slice(from, to).matchAll(pattern)) {
    if (match.index !== undefined) return true;
  }
  return false;
}

/**
 * The names of declarations whose body reaches a spawn, directly or through
 * another such name.
 *
 * This is the one-level-at-a-time call graph the header says is the hard part,
 * kept cheap by working on names and spans rather than on scopes: a
 * declaration's body is the text from its `=`/`)` to the end of its brace or
 * expression, and a name "calls" another when that name appears in call
 * position inside it. Shadowing is not modelled, which can only widen the set
 * — a false name match makes the guard ask for a timeout that was not needed,
 * never let an unbounded spawn through.
 *
 * Iterated to a fixed point so `runAllEcho` → `runMise` → `execFileSync`
 * resolves in either declaration order.
 */
export function spawningHelpers(/** @type {string} */ clean, /** @type {number[]} */ spawnOffsets) {
  /** @type {Map<string, [number, number]>} */
  const bodies = new Map();
  for (const match of clean.matchAll(DECLARATION)) {
    const name = match[1] ?? match[2];
    if (name === undefined) continue;
    const from = (match.index ?? 0) + match[0].length;
    const to = match[1] === undefined ? assignmentEnd(clean, from) : functionBodyEnd(clean, from);
    if (to > from) bodies.set(name, [from, to]);
  }

  /** @type {Set<string>} */
  const spawning = new Set();
  let growing = true;
  while (growing) {
    growing = false;
    for (const [name, [from, to]] of bodies) {
      if (spawning.has(name)) continue;
      const reaches =
        spawnOffsets.some((offset) => offset > from && offset < to) ||
        [...spawning].some((other) => other !== name && callsWithin(clean, other, from, to));
      if (!reaches) continue;
      spawning.add(name);
      growing = true;
    }
  }
  return spawning;
}

/**
 * The end of a `function NAME(...) { ... }` — its brace block, past the
 * parameter list and any return-type annotation.
 */
function functionBodyEnd(/** @type {string} */ clean, /** @type {number} */ from) {
  const open = clean.indexOf('{', clean.indexOf(')', from));
  if (open === -1) return from;
  let depth = 0;
  for (let i = open; i < clean.length; i += 1) {
    if (clean[i] === '{') depth += 1;
    else if (clean[i] === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return clean.length;
}

/**
 * The end of a `const NAME = <expression>;`.
 *
 * The terminating `;` at depth zero, because the tree is oxfmt-formatted and
 * every statement carries one. Stopping at the first closing bracket instead
 * would end an arrow function at its empty parameter list — `const run = () =>
 * execFileSync(...)` would have a body of `()` and never look like a spawner.
 */
function assignmentEnd(/** @type {string} */ clean, /** @type {number} */ from) {
  let depth = 0;
  for (let i = from; i < clean.length; i += 1) {
    const c = clean[i] ?? '';
    if ('([{'.includes(c)) depth += 1;
    else if (')]}'.includes(c)) {
      depth -= 1;
      if (depth < 0) return i;
    } else if (c === ';' && depth === 0) return i;
  }
  return clean.length;
}

const HOOK = /(?<![.\w$])(beforeAll|beforeEach|afterAll|afterEach)\s*\(/gu;

/** Every lifecycle hook, with the describe it belongs to (null at file level). */
function hookSites(/** @type {string} */ clean) {
  const describes = callSites(clean).filter((site) => site.kind === 'describe');
  /** @type {{ start: number; end: number; describe: number | null }[]} */
  const sites = [];
  for (const match of clean.matchAll(HOOK)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    const end = closingParen(clean, open);
    const owner = describes
      .filter((block) => (match.index ?? 0) > block.start && end <= block.end)
      .toSorted((a, b) => b.start - a.start)[0];
    sites.push({ start: match.index ?? 0, end, describe: owner?.start ?? null });
  }
  return sites;
}

/** Every test file under the scanned roots. */
export function discoverTestFiles(/** @type {string} */ root) {
  /** @type {string[]} */
  const found = [];
  const walk = (/** @type {string} */ dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.github') continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && TEST_FILE.test(entry.name)) found.push(full);
    }
  };
  for (const name of SCANNED_ROOTS) {
    const dir = join(root, name);
    try {
      if (statSync(dir).isDirectory()) walk(dir);
    } catch {
      continue;
    }
  }
  return found.toSorted();
}

/**
 * Scan the tree.
 *
 * @returns The files scanned, and one failure line per unbounded test.
 */
export function scanRepo(/** @type {string} */ root) {
  const files = discoverTestFiles(root);
  /** @type {string[]} */
  const failures = [];
  let spawningFiles = 0;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    if (spawnBindings(source).size === 0) continue;
    spawningFiles += 1;
    for (const offender of unboundedSpawningTests(source)) {
      const where =
        offender.describe === null
          ? 'no enclosing describe'
          : `describe at line ${offender.describe}`;
      failures.push(`${relative(root, file)}:${offender.line} (${where})`);
    }
  }
  return { fileCount: files.length, spawningFiles, failures };
}

const BOUND = `
import { execFileSync } from 'node:child_process';
describe('real tree', () => {
  const run = () => execFileSync('mise', ['--version']);
  it('is bounded', () => { run(); }, 30_000);
});
`;

/**
 * Prove the guard reports, one mutation at a time.
 *
 * Each case is the bounded shape with exactly one thing changed, named so a
 * failure says which property stopped holding.
 */
function selfTest() {
  /** @type {[name: string, source: string, expected: number][]} */
  const cases = [
    ['the bounded shape passes', BOUND, 0],
    ['a spawning test with no timeout is flagged', BOUND.replace(', 30_000', ''), 1],
    [
      'an execFileSync timeout is not the test timeout',
      BOUND.replace(", ['--version']", ", ['--version'], { timeout: 120_000 }").replace(
        ', 30_000',
        ''
      ),
      1,
    ],
    [
      "a describe's own timeout option bounds the tests inside it",
      BOUND.replace(
        "describe('real tree', () => {",
        "describe('real tree', { timeout: 30_000 }, () => {"
      ).replace(', 30_000', ''),
      0,
    ],
    [
      'an options object on the test bounds it',
      BOUND.replace(
        "it('is bounded', () => { run(); }, 30_000)",
        "it('is bounded', { timeout: 30_000 }, () => { run(); })"
      ),
      0,
    ],
    [
      'a pure test in a sibling describe is not dragged in',
      `${BOUND.replace(', 30_000', '')}\ndescribe('pure', () => { it('adds', () => {}); });`,
      1,
    ],
    [
      'a module-level helper reaches every test that calls it',
      `import { execFileSync } from 'node:child_process';
const run = () => execFileSync('mise', ['--version']);
describe('a', () => { it('one', () => { run(); }); });
describe('b', () => { it('two', () => { run(); }); });
describe('c', () => { it('three', () => {}); });
`,
      2,
    ],
    [
      'a spawn evaluated at module level and never called is not a test bound',
      `import { execFileSync } from 'node:child_process';
const version = execFileSync('mise', ['--version']);
describe('a', () => { it('one', () => { expect(version).toBeTruthy(); }); });
`,
      0,
    ],
    [
      'a helper that reaches a spawn through another helper is followed',
      `import { execFileSync } from 'node:child_process';
const runAllEcho = () => runMise('run-all');
const runMise = (task) => execFileSync('mise', [task]);
describe('a', () => { it('one', () => { runAllEcho(); }); });
`,
      1,
    ],
    [
      'a spawn in beforeAll binds every test in that describe',
      `import { execFileSync } from 'node:child_process';
describe('a', () => {
  beforeAll(() => { execFileSync('mise', ['--version']); });
  it('one', () => {});
  it('two', () => {});
});
describe('b', () => { it('three', () => {}); });
`,
      2,
    ],
    [
      'a file that spawns nothing is not scanned',
      "import { readFileSync } from 'node:fs';\ndescribe('a', () => { it('one', () => {}); });\n",
      0,
    ],
    [
      'a local name shadowing a spawner is not mistaken for one',
      "const spawn = (x) => x;\ndescribe('a', () => { it('one', () => { spawn(1); }); });\n",
      0,
    ],
    [
      'a renaming import is still followed',
      "import { execFileSync as run } from 'node:child_process';\ndescribe('a', () => { it('one', () => { run('mise'); }); });\n",
      1,
    ],
    [
      'a namespace import is still followed',
      "import * as cp from 'node:child_process';\ndescribe('a', () => { it('one', () => { cp.execFileSync('mise'); }); });\n",
      1,
    ],
    [
      'a spawn named only inside a string or a comment does not count as one',
      `import { execFileSync } from 'node:child_process';
const doc = 'execFileSync("mise")';
// execFileSync('mise')
describe('a', () => { it('one', () => {}); });
`,
      0,
    ],
    [
      'it.each keeps the timeout on the call that holds the callback',
      `import { execFileSync } from 'node:child_process';
describe('a', () => {
  const run = () => execFileSync('mise', ['--version']);
  it.each([1, 2])('case %s', () => { run(); }, 30_000);
});
`,
      0,
    ],
    [
      'it.each without a timeout is still flagged',
      `import { execFileSync } from 'node:child_process';
describe('a', () => {
  const run = () => execFileSync('mise', ['--version']);
  it.each([1, 2])('case %s', () => { run(); });
});
`,
      1,
    ],
  ];

  let ok = true;
  for (const [name, source, expected] of cases) {
    const actual = unboundedSpawningTests(source).length;
    if (actual === expected) continue;
    ok = false;
    console.error(`  self-test FAIL — ${name}: expected ${expected} offender(s), got ${actual}`);
  }
  console.log(
    ok
      ? `OK — ${cases.length} self-test mutations behave as stated.`
      : 'FAIL — the guard does not report what its header claims.'
  );
  return ok;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-subprocess-test-timeouts.mjs [--self-test]\n' +
        'Fails when a test that spawns a real subprocess does not state its own timeout.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) process.exit(selfTest() ? 0 : 1);

  const { fileCount, spawningFiles, failures } = scanRepo(repoRoot);
  console.log(
    `Scanned ${fileCount} test file(s) under ${SCANNED_ROOTS.join('/, ')}/ — ` +
      `${spawningFiles} spawn a real subprocess.`
  );
  if (failures.length === 0) {
    console.log('OK — every test reachable from a real spawn states its own timeout.');
    process.exit(0);
  }
  console.error(
    "FAIL — these tests spawn a real subprocess and are bounded by vitest's 5000ms default, " +
      'which is not what they need and not what anyone chose:'
  );
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(
    'Give the test its own bound — `it(name, fn, 30_000)` — or put `{ timeout }` on the ' +
      'describe that holds them all. A timeout passed to execFileSync/spawnSync is NOT the ' +
      "test's bound: the smaller of the two wins, silently (POPS-2007)."
  );
  process.exit(1);
}

if (import.meta.main) {
  main();
}
