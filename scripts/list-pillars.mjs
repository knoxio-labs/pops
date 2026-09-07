#!/usr/bin/env node
/**
 * Disk discovery of the pillar set, and the CLI that feeds
 * `pillar-schema-coverage.yml`'s job matrix.
 *
 * This is one module and not two so the matrix and the guard cannot disagree:
 * `check-pillar-schema-coverage.mjs` imports the same functions the matrix is
 * built from, rather than a `find` that agrees with them only by inspection.
 * A pillar whose `src/db/schema.ts` barrel is renamed used to fall out of both
 * at once — no job in the matrix and a green workflow (POPS-1629).
 *
 * It is a **separate file** from the guard for one reason: the `discover` job
 * runs install-free (ADR-045 Tier A), and the guard reads TypeScript with the
 * compiler's own AST. A `typescript` import in the module the matrix job loads
 * would be a `MODULE_NOT_FOUND` inside a required check. Nothing here imports
 * anything but node builtins, and `scripts/ci/__tests__/guard-job-tiers.test.ts`
 * proves it by loading this file with no `node_modules` reachable.
 *
 * Usage:
 *   node scripts/list-pillars.mjs
 *
 * Prints the discovered pillar names as a JSON array on stdout; every
 * diagnostic goes to stderr so the JSON stays machine-readable. Exit 0 when
 * discovery is whole, 1 when a pillar carries a persistence surface that
 * discovery cannot see.
 */

import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

/**
 * @typedef {object} Pillar
 * @property {string} name    Pillar dir name, e.g. `finance`.
 * @property {string} pkgDir  Repo-relative pillar root, e.g. `pillars/finance`.
 */

/**
 * Discover the pillar set from disk. A pillar is any `pillars/<x>` that
 * exposes a `src/db/schema.ts` barrel — the canonical signal that it owns
 * a migrated schema surface the coverage guard can check. No static list.
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
 * The pillars the coverage guard would want to check and cannot: a
 * `pillars/<x>` carrying a `migrations/` or a `src/db/` directory but exposing
 * no `src/db/schema.ts` barrel for `discoverPillars` to find.
 *
 * Discovery by one hardcoded filename means a renamed barrel does not fail
 * the guard, it removes the pillar from it — and nine of ten pillars passing
 * prints exactly the same as ten of ten. The workflow builds its job matrix
 * from the same discovery, so the pillar loses its CI job too and the workflow
 * still reports green. Naming the pillars that fell out is what makes that
 * difference visible; the CLI below turns the list into a failure.
 *
 * A `pillars/<x>` with neither directory is not a candidate — plenty of
 * units under `pillars/` legitimately persist nothing.
 *
 * Nor is a pillar without a root `package.json`. The guard reads drizzle
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

/**
 * Report the pillars that carry a persistence surface discovery cannot see,
 * and say what it costs.
 *
 * @param {string[]} unanalysable Result of {@link discoverUnanalysablePillars}.
 * @param {(line: string) => void} [log]
 * @returns {boolean} True when nothing fell out of discovery.
 */
export function reportUnanalysablePillars(unanalysable, log = console.error) {
  if (unanalysable.length === 0) return true;
  log(
    `FAIL — ${unanalysable.length} pillar(s) carry a migrations/ or src/db/ ` +
      'directory but expose no src/db/schema.ts barrel, so the coverage guard cannot see them ' +
      'and neither can the job matrix derived from the same discovery:'
  );
  for (const name of unanalysable) log(`  - pillars/${name}`);
  log(
    '\nEither restore the barrel at src/db/schema.ts, or — if the pillar genuinely ' +
      'persists nothing — remove the migrations/ and src/db/ directories that say it does. ' +
      'Silently dropping out of the guard is the one outcome that is not available (ADR-045).'
  );
  return false;
}

function main() {
  const whole = reportUnanalysablePillars(discoverUnanalysablePillars());
  console.log(JSON.stringify(discoverPillars().map((p) => p.name)));
  return whole ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main());
}
