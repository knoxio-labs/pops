/**
 * Story coverage for `@pops/ui`: every `.tsx` module the `src/index.ts` barrel
 * re-exports (i.e. every module that publishes a component to the pillars)
 * must be imported by at least one `*.stories.tsx` file, or carry an entry in
 * `storybook-coverage-allowlist.mjs`.
 *
 * "Imported by a story" is the rule rather than "is the `component:` of a
 * story meta" because the compound primitives (Accordion, Tabs, Table…) are
 * legitimately rendered through `render:` with no `component:` key at all, and
 * a meta-only rule would report every one of them as missing.
 *
 * The allowlist is a ratchet, not an escape hatch: an entry whose module has
 * since gained a story, or whose module is no longer exported at all, is
 * itself a violation, so the list can only shrink.
 *
 * Per ADR-045 discovery reports rather than passes when it loses its subject:
 * a missing barrel throws, and zero component modules or zero story files are
 * each a violation with their own message. `scripts/__tests__/` covers all of
 * them.
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
 * @param {string} source
 * @returns {string[]}
 */
export function readValueImportSpecifiers(source) {
  const pattern = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^;]*?)from\s+'([^']+)'/g;
  return [...source.matchAll(pattern)].filter((m) => !m[1]).map((m) => m[3]);
}

/**
 * PascalCase value exports of a module — the components it publishes.
 * SCREAMING_SNAKE constants and `export type` are excluded; both are exported
 * from component modules and neither is renderable.
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
      const exported = trimmed.includes(' as ') ? trimmed.split(' as ')[1].trim() : trimmed;
      if (isComponentName(exported)) names.add(exported);
    }
  }
  return [...names];
}

/**
 * The `.tsx` modules the barrel re-exports, i.e. the modules whose components
 * the pillars can import from `@pops/ui`.
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
  for (const specifier of readValueImportSpecifiers(readFileSync(barrel, 'utf8'))) {
    if (!specifier.startsWith('.')) continue;
    const file = resolveRelativeImport(srcDir, specifier);
    if (!file || !file.endsWith('.tsx')) continue;
    if (readComponentExports(readFileSync(file, 'utf8')).length > 0) modules.add(file);
  }
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
        `${key}: has a story now — delete its storybook-coverage-allowlist.mjs entry (the list only shrinks).`
      );
    }
  }

  const known = new Set(componentModules.map((file) => relative(srcDir, file)));
  return [...errors, ...checkAllowlistEntries(allowlist, known)];
}
