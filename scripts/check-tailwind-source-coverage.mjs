#!/usr/bin/env node
/**
 * Tailwind `@source` coverage guard.
 *
 * Tailwind v4 only generates a utility class if it finds that class in a
 * scanned source file, and it does NOT error when an `@source` glob matches
 * zero files — so a stale glob (e.g. the `apps/*` / `packages/*` globs left
 * behind by the pillars/libs rename) silently stops generating most utilities
 * and the UI collapses with no build error. This guard makes that failure loud
 * at CI time.
 *
 * There is more than one stylesheet (POPS-4581). The shell's carries the theme
 * and the utilities the libs and the shell use; each loader-mounted pillar's
 * remote build emits a stylesheet of the utilities its own source uses, which
 * the shell's runtime loader links before mounting it. The contract:
 *
 *   1. THE SHELL SHEET — `pillars/shell/src/styles.css`, followed through its
 *      `@import`s into `@pops/ui/theme` — covers every className-bearing file
 *      under `libs/` and `pillars/shell/src`, and reaches no file under any
 *      other pillar. A shell that scans a pillar is the coupling POPS-4581
 *      removed, and it would hide a pillar sheet that stopped emitting what
 *      its app uses.
 *   2. THE SHARED TOKENS — `libs/ui/src/theme/globals.css` declares no
 *      `@source`, and imports `tailwindcss` with `source(none)`. Every pillar
 *      sheet `@reference`s it, and Tailwind follows `@source` into a
 *      referenced file, so a scan there would re-emit the kit's utilities into
 *      every pillar's sheet; automatic detection would scan whatever sits
 *      under the building app's root, which no rule here can see.
 *   3. EVERY PILLAR REMOTE BUILD — each `pillars/<p>/app` with a
 *      `vite.remote.config.ts` — has a stylesheet entry, `remote.css`, that
 *      `@reference`s `@pops/ui/theme/globals.css`, imports
 *      `tailwindcss/utilities` into `layer(utilities)` with `source(none)`, and
 *      scans the app's own `src/` and nothing outside the app.
 *      (`remoteBuildConfig` in `@pops/pillar-sdk/remote-build` adds that file
 *      to the build and fails it when no stylesheet comes out.)
 *   4. NO UNCOVERED SOURCE — every className-bearing `.tsx`/`.jsx`/`.mdx` file
 *      under `pillars/` or `libs/` is scanned by some stylesheet entry: the
 *      shell's, a pillar's, or one of the apps that compile pillar source into
 *      a bundle of their own (the design playground, Storybook). A UI file
 *      authored outside every scanned tree would silently lose its styling.
 *      (`.storybook/` is exempt: its decorator classes are plain CSS
 *      selectors from the theme, not scanned utilities.)
 *
 * Tailwind v4 defines three `@source` forms, and this guard treats them
 * differently on purpose, in every entry:
 *   - `@source "<glob>";`         a plain scan glob — checked for coverage. A
 *     path with no glob metacharacter (`@source './src'`) is a directory, and
 *     scans everything beneath it.
 *   - `@source inline("<pat>");`  an inline safelist pattern, not a filesystem
 *     path at all. Accepted, but excluded from the coverage checks — there is
 *     no file to find empty or uncovered.
 *   - `@source not "<glob>";`     a negated exclusion. **Banned in this repo**
 *     rather than modelled: an exclusion can de-scope a subtree Tailwind was
 *     otherwise covering, with the same silent-collapse failure mode this
 *     guard exists to catch, and this repo's globs are meant to state
 *     coverage positively and exhaustively. If a subtree needs excluding,
 *     narrow the positive globs instead of adding a negative one.
 * Any `@source` statement matching none of these three shapes is reported as
 * a violation too — a shape this guard cannot classify is exactly the kind of
 * rot it exists to catch, so it is never silently skipped. Every plain glob
 * must also match at least one real file.
 *
 * Usage:
 *   node scripts/check-tailwind-source-coverage.mjs              check the real tree
 *   node scripts/check-tailwind-source-coverage.mjs --self-test  prove the guard catches rot
 *
 * Exit 0 when every rule above holds; non-zero on any violation, failed
 * self-test, or discovery error.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

/** The shell's stylesheet entry, relative to the repo root. */
const SHELL_ENTRY = 'pillars/shell/src/styles.css';
/** The tokens every pillar sheet references; must declare no `@source`. */
const TOKENS_CSS = 'libs/ui/src/theme/globals.css';
/** Apps that compile pillar source into a bundle of their own. */
const OTHER_ENTRIES = ['pillars/design/src/styles.css', 'libs/ui/.storybook/preview.css'];
/** Marks a pillar app that has a remote build. */
const REMOTE_CONFIG = 'vite.remote.config.ts';
/** A remote build's stylesheet entry, relative to its app. */
const REMOTE_STYLESHEET = 'remote.css';
/** Lines listed per failure; a glob gone wide can match thousands of files. */
const MAX_LISTED = 25;

/** Extensions of files that can author Tailwind utility classes via JSX. */
const UI_EXTENSIONS = new Set(['.tsx', '.jsx', '.mdx']);
/** Extensions worth indexing at all (UI files plus `.ts` for glob-match counting). */
const INDEX_EXTENSIONS = new Set(['.ts', '.tsx', '.jsx', '.mdx']);
/** Directory names never walked. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  'storybook-static',
  '.turbo',
]);

/** Matches one whole `@source` at-rule statement, from the keyword up to (and
 * including, if present) its terminating semicolon. Deliberately unopinionated
 * about what follows `@source` — classification happens in
 * {@link parseSourceStatements} so a shape this guard cannot recognise is
 * captured, not dropped. */
