#!/usr/bin/env node
/**
 * `PRAGMA foreign_keys` in a migration `.sql` file guard.
 *
 * drizzle-orm's sqlite migrator (`SQLiteSyncDialect.migrate`,
 * `drizzle-orm/sqlite-core/dialect.js`) opens ONE transaction around the loop
 * over every pending migration — `BEGIN` before the loop, `COMMIT` after.
 * SQLite documents `PRAGMA foreign_keys` as a no-op while a transaction is
 * open: enforcement stays exactly what it was when the transaction began.
 * So `PRAGMA foreign_keys=OFF;` inside a migration file never does what its
 * author intends — it is silently ignored, and any `ON` companion is
 * therefore just as silently redundant. Both forms are banned outright,
 * along with any other argument (`=1`, `=0`, or none) — none of them do
 * anything inside drizzle's migration transaction, and all of them mislead a
 * reader into thinking enforcement was toggled.
 *
 * The correct technique for a foreign-key-enforced table rebuild is ordering
 * the statements so constraints hold at every point with enforcement ON the
 * whole time — see `pillars/finance/migrations/0057_drop_entities_mirror.sql`.
 *
 * Scans `pillars/<id>/migrations/*.sql` for every pillar directory found on
 * disk — nothing hardcodes the pillar list, so a new pillar's migrations are
 * covered without touching this file.
 *
 * Usage:
 *   node scripts/ci/check-migration-fk-pragma.mjs              check the real tree
 *   node scripts/ci/check-migration-fk-pragma.mjs --self-test  prove the guard reports
 *
 * Exit 0 when no migration file contains `PRAGMA foreign_keys`; non-zero on
 * any violation, a failed self-test, or a discovery result too small to be
 * believable.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** Matches `PRAGMA foreign_keys` in any form — `=OFF`, `=ON`, `=0`, `=1`, or bare. */
const PRAGMA_FK_RE = /PRAGMA\s+foreign_keys\b/iu;

/** A SQL line comment — skipped so a comment merely discussing the pragma isn't flagged. */
const LINE_COMMENT_RE = /^\s*--/u;

/**
 * @typedef {object} Violation
 * @property {string} file  Repo-relative path.
 * @property {number} line  1-indexed line the pragma appears on.
 * @property {string} text  The offending line, trimmed.
 */

/**
 * Pure core: find every `PRAGMA foreign_keys` statement in one migration
 * file's source. No I/O, so the self-test and unit tests drive it over
 * synthetic strings.
 *
 * @param {string} relPath
 * @param {string} source
 * @returns {Violation[]}
 */
export function findViolations(relPath, source) {
  /** @type {Violation[]} */
  const violations = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (LINE_COMMENT_RE.test(line)) continue;
    if (PRAGMA_FK_RE.test(line)) {
      violations.push({ file: relPath, line: i + 1, text: line.trim() });
    }
  }
  return violations;
}

/**
 * Every `pillars/<id>/migrations/*.sql` file, discovered from disk — no
 * hardcoded pillar list, so a new pillar needs no edit here.
 *
 * @returns {string[]} Repo-relative, POSIX-style paths, sorted.
 */
