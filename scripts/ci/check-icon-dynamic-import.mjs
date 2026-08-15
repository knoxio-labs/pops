#!/usr/bin/env node
/**
 * Dynamic-import icon guard.
 *
 * `.oxlintrc.json`'s `no-restricted-imports` bans specific `lucide-react`
 * names on STATIC `import`/`export … from` declarations, plus (POPS-2100)
 * any static `lucide-react/*` deep subpath outright. Neither reaches a
 * dynamic form: `const { PenLine } = await import('lucide-react')` and
 * `require('lucide-react')` are runtime expressions, invisible to a rule
 * that only inspects declaration nodes (verified against the real oxlint
 * 1.77.0 binary — see the ticket this guard closes).
 *
 * Rather than trying to determine which name a dynamic call destructures at
 * runtime — undecidable in general, since the bound name lives in whatever
 * pattern follows the `await`, not in the call itself — this guard mirrors
 * POPS-2100's own resolution: ban the whole dynamic-call SHAPE outright, for
 * the whole package and any subpath, regardless of which name is later
 * pulled off the result. There is no code-splitting reason to lazy-load a
 * single UI icon from a library already in the main bundle, so the shape
 * itself is the violation.
 *
 * What this guard resolves statically, and what it deliberately does not:
 *
 *   - A bare or double-quoted string literal argument to `import()` /
 *     `require()` — resolved exactly, whether it is the call's only
 *     argument, has a trailing comma (`` import('lucide-react',) ``), or is
 *     followed by a second argument such as import attributes
 *     (`` import('lucide-react', { with: { type: 'json' } }) ``). The
 *     specifier is fully known from the first argument alone, so whatever
 *     follows a comma does not change whether it targets `lucide-react`.
 *   - A template-literal argument with NO interpolation (`` import(`lucide-react`) ``)
 *     — resolved exactly, same as a string literal.
 *   - A template-literal argument whose STATIC leading quasi is a
 *     `lucide-react/` subpath prefix, with an interpolated tail
 *     (`` import(`lucide-react/${iconFile}`) ``) — resolved and flagged: this is
 *     the "interpolated banned-name-shaped path" case named in the ticket.
 *     A leading quasi of exactly `lucide-react` with no slash before the
 *     interpolation (`` import(`lucide-react${x}`) ``) is NOT flagged, but not
 *     because it is unreachable — it is not: if the interpolated value itself
 *     starts with `/` (e.g. `` `lucide-react${'/dist/esm/icons/pen-line'}` ``),
 *     the resulting specifier reaches straight into the package. What makes
 *     this shape unresolvable is that its reachability depends entirely on a
 *     value this guard cannot see without evaluating the interpolation — the
 *     same undecidability as string concatenation (`'lucide-react' + x`),
 *     just spelled with a template literal. It is grouped with the other
 *     genuinely undecidable cases below and gets the same fail-open
 *     treatment, not a claim that the specifier can never resolve.
 *   - A same-file, single-hop variable trace: `const spec = 'lucide-react';`
 *     followed later by `import(spec)` in the same file. This is a bounded,
 *     literal-only, one-hop lookup — no cross-file constants, no
 *     reassignment tracking, no destructuring, no shadowing awareness. An
 *     optional TypeScript type annotation between the identifier and `=` is
 *     tolerated (`const spec: string = 'lucide-react';`) — matched as the
 *     general shape (anything between `:` and the assignment `=` that is not
 *     itself a `=`, `;`, or newline), not as an enumerated list of annotation
 *     spellings. A union, a generic, an import type, or a template-literal
 *     type all satisfy that shape without naming any of them individually;
 *     only an annotation containing a bare `=` (a default type parameter, a
 *     function type) falls outside it, and such an annotation on a
 *     string-literal-initialised const does not occur in this tree.
 *
 *   Genuinely UNDECIDABLE, and NOT flagged (fails OPEN, not closed):
 *     - a computed specifier (`import(getModuleName())`, a ternary, string
 *       concatenation, a member expression);
 *     - a template literal whose leading quasi is `lucide-react` with no
 *       static slash before the interpolation (`` import(`lucide-react${x}`) ``)
 *       — whether it reaches the package depends on `x`;
 *     - a variable whose value comes from another file, a function
 *       parameter, or more than one hop of local assignment;
 *     - `require()` reached through a wrapper function rather than written
 *       directly at the call site.
 *   Failing closed on these (flagging every `import()`/`require()` call this
 *   guard cannot resolve) was rejected: this guard scans ALL frontend
 *   source, and dynamic imports with a variable specifier are a common,
 *   legitimate pattern elsewhere in the tree (locale bundles, route-level
 *   code splitting) that have nothing to do with icons. Flagging all of them
 *   to catch a shape with zero real occurrences would make the guard noisy
 *   enough to be worked around rather than fixed. False negatives on this
 *   narrow, undecidable slice are the accepted trade-off — the same one
 *   `check-icon-only-buttons.mjs` documents for a `size` prop it cannot
 *   statically resolve.
 *
 * A STATIC `export * from 'lucide-react'` / `export { PenLine } from
 * 'lucide-react'` is already a declaration node oxlint's
 * `no-restricted-imports` inspects, so it is out of this guard's scope —
 * verified against the real oxlint binary in
 * `scripts/ci/__tests__/check-icon-dynamic-import.test.ts`.
 *
 * This is text-based scanning (like `import-scan.mjs`, which it reuses for
 * comment/regex-safe stripping), not an AST. A `lucide-react` specifier
 * shape sitting inside an unrelated string literal — e.g. a fixture that
 * builds `import('lucide-react')` as text — reads the same as a real call
 * and is flagged, matching `import-scan.mjs`'s own stated trade-off: string
 * and template literal CONTENT is kept verbatim because that is exactly
 * where a real specifier lives.
 *
 * Usage:
 *   node scripts/ci/check-icon-dynamic-import.mjs              check the real tree
 *   node scripts/ci/check-icon-dynamic-import.mjs --self-test  prove the guard reports
 *
 * Exit 0 when no dynamic call reaches `lucide-react`; non-zero on any
 * violation, a failed self-test, or a discovery result too small to be
 * believable.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stripComments } from './import-scan.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** Roots scanned: every frontend source tree in the workspace. */
