/**
 * Story coverage for `@pops/ui`: every `.tsx` or `.ts` module the
 * `src/index.ts` barrel re-exports (i.e. every module that publishes a
 * component to the pillars) must be imported by at least one `*.stories.tsx`
 * file, or carry an entry in `storybook-coverage-allowlist.mjs`. `.ts` counts
 * too — a component built with `React.createElement` instead of JSX needs no
 * `.tsx` extension and would otherwise never enter the subject set. Whether a
 * given export is *actually* a component is a heuristic for both extensions,
 * and neither is exact. `.tsx` discovery is a plain PascalCase-name test.
 * `.ts` discovery is narrower — a PascalCase name only counts when its own
 * declaration is function/arrow/class-extends shaped, or is a single call to
 * a known component wrapper (`memo`, `forwardRef`) around such a shape, *and*
 * the file shows a `createElement` signal — because a `.ts` file is exactly
 * where a zod schema, a token map, or a plain class is likely to sit under a
 * PascalCase name with no rendering intent at all; see
 * `readComponentExports`'s `requireTsComponentShape` for the exact rule,
 * `KNOWN_COMPONENT_WRAPPERS` for the wrapper set, and what it all still
 * cannot decide. A module whose only PascalCase exports are forwards
 * of another module's names — `export { X } from './y'` — is a barrel, not a
 * subject, at any depth: see `isBarrelModule`.
 *
 * "Imported by a story" is the rule rather than "is the `component:` of a
 * story meta" because the compound primitives (Accordion, Tabs, Table…) are
 * legitimately rendered through `render:` with no `component:` key at all, and
 * a meta-only rule would report every one of them as missing.
 *
 * The allowlist is a ratchet, not an escape hatch: an entry whose module has
 * since gained a story, or whose module is no longer exported at all, is
 * itself a violation. A *new* entry is accepted here — what stops the list
 * growing silently is the size pinned in
 * `scripts/__tests__/check-storybook-coverage.test.ts`.
 *
 * Per ADR-045 discovery reports rather than passes when it loses its subject:
 * a missing barrel throws, and zero component modules or zero story files are
 * each a violation with their own message. `scripts/__tests__/` covers all of
 * them.
 *
 * The unit of enforcement is the *module*, not the individual component: a
 * module counts as storied once any story imports something from it, not
 * once every PascalCase name it exports is individually storied. This is a
 * deliberate simplification, not an oversight. The alternative was measured
 * against this repo's actual compound-primitive files — `primitives/table.tsx`,
 * `primitives/dialog.tsx`, `primitives/select.tsx`, `primitives/popover.tsx`,
 * `primitives/command.tsx`, `primitives/alert-dialog.tsx`,
 * `primitives/dropdown-menu.tsx`, `primitives/collapsible.tsx` — each exports
 * several sub-component names (e.g. `TableRow`, `TableCell`, `TableHeader`)
 * that their own stories render but never spell out as a distinct imported
 * identifier, because they're reached through the primary component's JSX
 * tree, not imported standalone. Requiring every export name to appear as its
 * own story import would flag most of these files' sub-exports as "missing" —
 * a flood of false demands on already-covered, working stories — for the same
 * property the module-level rule already grants the `render:`-vs-`component:`
 * distinction above. The real gap this file's per-module scope leaves open —
 * appending an unrelated new component to an already-storied file ships it
 * unstoried — is real and stays open by this choice; it is documented, not
 * silently accepted, in `checkStoryCoverage`'s test suite.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

/**
 * Resolve a relative import specifier to the file it names, trying the
 * extensions and the directory-index forms a bundler would.
 *
 * @param {string} fromDir
 * @param {string} specifier
 * @returns {string | null} absolute path, or null when nothing on disk matches
 */