const SOURCE_STATEMENT_RE = /@source\b[^;\n]*;?/g;
const PLAIN_SOURCE_RE = /^@source\s+['"]([^'"]+)['"]\s*;?$/;
const INLINE_SOURCE_RE = /^@source\s+inline\(\s*['"]([^'"]*)['"]\s*\)\s*;?$/;
const NOT_SOURCE_RE = /^@source\s+not\s+['"]([^'"]+)['"]\s*;?$/;

/**
 * @typedef {object} SourceStatement
 * @property {'source' | 'inline' | 'not' | 'unrecognized'} kind
 * @property {string} raw    The full statement text (trimmed), for reporting.
 * @property {string} [arg]  The quoted argument, when the statement has one —
 *   a filesystem glob for `source`/`not`, a safelist pattern for `inline`.
 */

/**
 * `css` with its comments removed. Quoted strings are skipped over rather
 * than searched, because a recursive glob is full of comment-shaped text: a
 * slash followed by `**` opens a comment, and the star-slash after it closes
 * one, to a regex that does not know it is inside quotes.
 *
 * @param {string} css
 * @returns {string}
 */
export function stripComments(css) {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const c = css.charAt(i);
    if (c === '"' || c === "'") {
      const close = css.indexOf(c, i + 1);
      const end = close === -1 ? css.length : close + 1;
      out += css.slice(i, end);
      i = end;
    } else if (c === '/' && css.charAt(i + 1) === '*') {
      const close = css.indexOf('*/', i + 2);
      i = close === -1 ? css.length : close + 2;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/**
 * Extract and classify every `@source` statement from a stylesheet.
 * The old pattern here required a quote immediately after `@source`, which
 * matched only the plain form — `@source not "…"` and `@source inline("…")`
 * put a letter there instead and were silently dropped. This scans for the
 * `@source` keyword first, independent of what follows, so every statement is
 * captured; classification is a second pass and anything it cannot place
 * becomes `unrecognized` rather than vanishing.
 *
 * Comments are removed first, as Tailwind removes them: a stylesheet that
 * explains why it declares no `@source` is not declaring one.
 *
 * @param {string} css
 * @returns {SourceStatement[]}
 */
export function parseSourceStatements(css) {
  const statements = stripComments(css).match(SOURCE_STATEMENT_RE) ?? [];
  return statements.map((raw) => {
    const trimmed = raw.trim();
    const not = trimmed.match(NOT_SOURCE_RE);
    if (not) return { kind: 'not', raw: trimmed, arg: not[1] };
    const inline = trimmed.match(INLINE_SOURCE_RE);
    if (inline) return { kind: 'inline', raw: trimmed, arg: inline[1] };
    const plain = trimmed.match(PLAIN_SOURCE_RE);
    if (plain) return { kind: 'source', raw: trimmed, arg: plain[1] };
    return { kind: 'unrecognized', raw: trimmed };
  });
}

/**
 * @typedef {object} StatementPartition
 * @property {string[]} sourceGlobs             Raw globs from plain `@source "…"` statements.
 * @property {SourceStatement[]} inlineStatements `@source inline(...)` statements — accepted, not filesystem globs.
 * @property {SourceStatement[]} violations       `@source not` (banned) and any unrecognised statement.
 */

/**
 * Split parsed `@source` statements into what `run()` needs: usable scan
 * globs, inline-safelist statements (skipped from file-coverage checks), and
 * violations. `@source not` is a violation because this repo bans it rather
 * than modelling its subtractive effect — see the file header.
 *
 * @param {SourceStatement[]} statements
 * @returns {StatementPartition}
 */
export function partitionStatements(statements) {
  /** @type {string[]} */
  const sourceGlobs = [];
  /** @type {SourceStatement[]} */
  const inlineStatements = [];
  /** @type {SourceStatement[]} */
  const violations = [];
  for (const statement of statements) {
    if (statement.kind === 'source') sourceGlobs.push(/** @type {string} */ (statement.arg));
    else if (statement.kind === 'inline') inlineStatements.push(statement);
    else violations.push(statement);
  }
  return { sourceGlobs, inlineStatements, violations };
}

/**
 * Find the index of the `]` that closes a `[...]` bracket expression starting
 * at `open` (the index of the `[`), honouring the glob rule that a `]`
 * appearing immediately after `[` — or after a `[!`/`[^` negation marker —
 * is a literal member of the class rather than the closer (`[]abc]` matches
 * `]`, `a`, `b`, or `c`). Returns -1 when no closing `]` exists in the rest
 * of the string, in which case the `[` is glob-literal, not a class opener.
 *
 * @param {string} glob
 * @param {number} open
 * @returns {number}
 */
function findBracketClassEnd(glob, open) {
  let j = open + 1;
  if (glob[j] === '!' || glob[j] === '^') j++;
  if (glob[j] === ']') j++;
  while (j < glob.length && glob[j] !== ']') j++;
  return j < glob.length ? j : -1;
}

/**
 * Compile a filesystem glob (supporting `**`, `*`, `?`, `{a,b}` brace lists,
 * and `[...]` bracket character classes — including `[a-z]` ranges and
 * `[!abc]`/`[^abc]` negation) into an anchored RegExp matched against
 * absolute POSIX-style paths.
 *
 * @param {string} glob
 * @returns {RegExp}
 */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob.charAt(i);
    if (c === '*') {
      if (glob.charAt(i + 1) === '*') {
        i++;
        if (glob.charAt(i + 1) === '/') {
          i++;
          re += '(?:.*/)?'; // `**/` — zero or more path segments
        } else {
          re += '.*'; // `**` — anything, including `/`
        }
      } else {
        re += '[^/]*'; // `*` — anything within a single segment
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if (c === '{') {
      const end = glob.indexOf('}', i);
      const inner = glob
        .slice(i + 1, end)
        .split(',')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
      re += `(?:${inner})`;
      i = end;
    } else if (c === '[') {
      const end = findBracketClassEnd(glob, i);
      if (end === -1) {
        re += '\\['; // no matching `]` in the rest of the glob — literal `[`
      } else {
        let j = i + 1;
        let negate = false;
        if (glob[j] === '!' || glob[j] === '^') {
          negate = true;
          j++;
        }
        // `]` and `\` are the only characters that still need escaping for a
        // JS character class; `-` is left alone so `a-z` ranges keep working.
        const content = glob.slice(j, end).replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
        // Every class — negated or not — is spliced with a `(?!\/)` guard
        // rather than a slash folded into the class body: appending `/` to
        // the class text risks forming an unintended range (e.g. content
        // ending in `-` would make `-/` read as "hyphen through slash"), and
        // a positive class that happens to list `/` explicitly (`[/]`) would
        // otherwise match a path separator. This keeps `[...]` consistent
        // with `?` and `*`, neither of which crosses a path segment either.
        re += `(?:(?!\\/)[${negate ? '^' : ''}${content}])`;
        i = end;
      }
    } else if ('.+^$()|[]\\'.includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

/**
 * The directory to start walking for a glob: the static prefix before its
 * first metacharacter. `[` counts alongside `*`, `?`, and `{` — a bracket
 * class that opens before any other wildcard would otherwise leave its
 * literal text (e.g. `[a-z]`) in the prefix, `existsSync` would find no such
 * directory, and `walk` would silently index nothing under it — the glob
 * then reports empty regardless of what it should match.
 *
 * @param {string} absGlob
 * @returns {string}
 */
export function globBaseDir(absGlob) {
  const metaIdx = absGlob.search(/[*?{[]/);
  const prefix = metaIdx === -1 ? absGlob : absGlob.slice(0, metaIdx);
  return prefix.endsWith('/') ? prefix.slice(0, -1) : dirname(prefix);
}

/**
 * Recursively collect indexable files under `dir`. Reads contents only for UI
 * files (to flag `className` usage); `.ts` files are indexed path-only so glob
 * emptiness can still count them without reading thousands of files.
 *
 * @param {string} dir
 * @param {Map<string, { path: string, ext: string, hasClassName: boolean }>} out
 */
function walk(dir, out) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), out);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = extname(entry.name);
    if (!INDEX_EXTENSIONS.has(ext)) continue;
    const path = join(dir, entry.name);
    if (out.has(path)) continue;
    const hasClassName = UI_EXTENSIONS.has(ext) && readFileSync(path, 'utf8').includes('className');
    out.set(path, { path, ext, hasClassName });
  }
}

/**
 * @typedef {object} CoverageResult
 * @property {string[]} emptyGlobs  Globs that matched zero indexed files.
 * @property {string[]} uncovered   `className`-bearing UI files matched by no glob.
 */

/**
 * Pure core: given absolute `@source` globs and an indexed file list, find
 * globs that match nothing and UI files matched by no glob. No I/O, so the
 * self-test can drive it over synthetic fixtures.
 *
 * @param {string[]} absGlobs
 * @param {{ path: string, ext: string, hasClassName: boolean }[]} files
 * @returns {CoverageResult}
 */
export function evaluateCoverage(absGlobs, files) {
  const compiled = absGlobs.map((glob) => ({ glob, re: globToRegExp(glob) }));
  const emptyGlobs = compiled
    .filter(({ re }) => !files.some((f) => re.test(f.path)))
    .map(({ glob }) => glob);
  const uncovered = files
    .filter(
      (f) =>
        UI_EXTENSIONS.has(f.ext) &&
        f.hasClassName &&
        !f.path.includes('/.storybook/') &&
        !compiled.some(({ re }) => re.test(f.path))
    )
    .map((f) => f.path);
  return { emptyGlobs, uncovered };
}

/**
 * The absolute glob a plain `@source` argument scans, resolved against the
 * directory of the stylesheet that declares it. An argument with no glob
 * metacharacter names a directory, which Tailwind scans recursively.
 *
 * @param {string} fromDir
 * @param {string} arg
 * @returns {string}
 */
export function absoluteSourceGlob(fromDir, arg) {
  const abs = resolve(fromDir, arg);
  return /[*?{[]/.test(abs) ? abs : `${abs}/**/*`;
}

/** Matches `@import '<x>'` and `@reference '<x>'`, capturing the specifier. */
const STYLESHEET_EDGE_RE = /@(?:import|reference)\s+['"]([^'"]+)['"]/g;

/**
 * @typedef {object} EntrySource
 * @property {SourceStatement} statement  The statement as written.
 * @property {string} file                The stylesheet that declares it.
 * @property {string} [glob]              Its absolute glob, for a plain `@source`.
 */

/**
 * Every `@source` statement an entry stylesheet puts in force, following its
 * `@import` and `@reference` edges into this repo's stylesheets. Tailwind
 * honours `@source` in a referenced file as well as an imported one, which is
 * why both edges are followed. A specifier `resolveEdge` does not place in the
 * repo (`tailwindcss`, a font package) is not followed.
 *
 * @param {string} entry  Absolute path of the entry stylesheet.
 * @param {(path: string) => string | undefined} read  Reads a stylesheet; undefined when absent.
 * @param {(specifier: string, fromDir: string) => string | undefined} resolveEdge
 * @returns {{ sources: EntrySource[], missing: string[] }} `missing` lists
 *   stylesheets the entry reaches that do not exist — the entry itself first.
 */
export function collectEntrySources(entry, read, resolveEdge) {
  /** @type {EntrySource[]} */
  const sources = [];
  /** @type {string[]} */
  const missing = [];
  /** @type {Set<string>} */
  const seen = new Set();
  /** @param {string} file */
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const css = read(file);
    if (css === undefined) {
      missing.push(file);
      return;
    }
    const fromDir = dirname(file);
    for (const statement of parseSourceStatements(css)) {
      sources.push(
        statement.kind === 'source'
          ? { statement, file, glob: absoluteSourceGlob(fromDir, statement.arg ?? '') }
          : { statement, file }
      );
    }
    for (const [, specifier] of css.matchAll(STYLESHEET_EDGE_RE)) {
      const target = specifier === undefined ? undefined : resolveEdge(specifier, fromDir);
      if (target !== undefined) visit(target);
    }
  };
  visit(entry);
  return { sources, missing };
}

/**
 * Whether an indexed file is UI source Tailwind has to scan: a `className`-
 * bearing `.tsx`/`.jsx`/`.mdx` outside `.storybook/`.
 *
 * @param {{ path: string, ext: string, hasClassName: boolean }} file
 */
function needsScanning(file) {
  return UI_EXTENSIONS.has(file.ext) && file.hasClassName && !file.path.includes('/.storybook/');
}

/**
 * Whether a stylesheet imports `tailwindcss` without `source(none)`, which
 * turns on Tailwind's automatic detection from the building app's root.
 *
 * @param {string} css
 * @returns {boolean}
 */
export function tokensDetectAutomatically(css) {
  const imports = [...stripComments(css).matchAll(/@import\s+['"]tailwindcss['"]([^;]*);/g)];
  return imports.some(([, modifiers]) => !/\bsource\(none\)/.test(modifiers ?? ''));
}

/**
 * Rule 1: what the shell's sheet scans.
 *
 * @param {string[]} absGlobs  Every glob the shell entry puts in force.
 * @param {{ path: string, ext: string, hasClassName: boolean }[]} files
 * @param {string} root  Repo root the files are indexed under.
 * @returns {{ reachesPillars: string[], uncovered: string[] }} Files under a
 *   pillar other than the shell that a shell glob matches, and lib or shell UI
 *   files no shell glob matches.
 */
export function evaluateShellSheet(absGlobs, files, root) {
  const compiled = absGlobs.map((glob) => globToRegExp(glob));
  /** @param {string} path */
  const scanned = (path) => compiled.some((re) => re.test(path));
  const pillars = `${root}/pillars/`;
  const shell = `${root}/pillars/shell/`;
  const reachesPillars = files
    .filter((f) => f.path.startsWith(pillars) && !f.path.startsWith(shell) && scanned(f.path))
    .map((f) => f.path);
  const uncovered = files
    .filter(
      (f) =>
        (f.path.startsWith(`${root}/libs/`) || f.path.startsWith(`${root}/pillars/shell/src/`)) &&
        needsScanning(f) &&
        !scanned(f.path)
    )
    .map((f) => f.path);
  return { reachesPillars, uncovered };
}

/**
 * Rule 3 for one pillar app: its stylesheet entry and what that entry scans.
 *
 * @param {object} app
 * @param {string} app.appDir  Absolute path of `pillars/<p>/app`.
 * @param {string | undefined} app.css  Its `remote.css`, or undefined when absent.
 * @param {string[]} app.absGlobs  Every glob the stylesheet entry puts in force.
 * @param {{ path: string, ext: string, hasClassName: boolean }[]} app.files
 * @returns {string[]} One line per problem; empty when the build is sound.
 */
export function evaluateRemoteStylesheet({ appDir, css, absGlobs, files }) {
  if (css === undefined) {
    return [`no ${REMOTE_STYLESHEET} — the remote build emits no stylesheet of its own`];
  }
  /** @type {string[]} */
  const problems = [];
  if (!/@reference\s+['"]@pops\/ui\/theme\/globals\.css['"]/.test(css)) {
    problems.push(
      `${REMOTE_STYLESHEET} does not @reference '@pops/ui/theme/globals.css' — it would ` +
        'either lack the tokens or emit them a second time'
    );
  }
  const utilities = css.match(/@import\s+['"]tailwindcss\/utilities['"]([^;]*);/);
  if (utilities === null) {
    problems.push(`${REMOTE_STYLESHEET} does not import 'tailwindcss/utilities'`);
  } else {
    const modifiers = utilities[1] ?? '';
    if (!/\bsource\(none\)/.test(modifiers)) {
      problems.push(
        `${REMOTE_STYLESHEET} imports 'tailwindcss/utilities' without source(none), so ` +
          'automatic detection decides what it scans'
      );
    }
    if (!/\blayer\(utilities\)/.test(modifiers)) {
      problems.push(
        `${REMOTE_STYLESHEET} imports 'tailwindcss/utilities' outside layer(utilities), so ` +
          "its rules would be unlayered and beat every layer of the shell's sheet"
      );
    }
  }
  if (absGlobs.length === 0) problems.push(`${REMOTE_STYLESHEET} scans nothing`);
  for (const glob of absGlobs) {
    if (!glob.startsWith(`${appDir}/`)) {
      problems.push(`${REMOTE_STYLESHEET} scans outside the app: ${glob}`);
    }
  }
  const appSource = files.filter((f) => f.path.startsWith(`${appDir}/src/`));
  const { uncovered } = evaluateCoverage(absGlobs, appSource);
  for (const path of uncovered) problems.push(`${REMOTE_STYLESHEET} does not scan ${path}`);
  return problems;
}

/**
 * The stylesheets `@import` / `@reference` edges may reach by package name,
 * read from the manifest of the package that publishes them so a moved file
 * is followed rather than silently dropped.
 *
 * @param {string} root
 * @returns {(specifier: string, fromDir: string) => string | undefined}
 */
function repoEdgeResolver(root) {
  const uiDir = resolve(root, 'libs/ui');
  const manifest = JSON.parse(readFileSync(join(uiDir, 'package.json'), 'utf8'));
  /** @type {Map<string, string>} */
  const packaged = new Map();
  for (const [key, target] of Object.entries(manifest.exports ?? {})) {
    const file = typeof target === 'string' ? target : target?.default;
    if (typeof file === 'string' && file.endsWith('.css')) {
      packaged.set(`@pops/ui/${key.replace(/^\.\//, '')}`, resolve(uiDir, file));
    }
  }
  return (specifier, fromDir) =>
    specifier.startsWith('.') ? resolve(fromDir, specifier) : packaged.get(specifier);
}

/** @param {string} path */
function readIfPresent(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** @param {string} path */
const rel = (path) => (path.startsWith(`${repoRoot}/`) ? path.slice(repoRoot.length + 1) : path);

/**
 * Every app under `pillars/` with a remote build, as its absolute directory.
 *
 * @returns {string[]}
 */
function remoteBuildApps() {
  const pillarsDir = resolve(repoRoot, 'pillars');
  return readdirSync(pillarsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(pillarsDir, entry.name, 'app'))
    .filter((appDir) => existsSync(join(appDir, REMOTE_CONFIG)))
    .toSorted();
}

/**
 * Drive the guard against the real tree.
 *
 * @returns {boolean} true when every rule in the header holds.
 */
function run() {
  const resolveEdge = repoEdgeResolver(repoRoot);

  /** @type {Map<string, { path: string, ext: string, hasClassName: boolean }>} */
  const index = new Map();
  walk(resolve(repoRoot, 'pillars'), index);
  walk(resolve(repoRoot, 'libs'), index);
  const files = [...index.values()];

  /** @type {{ title: string, lines: string[], hint: string }[]} */
  const failures = [];
  /**
   * @param {string} title
   * @param {string[]} lines
   * @param {string} hint
   */
  const fail = (title, lines, hint) => {
    if (lines.length > 0) failures.push({ title, lines, hint });
  };

  const tokens = readIfPresent(resolve(repoRoot, TOKENS_CSS));
  if (tokens === undefined) {
    fail(`${TOKENS_CSS} is missing`, [TOKENS_CSS], 'Every pillar sheet references it.');
  } else {
    fail(
      `${TOKENS_CSS} declares @source`,
      parseSourceStatements(tokens).map((s) => s.raw),
      'Pillar sheets @reference this file and Tailwind follows @source into it, so every ' +
        "pillar sheet would re-emit the kit's utilities. Scan from libs/ui/src/theme/index.css."
    );
    fail(
      `${TOKENS_CSS} leaves automatic source detection on`,
      tokensDetectAutomatically(tokens) ? [TOKENS_CSS] : [],
      'Import tailwindcss with source(none); each entry names what it scans with @source.'
    );
  }

  /** @type {string[]} */
  const allGlobs = [];
  /**
   * @param {string} entry
   * @returns {string[]}
   */
  const collect = (entry) => {
    const { sources, missing } = collectEntrySources(entry, readIfPresent, resolveEdge);
    fail(`${rel(entry)} reaches stylesheets that do not exist`, missing.map(rel), '');
    const { violations } = partitionStatements(sources.map((s) => s.statement));
    fail(
      `${rel(entry)} puts a banned or unrecognised @source in force`,
      sources
        .filter((s) => violations.includes(s.statement))
        .map((s) => `${rel(s.file)}: ${s.statement.raw}`),
      'Supported forms: `@source "<glob>";` and `@source inline("<pattern>");`. `@source not` ' +
        'can silently de-scope a covered subtree; narrow the positive globs instead.'
    );
    const globs = sources.flatMap((s) => (s.glob === undefined ? [] : [s.glob]));
    const { emptyGlobs } = evaluateCoverage(globs, files);
    fail(
      `${rel(entry)} has @source globs that match no files (stale path?)`,
      emptyGlobs.map(rel),
      'Tailwind silently skips an empty @source glob — fix the path so its classes generate.'
    );
    allGlobs.push(...globs);
    return globs;
  };

  const shellGlobs = collect(resolve(repoRoot, SHELL_ENTRY));
  const shell = evaluateShellSheet(shellGlobs, files, repoRoot);
  fail(
    `the shell sheet scans ${shell.reachesPillars.length} file(s) belonging to other pillars`,
    shell.reachesPillars.map(rel),
    "A pillar's utilities ship in its own remote stylesheet; the shell sheet scans libs/ and " +
      'pillars/shell only.'
  );
  fail(
    `the shell sheet leaves ${shell.uncovered.length} lib/shell UI file(s) unscanned`,
    shell.uncovered.map(rel),
    `Widen the @source globs reachable from ${SHELL_ENTRY}.`
  );

  for (const entry of OTHER_ENTRIES) collect(resolve(repoRoot, entry));

  const apps = remoteBuildApps();
  for (const appDir of apps) {
    const stylesheet = join(appDir, REMOTE_STYLESHEET);
    const css = readIfPresent(stylesheet);
    const absGlobs = css === undefined ? [] : collect(stylesheet);
    fail(
      `${rel(appDir)}: the remote build's stylesheet entry is not sound`,
      evaluateRemoteStylesheet({ appDir, css, absGlobs, files }),
      'See `REMOTE_STYLESHEET_PATH` in @pops/pillar-sdk/remote-build for the three lines it holds.'
    );
  }

  const { uncovered } = evaluateCoverage(allGlobs, files);
  fail(
    `${uncovered.length} className-bearing UI file(s) outside every stylesheet entry`,
    uncovered.map(rel),
    'Move it under a scanned src/ dir (as .ts/.tsx), or its Tailwind classes will not generate.'
  );

  console.log(
    `Checked the shell sheet, ${OTHER_ENTRIES.length} other app sheet(s) and ${apps.length} ` +
      `pillar remote build(s) against ${files.length} indexed file(s).`
  );
  for (const appDir of apps) console.log(`  ..    ${rel(appDir)}/${REMOTE_STYLESHEET}`);

  if (failures.length === 0) {
    console.log(
      'OK — the shell sheet covers libs/ and the shell and no other pillar, every pillar ' +
        'remote build has a sound stylesheet entry, and every UI file is scanned.'
    );
    return true;
  }
  for (const { title, lines, hint } of failures) {
    console.error(`FAIL — ${title}:`);
    for (const line of lines.slice(0, MAX_LISTED)) console.error(`  XX  ${line}`);
    if (lines.length > MAX_LISTED) console.error(`  ..  and ${lines.length - MAX_LISTED} more`);
    if (hint !== '') console.error(`  ${hint}`);
  }
  return false;
}

/**
 * Synthetic fixtures proving the guard catches each kind of rot — a stale
 * glob, an uncovered UI file, a banned or unrecognised `@source`, a shell
 * sheet that scans a pillar, a scan left in the shared tokens, and a pillar
 * remote build without a sound stylesheet entry — and passes a correct tree.
 * Mirrors the `--self-test` convention in check-pillar-ui-reachability.mjs.
 *
 * @returns {boolean}
 */
function selfTest() {
  const root = '/r';
  const goodGlobs = [`${root}/pillars/**/src/**/*.{ts,tsx}`, `${root}/libs/**/src/**/*.{ts,tsx}`];
  const staleGlobs = [`${root}/apps/*/src/**/*.{ts,tsx}`, `${root}/packages/*/src/**/*.{ts,tsx}`];

  const files = [
    { path: `${root}/pillars/finance/app/src/Dashboard.tsx`, ext: '.tsx', hasClassName: true },
    { path: `${root}/pillars/shell/src/main.tsx`, ext: '.tsx', hasClassName: true },
    { path: `${root}/libs/ui/src/Button.tsx`, ext: '.tsx', hasClassName: true },
    { path: `${root}/pillars/x/app/Outside.tsx`, ext: '.tsx', hasClassName: true },
    { path: `${root}/pillars/x/app/src/Weird.jsx`, ext: '.jsx', hasClassName: true },
    { path: `${root}/libs/ui/.storybook/preview.tsx`, ext: '.tsx', hasClassName: true },
  ];

  const firstGoodGlob = goodGlobs[0];
  if (firstGoodGlob === undefined) {
    throw new Error('self-test: goodGlobs fixture is empty');
  }
  const pillarsSrc = globToRegExp(firstGoodGlob);
  const good = evaluateCoverage(goodGlobs, files);
  const stale = evaluateCoverage(staleGlobs, files);

  // Bracket character classes: POPS-1788 fixed these compiling to a regex
  // that could never match (the `[`/`]` were escaped as literal text), which
  // failed safe — the empty-glob check above already caught it — but still
  // meant a bracket glob was unusable. These prove it now compiles correctly.
  const bracketClass = globToRegExp(`${root}/pillars/[a-z]*/src/index.ts`);
  const negatedClass = globToRegExp(`${root}/pillars/[!Z]*/src/index.ts`);
  const caretNegatedClass = globToRegExp(`${root}/pillars/[^Z]*/src/index.ts`);
  const rangeClass = globToRegExp(`${root}/pillars/[0-9]*/src/index.ts`);
  const segmentGuard = globToRegExp(`${root}/x/[!Z]/y`);
  const positiveSegmentGuard = globToRegExp(`${root}/x/[a/]/y`);
  const leadingBracketLiteral = globToRegExp(`${root}/[]a]bc`);
  const unterminatedBracket = globToRegExp(`${root}/[abc`);

  const goodCss = [
    `@source "${root}/pillars/**/src/**/*.{ts,tsx}";`,
    `@source "${root}/libs/**/src/**/*.{ts,tsx}";`,
  ].join('\n');
  const bannedCss = [
    `@source "${root}/pillars/**/src/**/*.{ts,tsx}";`,
    `@source not "${root}/legacy/**/*.ts";`,
  ].join('\n');
  const inlineCss = [
    `@source "${root}/pillars/**/src/**/*.{ts,tsx}";`,
    `@source inline("bg-red-{50,100,900}");`,
  ].join('\n');
  const malformedCss = [
    `@source "${root}/pillars/**/src/**/*.{ts,tsx}";`,
    `@source url("weird.css");`,
  ].join('\n');

  const goodPartition = partitionStatements(parseSourceStatements(goodCss));
  const bannedPartition = partitionStatements(parseSourceStatements(bannedCss));
  const inlinePartition = partitionStatements(parseSourceStatements(inlineCss));
  const malformedPartition = partitionStatements(parseSourceStatements(malformedCss));

  // POPS-4581: the split between the shell's sheet and each pillar's.
  const shellGlobs = [
    `${root}/libs/**/src/**/*.{ts,tsx}`,
    absoluteSourceGlob(`${root}/pillars/shell/src`, '.'),
  ];
  const shellSplit = evaluateShellSheet(shellGlobs, files, root);
  const shellScanningPillars = evaluateShellSheet(goodGlobs, files, root);
  const shellMissingItself = evaluateShellSheet([shellGlobs[0] ?? ''], files, root);

  const tree = new Map([
    [`${root}/pillars/shell/src/styles.css`, "@import '@pops/ui/theme';\n@source '.';\n"],
    [
      `${root}/libs/ui/src/theme/index.css`,
      "@import './globals.css';\n@source '../../../../libs';\n",
    ],
    [`${root}/libs/ui/src/theme/globals.css`, "@import 'tailwindcss';\n"],
    [
      `${root}/pillars/x/app/remote.css`,
      "@reference '@pops/ui/theme/globals.css';\n@source './src';\n",
    ],
  ]);
  /**
   * @param {string} specifier
   * @param {string} fromDir
   * @returns {string | undefined}
   */
  const edges = (specifier, fromDir) => {
    if (specifier === '@pops/ui/theme') return `${root}/libs/ui/src/theme/index.css`;
    if (specifier === '@pops/ui/theme/globals.css') return `${root}/libs/ui/src/theme/globals.css`;
    return specifier.startsWith('.') ? resolve(fromDir, specifier) : undefined;
  };
  const shellCollected = collectEntrySources(
    `${root}/pillars/shell/src/styles.css`,
    (p) => tree.get(p),
    edges
  );
  const leakyTree = new Map(tree);
  leakyTree.set(`${root}/libs/ui/src/theme/globals.css`, "@source '../../../../libs';\n");
  const leakyRemote = collectEntrySources(
    `${root}/pillars/x/app/remote.css`,
    (p) => leakyTree.get(p),
    edges
  );
  const missingEntry = collectEntrySources(`${root}/nowhere.css`, (p) => tree.get(p), edges);

  const appDir = `${root}/pillars/x/app`;
  const appFiles = [{ path: `${appDir}/src/Page.tsx`, ext: '.tsx', hasClassName: true }];
  const goodRemoteCss = [
    "@reference '@pops/ui/theme/globals.css';",
    "@import 'tailwindcss/utilities' layer(utilities) source(none);",
    "@source './src';",
  ].join('\n');
  const appGlobs = [absoluteSourceGlob(appDir, './src')];
  /** @param {Partial<Parameters<typeof evaluateRemoteStylesheet>[0]>} overrides */
  const remote = (overrides) =>
    evaluateRemoteStylesheet({
      appDir,
      css: goodRemoteCss,
      absGlobs: appGlobs,
      files: appFiles,
      ...overrides,
    });

  const checks = {
    'regex matches a nested app/src .tsx': pillarsSrc.test(
      `${root}/pillars/finance/app/src/Dashboard.tsx`
    ),
    'regex matches a shallow src .tsx': pillarsSrc.test(`${root}/pillars/shell/src/main.tsx`),
    'regex rejects a file outside src/': !pillarsSrc.test(`${root}/pillars/x/app/Outside.tsx`),
    'regex rejects a .jsx (wrong ext)': !pillarsSrc.test(`${root}/pillars/x/app/src/Weird.jsx`),
    'good globs are all non-empty': good.emptyGlobs.length === 0,
    'good globs flag the outside-src + .jsx files': good.uncovered.length === 2,
    'good globs exempt .storybook': !good.uncovered.some((p) => p.includes('/.storybook/')),
    'stale apps/packages globs flagged empty': stale.emptyGlobs.length === 2,
    'plain-only css has no violations': goodPartition.violations.length === 0,
    'plain-only css yields two source globs': goodPartition.sourceGlobs.length === 2,
    '@source not is captured, not dropped': bannedPartition.violations.length === 1,
    '@source not is classified as banned (kind "not")':
      bannedPartition.violations[0]?.kind === 'not',
    '@source not does not count as a usable glob': bannedPartition.sourceGlobs.length === 1,
    '@source inline(...) is not a violation': inlinePartition.violations.length === 0,
    '@source inline(...) is tracked separately from source globs':
      inlinePartition.inlineStatements.length === 1 && inlinePartition.sourceGlobs.length === 1,
    'an unrecognised @source shape is captured, not dropped':
      malformedPartition.violations.length === 1,
    'an unrecognised @source shape is classified "unrecognized"':
      malformedPartition.violations[0]?.kind === 'unrecognized',
    '[a-z] bracket class matches a lowercase-led segment': bracketClass.test(
      `${root}/pillars/finance/src/index.ts`
    ),
    '[a-z] bracket class rejects an uppercase-led segment': !bracketClass.test(
      `${root}/pillars/Finance/src/index.ts`
    ),
    '[!Z] negation excludes the listed char': !negatedClass.test(
      `${root}/pillars/Zeta/src/index.ts`
    ),
    '[!Z] negation accepts an unlisted char': negatedClass.test(
      `${root}/pillars/finance/src/index.ts`
    ),
    '[^Z] negation behaves the same as [!Z]': !caretNegatedClass.test(
      `${root}/pillars/Zeta/src/index.ts`
    ),
    '[0-9] range matches a digit': rangeClass.test(`${root}/pillars/9food/src/index.ts`),
    '[0-9] range rejects a non-digit': !rangeClass.test(`${root}/pillars/afood/src/index.ts`),
    'a negated class never matches a path separator': !segmentGuard.test(`${root}/x//y`),
    'a negated class still matches an ordinary char': segmentGuard.test(`${root}/x/a/y`),
    'a positive class listing `/` still refuses to match a path separator':
      !positiveSegmentGuard.test(`${root}/x//y`),
    'that same positive class still matches its other listed member': positiveSegmentGuard.test(
      `${root}/x/a/y`
    ),
    'a `]` immediately after `[` is a literal class member': leadingBracketLiteral.test(
      `${root}/]bc`
    ),
    'that same class still matches its other listed member': leadingBracketLiteral.test(
      `${root}/abc`
    ),
    'an unterminated `[` falls back to a literal character': unterminatedBracket.test(
      `${root}/[abc`
    ),
    'a bare directory source scans everything beneath it': globToRegExp(
      absoluteSourceGlob(appDir, './src')
    ).test(`${appDir}/src/pages/deep/Page.tsx`),
    'a shell sheet over libs + the shell reaches no pillar': shellSplit.reachesPillars.length === 0,
    'a shell sheet over libs + the shell leaves none of them unscanned':
      shellSplit.uncovered.length === 0,
    'a shell sheet that scans pillars/** is flagged, naming the pillar file':
      shellScanningPillars.reachesPillars.includes(`${root}/pillars/finance/app/src/Dashboard.tsx`),
    'a shell sheet that stopped scanning the shell is flagged':
      shellMissingItself.uncovered.includes(`${root}/pillars/shell/src/main.tsx`),
    'an entry is followed through @import into the theme':
      shellCollected.sources.length === 2 && shellCollected.missing.length === 0,
    'a @source in the referenced tokens reaches the pillar sheet (why rule 2 exists)':
      leakyRemote.sources.some((s) => s.glob === `${root}/libs/**/*`),
    'an entry that does not exist is reported missing': missingEntry.missing.length === 1,
    'tokens importing tailwindcss without source(none) are flagged': tokensDetectAutomatically(
      "@import 'tailwindcss';\n"
    ),
    'tokens importing tailwindcss with source(none) pass': !tokensDetectAutomatically(
      "@import 'tailwindcss' source(none);\n@import 'tw-animate-css';\n"
    ),
    'a sound remote build has no problems': remote({}).length === 0,
    'a remote build with no stylesheet entry is flagged': remote({ css: undefined }).length === 1,
    'a remote sheet without source(none) is flagged': remote({
      css: goodRemoteCss.replace(' source(none)', ''),
    }).some((p) => p.includes('source(none)')),
    'a remote sheet outside layer(utilities) is flagged': remote({
      css: goodRemoteCss.replace(' layer(utilities)', ''),
    }).some((p) => p.includes('layer(utilities)')),
    'a remote sheet that does not reference the tokens is flagged': remote({
      css: goodRemoteCss.replace("@reference '@pops/ui/theme/globals.css';", ''),
    }).some((p) => p.includes('@reference')),
    'a remote sheet scanning outside its app is flagged': remote({
      absGlobs: [...appGlobs, `${root}/libs/**/*`],
    }).some((p) => p.includes('outside the app')),
    'a remote sheet that misses its own source is flagged': remote({
      absGlobs: [absoluteSourceGlob(appDir, './src/other')],
    }).some((p) => p.includes('does not scan')),
  };

  const ok = Object.values(checks).every(Boolean);
  if (ok) {
    console.log(
      'self-test OK — guard flags empty (stale) globs, uncovered UI files, banned and ' +
        'unrecognised @source statements, a shell sheet reaching into a pillar, a scan in the ' +
        'shared tokens, and a pillar remote build without a sound stylesheet entry; passes a ' +
        'correct tree.'
    );
  } else {
    console.error('SELF-TEST FAILED — guard did not behave as expected:');
    for (const [label, passed] of Object.entries(checks)) {
      console.error(`  ${passed ? 'OK' : 'XX'}  ${label}`);
    }
  }
  return ok;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/check-tailwind-source-coverage.mjs [--self-test]\n' +
        'Asserts the shell sheet covers libs/ and the shell and no other pillar, every pillar\n' +
        'remote build has a sound stylesheet entry, and every UI file is scanned by some entry.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  process.exit(run() ? 0 : 1);
}

if (import.meta.main) {
  main();
}