const SCAN_ROOTS = ['pillars', 'libs'];

/** Directory names never walked. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  'storybook-static',
  '.next',
  '.turbo',
]);

/** Source file extensions inspected. */
const SOURCE_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

/**
 * Asserts `import`/`require` is not itself the tail of a longer identifier —
 * `foo.import(`, `myimport(`, `reimport(` must not match. This replaced an
 * enumerated leading-character class (`[\s;(,=:!&|?{}\n]`) that had to list
 * every punctuation mark that can legally precede a call expression and, by
 * construction, always missed one — that omission (no `[`, no bare `=>`, no
 * `+ - * / % < > ~ ^` , no backtick) is exactly what let
 * `Promise.all([import('lucide-react')])` and `()=>import('lucide-react')`
 * through. A call expression can be preceded by almost any punctuation, a
 * keyword (`return`, `yield`, `await`, `typeof`), or nothing (start of
 * file/expression) — the one thing that must NOT precede it is another
 * identifier character or `.`, because that would make `import`/`require`
 * part of a longer name or a property access rather than the call itself.
 * Asserting the negative is both shorter and exhaustive by construction —
 * over the ASCII identifier characters `\w` matches. Without the `u` flag,
 * `\w` does not cover non-ASCII identifier characters, so a non-ASCII
 * prefix (e.g. `Ωimport('lucide-react')`) is not excluded and would
 * false-positive. No identifier in this repo is non-ASCII, so that gap is
 * accepted rather than closed.
 */
const NOT_PRECEDED_BY_IDENTIFIER = String.raw`(?<![\w$.])`;

/**
 * What can legally follow the specifier argument, once it has already been
 * matched: either the call ends right there (a bare `)`, the shape this
 * guard has always matched), or a `,` — meaning there is more to the
 * argument list. That covers a bare trailing comma (`import('x',)`) and a
 * second argument of any shape (`import('x', { with: { type: 'json' } })`)
 * alike, without enumerating either one: the specifier is already fully
 * resolved by the time this fires, so nothing past the comma changes
 * whether it targets `lucide-react` — only whether the call happens to take
 * more arguments than one.
 */