export function discoverMigrationFiles() {
  const pillarsRoot = join(repoRoot, 'pillars');
  if (!existsSync(pillarsRoot)) return [];
  /** @type {string[]} */
  const found = [];
  for (const entry of readdirSync(pillarsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const migrationsDir = join(pillarsRoot, entry.name, 'migrations');
    if (!existsSync(migrationsDir)) continue;
    for (const file of readdirSync(migrationsDir, { withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith('.sql')) continue;
      const abs = join(migrationsDir, file.name);
      found.push(relative(repoRoot, abs).split(sep).join('/'));
    }
  }
  return found.toSorted((a, b) => a.localeCompare(b));
}

/**
 * A floor on discovery. This repo has migrations across a dozen-plus
 * pillars — a number near zero means the walk broke, not that no pillar has
 * migrations.
 */
const MIN_DISCOVERED_FILES = 50;

/**
 * Drive the guard against the real tree.
 *
 * @returns {boolean}
 */
function run() {
  const files = discoverMigrationFiles();
  if (files.length < MIN_DISCOVERED_FILES) {
    console.error(
      `Discovery found only ${files.length} migration file(s), below the floor of ` +
        `${MIN_DISCOVERED_FILES}. The walk is broken — this is not a clean tree.`
    );
    return false;
  }

  /** @type {Violation[]} */
  const violations = [];
  for (const file of files) {
    violations.push(...findViolations(file, readFileSync(join(repoRoot, file), 'utf8')));
  }

  console.log(`Scanned ${files.length} migration file(s) for PRAGMA foreign_keys.`);
  if (violations.length === 0) {
    console.log('OK — no migration file contains PRAGMA foreign_keys.');
    return true;
  }

  console.error(`FAIL — ${violations.length} PRAGMA foreign_keys statement(s) found:`);
  for (const v of violations) {
    console.error(`  XX  ${v.file}:${v.line}  ${v.text}`);
  }
  console.error(
    '  drizzle wraps every pending migration in one transaction (BEGIN before the loop, ' +
      'COMMIT after) — SQLite ignores PRAGMA foreign_keys while a transaction is open, so ' +
      'this statement never does what it appears to. Order the rebuild so constraints hold ' +
      'with enforcement ON the whole time instead — see ' +
      'pillars/finance/migrations/0057_drop_entities_mirror.sql.'
  );
  return false;
}

/**
 * Synthetic fixtures proving the guard reports `PRAGMA foreign_keys` in
 * every form (`=OFF`, `=ON`, `=0`, `=1`, bare, mixed case, no trailing
 * semicolon), stays silent on migration text that never mentions the
 * pragma, and does not flag a SQL comment merely discussing foreign keys
 * (the `0057`-style ordering pattern this guard pushes authors toward).
 *
 * @returns {boolean}
 */
function selfTest() {
  const dirty = [
    'PRAGMA foreign_keys=OFF;',
    'PRAGMA foreign_keys=ON;',
    'PRAGMA foreign_keys = 0;',
    'PRAGMA foreign_keys = 1;',
    'PRAGMA foreign_keys;',
    'pragma FOREIGN_KEYS=off;',
    'PRAGMA foreign_keys=OFF',
  ].join('\n');
  const clean = [
    '-- (otherwise an insert with `foreign_keys = ON` fails once `entities` is gone).',
    '-- do not rely on PRAGMA foreign_keys=OFF, it is a no-op mid-transaction.',
    'CREATE TABLE `__new_budgets` (',
    '\t`id` text PRIMARY KEY NOT NULL',
    ');',
    'DROP TABLE `entities`;',
  ].join('\n');

  const dirtyHits = findViolations('pillars/x/migrations/0001_x.sql', dirty);
  const cleanHits = findViolations('pillars/x/migrations/0002_x.sql', clean);
  const dirtyLines = new Set(dirtyHits.map((v) => v.line));

  const checks = {
    'reports =OFF': dirtyLines.has(1),
    'reports =ON (equally a no-op, equally banned)': dirtyLines.has(2),
    'reports = 0': dirtyLines.has(3),
    'reports = 1': dirtyLines.has(4),
    'reports the bare form with no argument': dirtyLines.has(5),
    'reports case-insensitively': dirtyLines.has(6),
    'reports a statement missing its trailing semicolon': dirtyLines.has(7),
    'reports every dirty line, not just the first': dirtyHits.length === 7,
    'does not flag a comment merely discussing foreign_keys = ON': cleanHits.length === 0,
    'does not flag ordinary migration SQL with no pragma': !cleanHits.some((v) =>
      v.text.includes('CREATE TABLE')
    ),
  };

  const ok = Object.values(checks).every(Boolean);
  if (ok) {
    console.log(
      'self-test OK — guard reports PRAGMA foreign_keys in every form and stays silent on ' +
        'migration text that never uses it.'
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
      'Usage: node scripts/ci/check-migration-fk-pragma.mjs [--self-test]\n' +
        'Fails if any pillars/<id>/migrations/*.sql file contains PRAGMA foreign_keys, in\n' +
        "any form — it is a no-op inside drizzle's single migration-batch transaction."
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
