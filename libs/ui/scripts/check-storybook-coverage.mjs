#!/usr/bin/env node
/**
 * Two independent Storybook invariants for `@pops/ui`; either one failing
 * exits 1.
 *
 * ## 1. Alias coverage — every frontend pillar is reachable
 *
 * Every frontend `@pops/app-*` workspace package must be enumerated as a Vite
 * source alias in `libs/ui/.storybook/main.ts`, AND each alias's replacement
 * path must resolve to that package's real `app/src` directory.
 *
 * Storybook is `@pops/ui`'s dev surface (P2-T04): it renders pillar-frontend
 * stories and resolves the `@pops/app-*` specifiers those stories reach
 * through to each pillar's `app/src` via Vite `resolve.alias`. The alias —
 * not a `package.json` devDependency — is how the dev surface consumes the
 * frontends: a `ui → app-*` workspace edge would both trip the federation
 * isolation guard (scripts/ci/check-lib-no-pillar-import.mjs) and form a
 * `tsc -b` project-reference cycle, since every `@pops/app-*` depends on
 * `@pops/ui`.
 *
 * A package is considered a frontend surface (and therefore eligible for
 * Storybook) if its name is `@pops/app-*` and it has `src/routes.tsx`.
 * Server-only siblings and the overlay package are excluded by that filter.
 *
 * Frontend app packages are colocated inside their owning pillar at
 * `pillars/<pillar>/app/` (PRD-253); discovery walks those pillar app dirs.
 *
 * Three failure modes are caught:
 *   1. A frontend package with NO alias — its stories cannot resolve the
 *      pillar they render.
 *   2. An alias whose `replacement` points at a missing or WRONG directory —
 *      e.g. `@pops/app-ai` mapped at pillars/registry/app/src (which does
 *      not exist) instead of `pillars/ai/app/src`. The original key-only check
 *      passed this silently; the alias only breaks once an AI-pillar story is
 *      filed. Validating the resolved path makes that drift loud at CI time.
 *   3. Discovering no frontend package at all, which the earlier version of
 *      this guard reported as a clean run (ADR-045).
 *
 * ## 2. Story coverage — every shared component is in Storybook
 *
 * Delegated to `story-coverage.mjs`, which owns both the rule and the reason
 * it is phrased the way it is.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkStoryCoverage,
  listExportedComponentModules,
  listStoryFiles,
} from './story-coverage.mjs';
import { STORY_COVERAGE_ALLOWLIST } from './storybook-coverage-allowlist.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PILLARS_DIR = resolve(HERE, '../../../pillars');
const STORYBOOK_DIR = resolve(HERE, '../.storybook');
const UI_SRC_DIR = resolve(HERE, '../src');

/**
 * Discover frontend app packages: each pillar's `app/` dir that has a
 * `src/routes.tsx` and a `@pops/app-*` package name. Returns the package name
 * paired with the absolute `app/src` dir its Storybook alias must resolve to.
 *
 * @param {string} [pillarsDir]
 * @returns {{ name: string, srcDir: string }[]}
 */
export function listFrontendAppPackages(pillarsDir = PILLARS_DIR) {
  return readdirSync(pillarsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(pillarsDir, entry.name, 'app'))
    .filter((appDir) => {
      try {
        statSync(resolve(appDir, 'src/routes.tsx'));
        return true;
      } catch {
        return false;
      }
    })
    .map((appDir) => ({
      name: JSON.parse(readFileSync(resolve(appDir, 'package.json'), 'utf8')).name,
      srcDir: resolve(appDir, 'src'),
    }))
    .filter((pkg) => typeof pkg.name === 'string' && pkg.name.startsWith('@pops/app-'))
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

/**
 * Parse `@pops/app-*` aliases from `main.ts`, resolving each
 * `path.resolve(__dirname, '<rel>')` replacement (relative to the `.storybook`
 * dir, which is `main.ts`'s own `__dirname`) to an absolute path.
 *
 * @param {string} [storybookDir]
 * @returns {{ name: string, replacement: string }[]}
 */
export function readAliases(storybookDir = STORYBOOK_DIR) {
  const source = readFileSync(resolve(storybookDir, 'main.ts'), 'utf8');
  const pattern =
    /find:\s*'(@pops\/app-[a-z0-9-]+)'\s*,\s*replacement:\s*path\.resolve\(\s*__dirname\s*,\s*'([^']+)'\s*\)/g;
  return [...source.matchAll(pattern)].map((m) => ({
    name: m[1],
    replacement: resolve(storybookDir, m[2]),
  }));
}