const CALL_TAIL = String.raw`\s*(?:,|\))`;

/**
 * A dynamic `import()`/`require()` call whose first argument is a plain
 * string literal or a template literal. Deliberately does NOT match a static
 * `import … from`/`export … from` declaration — see file header.
 */
const DYNAMIC_CALL_RE = new RegExp(
  `${NOT_PRECEDED_BY_IDENTIFIER}(?:await\\s+)?(import|require)\\s*\\(\\s*(?:['"]([^'"]*)['"]|\`([^\`]*)\`)${CALL_TAIL}`,
  'gm'
);

/** A dynamic call whose first argument is a bare identifier. */
const DYNAMIC_IDENT_CALL_RE = new RegExp(
  `${NOT_PRECEDED_BY_IDENTIFIER}(?:await\\s+)?(import|require)\\s*\\(\\s*([A-Za-z_$][\\w$]*)${CALL_TAIL}`,
  'gm'
);

/**
 * `const IDENT = '...'` / `` const IDENT = `...` `` (no interpolation), with
 * an optional TypeScript type annotation between the identifier and `=` —
 * `const IDENT: TYPE = '...'`. `TYPE` is matched as the general shape
 * (anything up to the assignment `=` that is not itself a `=`, `;`, or
 * newline) rather than an enumerated list of annotation spellings, so a
 * union, a generic, an import type, or a template-literal type are all
 * covered without naming any of them.
 */
const CONST_STRING_RE =
  /(?:^|[\s;])(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=;\n]+)?\s*=\s*(?:['"]([^'"]*)['"]|`([^`]*)`)\s*[;\n]/gm;

/**
 * True if a resolved specifier string reaches `lucide-react` — the bare
 * package or any subpath.
 *
 * @param {string} specifier
 * @returns {boolean}
 */
function targetsLucideReact(specifier) {
  return specifier === 'lucide-react' || specifier.startsWith('lucide-react/');
}

/**
 * Resolve a template literal's raw content (between the backticks, verbatim)
 * to a specifier string, or `null` if it cannot be resolved to one that
 * could ever reach `lucide-react`.
 *
 * @param {string} content
 * @returns {string | null}
 */
function resolveTemplateContent(content) {
  const interpAt = content.indexOf('${');
  if (interpAt === -1) return content;
  const leadingQuasi = content.slice(0, interpAt);
  return leadingQuasi.startsWith('lucide-react/') ? leadingQuasi : null;
}

/**
 * @typedef {object} Violation
 * @property {string} file  Repo-relative path.
 * @property {number} line  1-indexed line the call starts on.
 * @property {'import'|'require'} form
 * @property {string} via   Human-readable description of how the specifier resolved.
 */

/**
 * 1-based line number of `offset` in `code`.
 *
 * @param {string} code
 * @param {number} offset
 * @returns {number}
 */
function lineAt(code, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < code.length; i += 1) {
    if (code[i] === '\n') line += 1;
  }
  return line;
}

/**
 * Pure core: find every dynamic `import()`/`require()` call reaching
 * `lucide-react` in one file's source. No I/O, so the self-test and unit
 * tests drive it over synthetic strings.
 *
 * @param {string} relPath
 * @param {string} source
 * @returns {Violation[]}
 */
export function findViolations(relPath, source) {
  const code = stripComments(source);
  /** @type {Violation[]} */
  const violations = [];

  for (const match of code.matchAll(DYNAMIC_CALL_RE)) {
    const form = /** @type {'import'|'require'} */ (match[1]);
    const stringLiteral = match[2];
    const templateLiteral = match[3];
    let resolved = null;
    let via = '';
    if (stringLiteral !== undefined) {
      resolved = stringLiteral;
      via = `${form}('${stringLiteral}')`;
    } else if (templateLiteral !== undefined) {
      resolved = resolveTemplateContent(templateLiteral);
      via = `${form}(\`${templateLiteral}\`)`;
    }
    if (resolved !== null && targetsLucideReact(resolved)) {
      violations.push({ file: relPath, line: lineAt(code, match.index ?? 0), form, via });
    }
  }

  /** @type {Map<string, string>} */
  const literalConsts = new Map();
  for (const match of code.matchAll(CONST_STRING_RE)) {
    const [, ident, stringLiteral, templateLiteral] = match;
    const value = stringLiteral !== undefined ? stringLiteral : (templateLiteral ?? null);
    if (ident && value !== null) literalConsts.set(ident, value);
  }
  for (const match of code.matchAll(DYNAMIC_IDENT_CALL_RE)) {
    const form = /** @type {'import'|'require'} */ (match[1]);
    const ident = match[2];
    const value = ident ? literalConsts.get(ident) : undefined;
    if (value !== undefined && targetsLucideReact(value)) {
      violations.push({
        file: relPath,
        line: lineAt(code, match.index ?? 0),
        form,
        via: `${form}(${ident}) — ${ident} = '${value}'`,
      });
    }
  }

  return violations.toSorted((a, b) => a.line - b.line);
}

