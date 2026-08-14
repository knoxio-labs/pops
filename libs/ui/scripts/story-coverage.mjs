/**
 * Story coverage for `@pops/ui`: every `.tsx` or `.ts` module the
 * `src/index.ts` barrel re-exports (i.e. every module that publishes a
 * component to the pillars) must be imported by at least one `*.stories.tsx`
 * file, or carry an entry in `storybook-coverage-allowlist.mjs`. `.ts` counts
 * too — a component built with `React.createElement` instead of JSX needs no
 * `.tsx` extension and would otherwise never enter the subject set
 * (POPS-2178). Whether a given `.ts` export is *actually* a component is a
 * PascalCase-name heuristic, the same one `.tsx` discovery already runs on;
 * it is not exact for either extension.
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
export function readComponentExports(source) {
  const isComponentName = (/** @type {string} */ name) =>
    /^[A-Z]/.test(name) && !/^[A-Z0-9_]+$/.test(name);

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
  for (const match of source.matchAll(/export\s+\{([^}]*)\}/gs)) {
    for (const clause of match[1].split(',')) {
      const trimmed = clause.trim();
      if (!trimmed || trimmed.startsWith('type ')) continue;
      const [local, alias] = trimmed.includes(' as ')
        ? trimmed.split(' as ').map((part) => part.trim())
        : [trimmed, trimmed];
      // `export { Foo as default }` forwards `Foo` — `default` itself is
      // never PascalCase, so the aliased-to name is the one worth checking.
      const exported = alias === 'default' ? local : alias;
      if (isComponentName(exported)) names.add(exported);
    }
  }
  return [...names];
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
 * with `React.createElement` and never need JSX syntax at all — POPS-2178.
 * The heuristic is the same PascalCase-export test `readComponentExports`
 * already applies to `.tsx`; it is not an "is this actually a component"
 * check and cannot be — it will treat a PascalCase-named non-component `.ts`
 * export (an enum, a class that is not a component, a constant object) as a
 * subject the same way it already would if that export lived in a `.tsx`
 * file. `isRoot` exists to keep that heuristic from firing on the crawl's
 * own entry point: `src/index.ts` legitimately re-exports dozens of
 * PascalCase names via `export { X, Y } from './somewhere'`, and without this
 * guard the barrel itself would be flagged as an unstoried "component
 * module" purely for aggregating other modules' exports. A barrel reached by
 * recursion (a nested `components/widgets/index.ts`) is not exempted the
 * same way — same as an intermediate `.tsx` forwarder, it becomes a subject
 * in its own right if it re-exports a PascalCase name directly.
 *
 * @param {string} file — absolute path
 * @param {Set<string>} visited — absolute paths already walked, mutated
 * @param {Set<string>} modules — absolute paths of discovered component
 *   modules, mutated
 * @param {boolean} [isRoot] — true only for the initial `src/index.ts` call
 * @returns {void}
 */
function collectComponentModules(file, visited, modules, isRoot = false) {
  if (visited.has(file)) return;
  visited.add(file);

  const source = readFileSync(file, 'utf8');
  const isComponentFile = file.endsWith('.tsx') || file.endsWith('.ts');
  if (!isRoot && isComponentFile && readComponentExports(source).length > 0) {
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
  collectComponentModules(barrel, new Set(), modules, true);
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