export function resolveRelativeImport(fromDir, specifier) {
  const base = resolve(fromDir, specifier);
  const candidates = [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    resolve(base, 'index.tsx'),
    resolve(base, 'index.ts'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Every value-import specifier in a source file. `import type` statements are
 * skipped: re-exporting a component's prop types is not rendering it.
 *
 * Matches both quote styles rather than anchoring on oxfmt's single-quote
 * convention — a formatter setting is not a contract this discovery scan
 * should depend on to keep seeing its subject.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function readValueImportSpecifiers(source) {
  const pattern = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^;]*?)from\s+(['"])([^'"]+)\3/g;
  return [...source.matchAll(pattern)].filter((m) => !m[1]).map((m) => m[4]);
}

/**
 * Every *re-export* specifier (`export ... from '...'`) in a source file —
 * deliberately excluding plain `import` statements.
 *
 * This is the specifier set a barrel walk must follow: a component file's
 * ordinary `import` of a same-directory helper (e.g. `ComboboxSelect.tsx`
 * importing `ComboboxSelect.popover.tsx` to compose its own render tree) is
 * not the file publishing that helper as a separate subject — the barrel
 * never re-exports it, so no pillar can import it standalone, so it is not a
 * module this gate should demand its own story for. Only `export ... from`
 * forwards a target on to whatever imports *this* file, which is the only
 * relationship a barrel-discovery walk should recurse through.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function readReexportSpecifiers(source) {
  const pattern = /(?:^|\n)\s*export\s+(type\s+)?([^;]*?)from\s+(['"])([^'"]+)\3/g;
  return [...source.matchAll(pattern)].filter((m) => !m[1]).map((m) => m[4]);
}

/**
 * PascalCase value exports of a module — the components it publishes.
 * SCREAMING_SNAKE constants and `export type` are excluded; both are exported
 * from component modules and neither is renderable.
 *
 * A default export is named by whatever identifier it forwards — `export
 * default function Foo`, `export default Foo;` (referencing an earlier
 * declaration) and `export { Foo as default }` all count as publishing `Foo`.
 * A default export with no recoverable identifier (an anonymous
 * `export default () => null;` or `export default function () {}`) is not a
 * shape this repo's components use today; it is not detected here.
 *
 * @param {string} source
 * @returns {string[]}
 */
function isComponentName(/** @type {string} */ name) {
  return /^[A-Z]/.test(name) && !/^[A-Z0-9_]+$/.test(name);
}

/**
 * PascalCase names declared directly in a module: `export function Foo`,
 * `export const Foo = …`, `export class Foo`, `export default Foo;`.
 * Excludes names that only ever appear inside `export { … }` clauses, since
 * those clauses need their own `from`-clause check to tell a local export
 * apart from a forward — see {@link readBraceExportOrigins}.
 *
 * @param {string} source
 * @returns {Set<string>}
 */
function readDeclaredComponentNames(source) {
  /** @type {Set<string>} */
  const names = new Set();
  const declarations = [
    /export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/g,
    /export\s+(?:const|let|var)\s+([A-Za-z0-9_]+)/g,
    /export\s+(?:abstract\s+)?class\s+([A-Za-z0-9_]+)/g,
    /export\s+default\s+([A-Za-z0-9_]+)\s*;/g,
  ];
  for (const pattern of declarations) {
    for (const match of source.matchAll(pattern)) {
      if (isComponentName(match[1])) names.add(match[1]);
    }
  }
  return names;
}

/**
 * PascalCase names carried by `export { … }` clauses, split by whether the
 * clause forwards from another module (`export { X } from './y'`) or merely
 * re-exports an already-local declaration (`export { X };`). The two read
 * identically to {@link readComponentExports}, which does not care where a
 * name came from — but barrel detection does: a name that only exists
 * because this file forwards it is not this file publishing a component.
 *
 * @param {string} source
 * @returns {{ local: Set<string>, forwarded: Set<string> }}
 */
function readBraceExportOrigins(source) {
  /** @type {Set<string>} */
  const local = new Set();
  /** @type {Set<string>} */
  const forwarded = new Set();
  const pattern = /export\s+\{([^}]*)\}(?:\s*from\s*(['"])([^'"]+)\2)?/gs;
  for (const match of source.matchAll(pattern)) {
    const isForward = match[3] !== undefined;
    for (const clause of match[1].split(',')) {
      const trimmed = clause.trim();
      if (!trimmed || trimmed.startsWith('type ')) continue;
      const [clauseLocal, alias] = trimmed.includes(' as ')
        ? trimmed.split(' as ').map((part) => part.trim())
        : [trimmed, trimmed];
      // `export { Foo as default }` forwards `Foo` — `default` itself is
      // never PascalCase, so the aliased-to name is the one worth checking.
      const exported = alias === 'default' ? clauseLocal : alias;
      if (!isComponentName(exported)) continue;
      (isForward ? forwarded : local).add(exported);
    }
  }
  return { local, forwarded };
}

/**
 * Whether `name`'s own declaration in `source` has a shape a component could
 * plausibly have: a function declaration, an arrow function, or a class that
 * extends a base class. A plain object literal (`export const Tokens =
 * {...}`), a call expression (`export const Schema = z.object({...})`), or a
 * class with no `extends` are excluded — none of them render anything.
 *
 * This is a syntactic pattern match, not a parse: it looks for the shape
 * anywhere `name`'s declaration reads in the source, not a scoped AST lookup.
 * It can be fooled by a second, unrelated declaration of the same identifier
 * elsewhere in the file (rare, and TypeScript itself would reject the
 * redeclaration in most such cases).
 *
 * @param {string} source
 * @param {string} name
 * @returns {boolean}
 */
function isFunctionOrClassShaped(source, name) {
  const patterns = [
    new RegExp(`function\\s+${name}\\s*\\(`),
    new RegExp(
      `(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=\\s*(?:\\([^)]*\\)|[A-Za-z_$][\\w$]*)\\s*=>`
    ),
    new RegExp(`class\\s+${name}\\s+extends\\s+`),
  ];
  return patterns.some((pattern) => pattern.test(source));
}

/**
 * The React exports this repo actually wraps components in. `forwardRef` is
 * in production use today — `grep -rln forwardRef libs/ui/src` finds it in
 * ten files (`Button.tsx`, `TextInput.tsx`, `RadioInput.tsx`, `Select.tsx`,
 * `CheckboxInput.tsx`, `Chip.tsx`, `ChipInput.tsx`, `DateTimeInput.tsx`,
 * `NumberInput.tsx`, `primitives/label.tsx`), always as `export const Foo =
 * forwardRef<Ref, Props>((props, ref) => …)`. `memo` has zero hits anywhere
 * in this repo as of writing (`grep -rn '\bmemo(' .` across the whole tree
 * matches nothing but a test mock's unrelated `React.forwardRef`) — it is
 * listed anyway because it is React's other canonical wrapper and the
 * ticket that opened this gap names it explicitly; the day someone writes
 * one, this list should not need editing again for it to be seen. No third
 * wrapper turned up in the same sweep (no `observer(`, `connect(`,
 * `withRouter(`, or `styled(` in this codebase) — a wrapper genuinely not on
 * this list still reads as non-component-shaped, same false-negative-fails-
 * closed trade-off `isFunctionOrClassShaped` already accepts.
 */
const KNOWN_COMPONENT_WRAPPERS = ['memo', 'forwardRef'];

/**
 * Whether `wrapperName` (one of {@link KNOWN_COMPONENT_WRAPPERS}) is
 * imported from `react` in `source` — either named (`import { forwardRef }
 * from 'react'`) or reached through a `React` namespace/default import
 * (`import * as React from 'react'`/`import React from 'react'`, covering
 * `React.forwardRef(...)`). This exists so a same-named export from some
 * other package (`import { memo } from 'a-memoization-lib'`) does not get
 * mistaken for React's wrapper — without it, {@link isWrappedComponentShaped}
 * would match on identifier text alone and turn a same-name collision into a
 * false *positive*, the direction `requireTsComponentShape` is built to
 * avoid. It does not verify `wrapperName` specifically appears inside an
 * `import * as React` clause's usage (that would need real scope analysis) —
 * only that some React-namespace import exists in the file — so it can still
 * be fooled by a second, differently-sourced `React` identifier shadowing
 * the real one; that is the same "not a scoped AST lookup" caveat
 * {@link isFunctionOrClassShaped} already carries.
 *
 * @param {string} source
 * @param {string} wrapperName
 * @returns {boolean}
 */
function isReactWrapperImported(source, wrapperName) {
  const patterns = [
    new RegExp(`import\\s*\\{[^}]*\\b${wrapperName}\\b[^}]*\\}\\s*from\\s*(['"])react\\1`),
    /import\s+(?:\*\s+as\s+React|React)\b[^;]*from\s*(['"])react\1/,
  ];
  return patterns.some((pattern) => pattern.test(source));
}

/**
 * Whether `name`'s own declaration in `source` assigns the result of calling
 * exactly one known component wrapper (see {@link KNOWN_COMPONENT_WRAPPERS})
 * whose own argument is itself an arrow function or a named/anonymous
 * function expression: `export const Foo = memo(() => …)`, `export const Bar
 * = forwardRef<Ref, Props>((props, ref) => …)`. Bare and `React.`-qualified
 * callees both match, and a generic argument list between the wrapper name
 * and its call parens is tolerated. The matched wrapper additionally has to
 * be imported from `react` (see {@link isReactWrapperImported}) — a same-
 * named export from an unrelated package does not count.
 *
 * Only a single call is unwrapped — `memo(forwardRef(...))` does not match,
 * the same one-hop-only choice `isFunctionOrClassShaped` makes for the
 * unwrapped case. Nor does an aliased import — `import { forwardRef as fr }
 * from 'react'; export const Foo = fr(...)` — since the callee text `fr` is
 * not in {@link KNOWN_COMPONENT_WRAPPERS}. Both are false negatives, which
 * fail closed the same way the rest of this narrowing does.
 *
 * This function does not look at what the inner function *returns*: `memo(()
 * => ({ not: 'an element' }))` matches exactly as happily as `memo(() =>
 * createElement('div'))`. Telling those apart is left entirely to the
 * file-level `createElement` signal in {@link hasCreateElementSignal} — the
 * second gate `readComponentExports` already requires. A non-component
 * wrapped in `memo` inside a file that also contains a genuine
 * `createElement`-built component elsewhere would still be misread as a
 * subject; that residual gap is not closed here.
 *
 * @param {string} source
 * @param {string} name
 * @returns {boolean}
 */
function isWrappedComponentShaped(source, name) {
  const match = new RegExp(
    `(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=\\s*(React\\.)?(${KNOWN_COMPONENT_WRAPPERS.join('|')})\\s*(?:<[\\s\\S]*?>)?\\s*\\(\\s*(?:(?:\\([^)]*\\)|[A-Za-z_$][\\w$]*)\\s*=>|function\\b)`
  ).exec(source);
  return match ? isReactWrapperImported(source, match[2]) : false;
}

/**
 * Whether `source` shows any sign of building React elements imperatively —
 * the only way a `.ts` file can be a component, since that extension does not
 * permit JSX syntax at all. Requires both a `react` import and a call that
 * looks like `createElement(...)`, so `React.createElement` and a destructured
 * `createElement` both count, but a file that merely imports `react` for its
 * types (or calls an unrelated `createElement`-named function of its own)
 * does not.
 *
 * @param {string} source
 * @returns {boolean}
 */
function hasCreateElementSignal(source) {
  return /from\s+['"]react['"]/.test(source) && /\bcreateElement\s*\(/.test(source);
}

/**
 * PascalCase value exports of a module — the components it publishes.
 * SCREAMING_SNAKE constants and `export type` are excluded; both are exported
 * from component modules and neither is renderable.
 *
 * A default export is named by whatever identifier it forwards — `export
 * default function Foo`, `export default Foo;` (referencing an earlier
 * declaration) and `export { Foo as default }` all count as publishing `Foo`.
 * A default export with no recoverable identifier (an anonymous
 * `export default () => null;` or `export default function () {}`) is not a
 * shape this repo's components use today; it is not detected here.
 *
 * `requireTsComponentShape` narrows the PascalCase-name heuristic for `.ts`
 * files: a locally declared or locally re-exported name is only kept when its
 * own declaration is function/arrow/class-extends shaped (see
 * {@link isFunctionOrClassShaped}) OR is a single call to a known component
 * wrapper around such a shape (`memo`, `forwardRef` — see
 * {@link isWrappedComponentShaped}), AND the file shows a `createElement`
 * signal (see {@link hasCreateElementSignal}). This is still a heuristic, not
 * a type check: it cannot see through a wrapper two deep
 * (`memo(forwardRef(...))`), a wrapper reached through an aliased import
 * (`import { forwardRef as fr } from 'react'`), or a wrapper from a
 * non-React library — all three read as a plain call expression and are
 * excluded, a false negative that fails closed the same way the unwrapped
 * case always has (the module quietly does not demand a story rather than
 * wrongly flagging one). It never applies to a *forwarded* name (`export {
 * X } from './y'`) — the module that actually declares `X` is checked on its
 * own terms when the walk reaches it.
 *
 * `.tsx` discovery is untouched: it keeps the plain PascalCase-name
 * heuristic, with the same false-positive risk this narrowing exists to
 * close for `.ts` — a `.tsx` file's real subjects are overwhelmingly actual
 * components in practice, so tightening it further was not this ticket's
 * scope.
 *
 * @param {string} source
 * @param {{ requireTsComponentShape?: boolean }} [options]
 * @returns {string[]}
 */
export function readComponentExports(source, options = {}) {
  const { requireTsComponentShape = false } = options;
  const declared = readDeclaredComponentNames(source);
  const { local, forwarded } = readBraceExportOrigins(source);
  let ownNames = new Set([...declared, ...local]);
  const isShaped = (name) =>
    hasCreateElementSignal(source) &&
    (isFunctionOrClassShaped(source, name) || isWrappedComponentShaped(source, name));
  if (requireTsComponentShape) ownNames = new Set([...ownNames].filter(isShaped));
  return [...new Set([...ownNames, ...forwarded])];
}

/**
 * A module is a barrel — never a story subject itself, whatever depth it is
 * reached at — when every PascalCase name it exports is a forward
 * (`export { X } from './y'` or `export * from './y'`) and it declares none
 * of them itself. This is a structural property of the module's own source,
 * not a fact about its position in the tree: `src/index.ts` qualifies for
 * exactly the same reason a nested `components/widgets/index.ts` does, so
 * neither needs a special case for "am I the root".
 *
 * A module that forwards a name *and* declares one of its own — e.g.
 * `ScrollShelf.tsx` re-exporting `LazyScrollShelf` alongside its own
 * `ScrollShelf` component — is not a barrel by this rule: it has a real
 * rendering surface of its own, and the forwarded name is still followed to
 * its defining module separately.
 *
 * @param {string} source
 * @returns {boolean}
 */
function isBarrelModule(source) {
  const declared = readDeclaredComponentNames(source);
  if (declared.size > 0) return false;
  const { local, forwarded } = readBraceExportOrigins(source);
  if (local.size > 0) return false;
  return forwarded.size > 0;
}

/**
 * Follow every relative re-export from `file` — recursing through any
 * intermediate barrel, `.ts` or `.tsx`, at any depth — collecting `.tsx` and
 * `.ts` leaves that export a component. A directory grouped behind its own
 * `index.ts` (`export * from './components/widgets'` resolving to
 * `widgets/index.ts`) is exactly the shape this walks through rather than
 * stopping at: the earlier single-hop version skipped any barrel target not
 * itself ending `.tsx`, so a folder-of-components dropped out of the subject
 * set the moment someone grouped it.
 *
 * `.ts` is included, not just `.tsx`, because a component can be declared
 * with `React.createElement` and never need JSX syntax at all. A `.ts`
 * export additionally has to look function/class-shaped, or be a single call
 * to a known component wrapper (`memo`, `forwardRef`) around such a shape,
 * and the file has to show a `createElement` signal (see
 * {@link readComponentExports}'s `requireTsComponentShape`) — narrower than
 * the plain PascalCase-name test `.tsx` still runs. It remains a heuristic,
 * not an "is this actually a component" check: it can still be fooled (a
 * wrapper nested two deep, a wrapper reached through an aliased import, or a
 * wrapper from a library other than React all read as a plain call
 * expression and are silently excluded — a false negative, not a false
 * positive), and `.tsx` files keep the original, looser PascalCase-only test
 * with the same false-positive risk that test has always carried.
 *
 * A module is skipped as a subject when {@link isBarrelModule} says every
 * PascalCase name it exports is forwarded rather than declared — this is
 * what keeps `src/index.ts` and any barrel reached by recursion
 * (`components/widgets/index.ts`) out of the subject set without needing to
 * know it is the crawl's entry point: the rule looks at the file's own
 * exports, not its position in the tree.
 *
 * @param {string} file — absolute path
 * @param {Set<string>} visited — absolute paths already walked, mutated
 * @param {Set<string>} modules — absolute paths of discovered component
 *   modules, mutated
 * @returns {void}
 */
function collectComponentModules(file, visited, modules) {
  if (visited.has(file)) return;
  visited.add(file);

  const source = readFileSync(file, 'utf8');
  const isTsxFile = file.endsWith('.tsx');
  const isTsFile = !isTsxFile && file.endsWith('.ts');
  const exports = readComponentExports(source, { requireTsComponentShape: isTsFile });
  if ((isTsxFile || isTsFile) && exports.length > 0 && !isBarrelModule(source)) {
    modules.add(file);
  }

  const dir = dirname(file);
  for (const specifier of readReexportSpecifiers(source)) {
    if (!specifier.startsWith('.')) continue;
    const target = resolveRelativeImport(dir, specifier);
    if (target) collectComponentModules(target, visited, modules);
  }
}

/**
 * The `.tsx` modules the barrel re-exports, transitively, i.e. the modules
 * whose components the pillars can import from `@pops/ui`.
 *
 * @param {string} srcDir
 * @returns {string[]} absolute paths, sorted
 */
export function listExportedComponentModules(srcDir) {
  const barrel = resolve(srcDir, 'index.ts');
  if (!existsSync(barrel)) {
    throw new Error(
      `@pops/ui barrel not found at ${barrel} — cannot enumerate exported components.`
    );
  }
  /** @type {Set<string>} */
  const modules = new Set();
  collectComponentModules(barrel, new Set(), modules);
  return [...modules].toSorted();
}

/**
 * Every `*.stories.tsx` under a directory tree.
 *
 * @param {string} srcDir
 * @returns {string[]} absolute paths
 */
export function listStoryFiles(srcDir) {
  /** @type {string[]} */
  const found = [];
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const path = resolve(srcDir, entry.name);
    if (entry.isDirectory()) found.push(...listStoryFiles(path));
    else if (entry.name.endsWith('.stories.tsx')) found.push(path);
  }
  return found;
}

/**
 * The set of modules some story file imports for its values.
 *
 * @param {string[]} storyFiles
 * @returns {Set<string>} absolute paths
 */
export function collectStoriedModules(storyFiles) {
  /** @type {Set<string>} */
  const storied = new Set();
  for (const storyFile of storyFiles) {
    for (const specifier of readValueImportSpecifiers(readFileSync(storyFile, 'utf8'))) {
      if (!specifier.startsWith('.')) continue;
      const target = resolveRelativeImport(dirname(storyFile), specifier);
      if (target) storied.add(target);
    }
  }
  return storied;
}

/**
 * @param {string[]} componentModules
 * @param {string[]} storyFiles
 * @returns {string[]}
 */
function checkDiscovery(componentModules, storyFiles) {
  /** @type {string[]} */
  const errors = [];
  if (componentModules.length === 0) {
    errors.push(
      'no exported component module was discovered at all — the src/index.ts barrel scan is broken.'
    );
  }
  if (storyFiles.length === 0) {
    errors.push('no *.stories.tsx file was discovered at all — story discovery is broken.');
  }
  return errors;
}

/**
 * @param {Record<string, string>} allowlist
 * @param {Set<string>} known — src-relative paths of every component module
 * @returns {string[]}
 */
function checkAllowlistEntries(allowlist, known) {
  /** @type {string[]} */
  const errors = [];
  for (const [key, reason] of Object.entries(allowlist)) {
    if (!known.has(key)) {
      errors.push(
        `${key}: allowlisted but is no longer an exported component module — delete the entry.`
      );
    }
    if (typeof reason !== 'string' || reason.trim() === '') {
      errors.push(`${key}: allowlist entry needs a reason explaining why it has no story.`);
    }
  }
  return errors;
}

/**
 * Compare exported component modules against the modules stories import.
 *
 * @param {object} args
 * @param {string} args.srcDir — root the reported paths are relative to
 * @param {string[]} args.componentModules — absolute paths
 * @param {string[]} args.storyFiles — absolute paths
 * @param {Record<string, string>} args.allowlist — src-relative path → reason
 * @returns {string[]} human-readable violations, empty when clean
 */
export function checkStoryCoverage({ srcDir, componentModules, storyFiles, allowlist }) {
  const discoveryErrors = checkDiscovery(componentModules, storyFiles);
  if (discoveryErrors.length > 0) return discoveryErrors;

  const storied = collectStoriedModules(storyFiles);
  /** @type {string[]} */
  const errors = [];
  for (const file of componentModules) {
    const key = relative(srcDir, file);
    const isStoried = storied.has(file);
    const isAllowlisted = allowlist[key] !== undefined;
    if (!isStoried && !isAllowlisted) {
      errors.push(`${key}: exports a component but no story imports it.`);
    } else if (isStoried && isAllowlisted) {
      errors.push(
        `${key}: has a story now — delete its storybook-coverage-allowlist.mjs entry and lower the pinned size in scripts/__tests__/check-storybook-coverage.test.ts.`
      );
    }
  }

  const known = new Set(componentModules.map((file) => relative(srcDir, file)));
  return [...errors, ...checkAllowlistEntries(allowlist, known)];
}