/**
 * Every source file under the scan roots, repo-relative and POSIX-style.
 *
 * @returns {string[]}
 */
function discoverFiles() {
  /** @type {string[]} */
  const found = [];
  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const dot = entry.name.lastIndexOf('.');
      if (dot < 0 || !SOURCE_EXT.has(entry.name.slice(dot))) continue;
      found.push(relative(repoRoot, abs).split(sep).join('/'));
    }
  };
  for (const root of SCAN_ROOTS) {
    const abs = join(repoRoot, root);
    if (existsSync(abs)) walk(abs);
  }
  return found.toSorted((a, b) => a.localeCompare(b));
}

/**
 * A floor on discovery (ADR-045): this repo has thousands of frontend/lib
 * source files, so a number near zero means the walk broke, not that the
 * tree is clean.
 */
const MIN_DISCOVERED_FILES = 500;

/**
 * Drive the guard against the real tree.
 *
 * @returns {boolean}
 */
function run() {
  const files = discoverFiles();
  if (files.length < MIN_DISCOVERED_FILES) {
    console.error(
      `Discovery found only ${files.length} source file(s), below the floor of ` +
        `${MIN_DISCOVERED_FILES}. The walk is broken — this is not a clean tree.`
    );
    return false;
  }

  /** @type {Violation[]} */
  const violations = [];
  for (const file of files) {
    violations.push(...findViolations(file, readFileSync(join(repoRoot, file), 'utf8')));
  }

  console.log(`Scanned ${files.length} source file(s) for a dynamic lucide-react import.`);
  if (violations.length === 0) {
    console.log('OK — no dynamic import()/require() call reaches lucide-react.');
    return true;
  }

  console.error(`FAIL — ${violations.length} dynamic lucide-react import(s):`);
  for (const v of violations) {
    console.error(`  XX  ${v.file}:${v.line}  ${v.via}`);
  }
  console.error(
    '\nDynamic import()/require() of lucide-react (whole package or any subpath) is banned — ' +
      'it bypasses the static no-restricted-imports vocabulary gate entirely (Action Icon ' +
      'Standards, AGENTS.md). Import the icon statically instead.'
  );
  return false;
}

/**
 * Synthetic fixtures proving the guard reports every resolvable dynamic form
 * (string literal, template literal without interpolation, template literal
 * with an interpolated subpath tail, require(), a same-file single-hop
 * variable trace, the same trace through a type-annotated const, a call as
 * the first element of an array literal, a call immediately after `=>` with
 * no space, a call with a second argument such as import attributes, and a
 * call with a bare trailing comma), stays silent on the shapes documented as
 * undecidable, and stays silent on a static import/dynamic import of an
 * unrelated package — including the same second-argument, trailing-comma,
 * and type-annotated-const shapes, so a resolved-but-unrelated specifier is
 * still correctly ignored.
 *
 * @returns {boolean}
 */