/**
 * Compare discovered frontend packages against the parsed aliases.
 *
 * @param {{ name: string, srcDir: string }[]} packages
 * @param {{ name: string, replacement: string }[]} aliases
 * @returns {string[]} human-readable violations, empty when clean
 */
export function checkAliasCoverage(packages, aliases) {
  if (packages.length === 0) {
    return [
      'no frontend @pops/app-* package was discovered at all — pillar app discovery is broken.',
    ];
  }

  /** @type {string[]} */
  const errors = [];
  const aliasByName = new Map(aliases.map((a) => [a.name, a]));
  for (const pkg of packages) {
    const alias = aliasByName.get(pkg.name);
    if (!alias) {
      errors.push(
        `${pkg.name}: no Vite alias in .storybook/main.ts — its stories cannot resolve the pillar they render.`
      );
    } else if (!existsSync(alias.replacement)) {
      errors.push(
        `${pkg.name}: alias points at a non-existent path ${alias.replacement} — expected ${pkg.srcDir}.`
      );
    } else if (alias.replacement !== pkg.srcDir) {
      errors.push(
        `${pkg.name}: alias points at the wrong pillar ${alias.replacement} — expected ${pkg.srcDir}.`
      );
    }
  }
  return errors;
}

/**
 * @param {string} heading
 * @param {string[]} errors
 * @param {string} remedy
 */
function report(heading, errors, remedy) {
  if (errors.length === 0) return;
  console.error(heading);
  for (const message of errors) console.error(`  - ${message}`);
  console.error(`\n${remedy}`);
}

/**
 * @returns {boolean} true when both invariants hold
 */
export function run() {
  const packages = listFrontendAppPackages();
  const aliasErrors = checkAliasCoverage(packages, readAliases());

  const componentModules = listExportedComponentModules(UI_SRC_DIR);
  const storyFiles = listStoryFiles(UI_SRC_DIR);
  const coverageErrors = checkStoryCoverage({
    srcDir: UI_SRC_DIR,
    componentModules,
    storyFiles,
    allowlist: STORY_COVERAGE_ALLOWLIST,
  });

  report(
    'Storybook alias problems in libs/ui/.storybook/main.ts:',
    aliasErrors,
    'Each @pops/app-* frontend needs a `resolve.alias` whose replacement is its own `pillars/<pillar>/app/src`.'
  );
  report(
    'Storybook story-coverage problems in libs/ui/src:',
    coverageErrors,
    'Every component @pops/ui exports needs a story. Add one next to the component, or add the ' +
      'module to libs/ui/scripts/storybook-coverage-allowlist.mjs with a reason.'
  );
  if (aliasErrors.length > 0 || coverageErrors.length > 0) return false;

  const allowlisted = Object.keys(STORY_COVERAGE_ALLOWLIST).length;
  process.stdout.write(
    `@pops/ui storybook aliases all ${packages.length} frontend @pops/app-* packages to their app/src, ` +
      `and ${componentModules.length - allowlisted} of ${componentModules.length} exported component ` +
      `modules are storied (${allowlisted} allowlisted) across ${storyFiles.length} story files.\n`
  );
  return true;
}

if (import.meta.main) {
  process.exit(run() ? 0 : 1);
}