function selfTest() {
  const dirty = [
    "const a = await import('lucide-react');",
    'const b = require("lucide-react/dist/esm/icons/pen-line");',
    'const c = await import(`lucide-react`);',
    'const iconFile = pick();',
    'const d = import(`lucide-react/${iconFile}`);',
    "const spec = 'lucide-react';",
    'const e = await import(spec);',
    "Promise.all([import('lucide-react')]);",
    "const j = () =>import('lucide-react');",
    "const l = await import('lucide-react', { with: { type: 'json' } });",
    "const m = await import('lucide-react',);",
    "const specTyped: string = 'lucide-react';",
    'const eTyped = await import(specTyped);',
  ].join('\n');

  const clean = [
    "import { Pencil } from 'lucide-react';",
    "export { Pencil } from 'lucide-react';",
    "export * from 'lucide-react';",
    "const f = await import('some-other-package');",
    'const g = import(`lucide-react${suffix}`);',
    'const h = import(computeSpecifier());',
    "const other = 'not-lucide-react';",
    'const i = await import(other);',
    "// const commented = await import('lucide-react');",
    "const k = foo.import('lucide-react');",
    "myimport('lucide-react');",
    "const n = await import('some-other-package', { with: { type: 'json' } });",
    "const o = await import('some-other-package',);",
    "const otherTyped: string = 'not-lucide-react';",
    'const pTyped = await import(otherTyped);',
  ].join('\n');

  const dirtyHits = findViolations('pillars/x/app/src/A.tsx', dirty);
  const cleanHits = findViolations('pillars/x/app/src/B.tsx', clean);
  const dirtyLines = new Set(dirtyHits.map((v) => v.line));

  const checks = {
    'reports a bare string-literal dynamic import': dirtyLines.has(1),
    'reports a string-literal require() subpath': dirtyLines.has(2),
    'reports a no-interpolation template-literal import': dirtyLines.has(3),
    'reports an interpolated-subpath template-literal import': dirtyLines.has(5),
    'reports a same-file single-hop variable-traced import': dirtyLines.has(7),
    'reports a call as the first element of an array literal': dirtyLines.has(8),
    'reports a call immediately after `=>` with no space': dirtyLines.has(9),
    'reports a call with a second argument (import attributes)': dirtyLines.has(10),
    'reports a call with a bare trailing comma and no second argument': dirtyLines.has(11),
    'reports a same-file single-hop variable trace through a type-annotated const':
      dirtyLines.has(13),
    'reports every dirty line, not just the first': dirtyHits.length === 10,
    "does not flag a static named import (oxlint's job)": !cleanHits.some((v) => v.line === 1),
    'does not flag a static export-from re-export': !cleanHits.some(
      (v) => v.line === 2 || v.line === 3
    ),
    'does not flag a dynamic import of an unrelated package': !cleanHits.some((v) => v.line === 4),
    'does not flag a template literal with no static slash before the interpolation (undecidable — depends on the interpolated value, not provably unreachable)':
      !cleanHits.some((v) => v.line === 5),
    'does not flag a computed/undecidable specifier (fails open)': !cleanHits.some(
      (v) => v.line === 6
    ),
    'does not flag an unrelated variable-traced import': !cleanHits.some((v) => v.line === 8),
    'does not flag a commented-out dynamic import': !cleanHits.some((v) => v.line === 9),
    'does not flag `import` as a property access (foo.import(...))': !cleanHits.some(
      (v) => v.line === 10
    ),
    'does not flag `import`/`require` as a substring of a longer identifier (myimport(...))':
      !cleanHits.some((v) => v.line === 11),
    'does not flag a second argument on an unrelated package': !cleanHits.some(
      (v) => v.line === 12
    ),
    'does not flag a trailing comma on an unrelated package': !cleanHits.some((v) => v.line === 13),
    'does not flag a type-annotated const holding an unrelated package': !cleanHits.some(
      (v) => v.line === 15
    ),
    'clean fixture reports nothing at all': cleanHits.length === 0,
  };

  const ok = Object.values(checks).every(Boolean);
  if (ok) {
    console.log(
      'self-test OK — guard reports every resolvable dynamic-import/require shape reaching ' +
        'lucide-react, and stays silent on the documented-undecidable and out-of-scope shapes.'
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
      'Usage: node scripts/ci/check-icon-dynamic-import.mjs [--self-test]\n' +
        "Asserts no dynamic import()/require() call reaches 'lucide-react' (whole package or\n" +
        'any subpath), the bypass no-restricted-imports cannot see.'
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
