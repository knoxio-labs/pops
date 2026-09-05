#!/usr/bin/env node
/**
 * Drizzle migration journal integrity guard.
 *
 * Every pillar's `migrations/meta/_journal.json` is hand-maintained, and the
 * convention is to stamp a new entry's `when` by incrementing the previous
 * entry's by one. Two branches cut from the same base therefore mint the
 * SAME `when`, and git resolves the resulting conflict as a plain text
 * conflict — nothing tells the resolver that the number carries meaning.
 *
 * It does. `pendingMigrations` (libs/sdk/src/db/migration-journal.ts) mirrors
 * drizzle's own `created_at < folderMillis` comparison, so an entry whose
 * `when` equals the recorded timestamp counts as ALREADY APPLIED. Keep both
 * colliding entries and the second one is permanently skipped on every
 * database that took the first: the table it creates never exists, the
 * backfill it performs never runs.
 *
 * No test catches that. A fresh database has no recorded timestamp, so the
 * whole journal is pending and both entries apply — which is what every
 * migration test, data-safety test and fresh-volume image smoke test builds
 * from. The failure is reachable only on a database that already applied the
 * first entry, i.e. only in production. Found for real in POPS-2866, where
 * finance idx 40 was minted twice on two branches (POPS-2804, POPS-2852).
 *
 * Rules, per journal:
 *   - `when` values are unique. Two entries sharing one make the later
 *     unreachable — this is the merge collision, and the load-bearing rule.
 *   - `idx` values are unique. Two branches appending both take `last + 1`,
 *     so a duplicate `idx` is the same collision seen from the other side and
 *     is caught even if the `when` values were separately fixed up.
 *   - every entry's `tag` has a matching `<tag>.sql` file, and every `.sql`
 *     file has an entry. Either half missing is a rename that updated the
 *     journal and not the file, or the file and not the journal.
 *   - the file parses and carries the fields the migrator reads.
 *
 * Deliberately NOT asserted:
 *   - `when` ascending. It is not globally ascending by design: finance opens
 *     with `0053_finance_pillar_baseline`, whose `when` is newer than the
 *     `0025`–`0052` entries that follow it, because the baseline CREATEs the
 *     tables they ALTER. `readMigrationJournal`'s docstring explains why the
 *     apply order is the array's, not the timestamps'.
 *   - `idx` contiguous from 0. POPS-2866 proposed this, but the real tree
 *     disagrees: registry runs 0..10 then 12..16, a number skipped when the
 *     journal was hand-authored during the core→registry split. Nothing ever
 *     occupied idx 11, and a gap harms nothing — drizzle applies the array in
 *     order and selects on `when`. Uniqueness catches the collision this
 *     guard exists for; contiguity would only fail the tree as it stands.
 *
 * Usage:
 *   node scripts/ci/check-migration-journals.mjs              check the real tree
 *   node scripts/ci/check-migration-journals.mjs --self-test  prove the guard reports
 *
 * Exit 0 when every journal is intact; non-zero on any violation, a failed
 * self-test, or a discovery result too small to be believable.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/**
 * @typedef {object} Violation
 * @property {string} file  Repo-relative path of the journal.
 * @property {string} rule  Short machine-ish rule name, for the report.
 * @property {string} message  What is wrong, in one line.
 */

/**
 * @typedef {object} Journal
 * @property {string} journalPath  Repo-relative path of `meta/_journal.json`.
 * @property {string} migrationsDir  Repo-relative path of the migrations dir.
 * @property {string[]} sqlFiles  `.sql` file names in that dir, unsorted.
 */

/**
 * Group the values of `items` by `key`, keeping only the groups with more
 * than one member — i.e. exactly the duplicates.
 *
 * @template T
 * @param {readonly T[]} items
 * @param {(item: T) => string} key
 * @returns {Map<string, T[]>}
 */
function duplicatesBy(items, key) {
  /** @type {Map<string, T[]>} */
  const groups = new Map();
  for (const item of items) {
    const k = key(item);
    const bucket = groups.get(k);
    if (bucket === undefined) groups.set(k, [item]);
    else bucket.push(item);
  }
  for (const [k, bucket] of groups) {
    if (bucket.length < 2) groups.delete(k);
  }
  return groups;
}

/**
 * Every integrity violation in one journal.
 *
 * Pure: takes the journal's raw text and the `.sql` file names sitting beside
 * it rather than reading either, so the self-test and the vitest suite can
 * plant fixtures the real tree does not contain.
 *
 * @param {string} relPath  Repo-relative path of the journal, for the report.
 * @param {string} source  Raw contents of `_journal.json`.
 * @param {readonly string[]} sqlFiles  `.sql` file names in the migrations dir.
 * @returns {Violation[]}
 */
export function findJournalViolations(relPath, source, sqlFiles) {
  /** @type {Violation[]} */
  const violations = [];
  /** @param {string} rule @param {string} message */
  const report = (rule, message) => violations.push({ file: relPath, rule, message });

  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    report('unparseable', `not valid JSON: ${error instanceof Error ? error.message : error}`);
    return violations;
  }

  const entries = /** @type {{ entries?: unknown }} */ (parsed)?.entries;
  if (!Array.isArray(entries)) {
    report('malformed', 'has no `entries` array — the migrator cannot read this journal');
    return violations;
  }

  /** @type {{ idx: number, when: number, tag: string }[]} */
  const wellFormed = [];
  for (const [position, entry] of entries.entries()) {
    const { idx, when, tag } = /** @type {Record<string, unknown>} */ (entry ?? {});
    if (typeof idx !== 'number' || typeof when !== 'number' || typeof tag !== 'string') {
      report(
        'malformed-entry',
        `entry at position ${position} is missing a numeric \`idx\`, a numeric \`when\`, or a ` +
          'string `tag`'
      );
      continue;
    }
    wellFormed.push({ idx, when, tag });
  }

  for (const [when, group] of duplicatesBy(wellFormed, (e) => String(e.when))) {
    const tags = group.map((e) => e.tag).join(', ');
    report(
      'duplicate-when',
      `\`when\` ${when} is shared by ${group.length} entries (${tags}) — every entry after the ` +
        'first is skipped on any database that already applied the first, because ' +
        '`pendingMigrations` keeps only entries with `when` strictly greater than the recorded ' +
        'timestamp. Re-stamp the later one.'
    );
  }

  for (const [idx, group] of duplicatesBy(wellFormed, (e) => String(e.idx))) {
    const tags = group.map((e) => e.tag).join(', ');
    report(
      'duplicate-idx',
      `\`idx\` ${idx} is shared by ${group.length} entries (${tags}) — two branches each ` +
        'appended at the same index. Renumber the later one.'
    );
  }

  const sqlSet = new Set(sqlFiles);
  for (const entry of wellFormed) {
    if (!sqlSet.has(`${entry.tag}.sql`)) {
      report(
        'missing-sql',
        `entry \`${entry.tag}\` (idx ${entry.idx}) has no \`${entry.tag}.sql\` beside it — the ` +
          'migrator will fail on this entry at boot'
      );
    }
  }

  const taggedSql = new Set(wellFormed.map((entry) => `${entry.tag}.sql`));
  for (const file of [...sqlFiles].toSorted((a, b) => a.localeCompare(b))) {
    if (!taggedSql.has(file)) {
      report(
        'orphan-sql',
        `\`${file}\` has no journal entry — it will never be applied to any database`
      );
    }
  }

  return violations;
}

/**
 * Every `pillars/<id>/migrations/meta/_journal.json` on disk, with the `.sql`
 * files sitting beside it. Nothing hardcodes the pillar list, so a new
 * pillar's journal is covered without touching this file.
 *
 * @returns {Journal[]}
 */
export function discoverJournals() {
  const pillarsRoot = join(repoRoot, 'pillars');
  if (!existsSync(pillarsRoot)) return [];
  /** @type {Journal[]} */
  const found = [];
  for (const entry of readdirSync(pillarsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const migrationsDir = join(pillarsRoot, entry.name, 'migrations');
    const journalAbs = join(migrationsDir, 'meta', '_journal.json');
    if (!existsSync(journalAbs)) continue;
    const sqlFiles = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((file) => file.isFile() && file.name.endsWith('.sql'))
      .map((file) => file.name);
    found.push({
      journalPath: relative(repoRoot, journalAbs).split(sep).join('/'),
      migrationsDir: relative(repoRoot, migrationsDir).split(sep).join('/'),
      sqlFiles,
    });
  }
  return found.toSorted((a, b) => a.journalPath.localeCompare(b.journalPath));
}

/**
 * A floor on discovery. Eleven pillars own a SQLite database and a journal
 * today — a number near zero means the walk broke, not that the pillars
 * stopped having migrations.
 */
const MIN_DISCOVERED_JOURNALS = 8;

/**
 * Drive the guard against the real tree.
 *
 * @returns {boolean}
 */
function run() {
  const journals = discoverJournals();
  if (journals.length < MIN_DISCOVERED_JOURNALS) {
    console.error(
      `Discovery found only ${journals.length} migration journal(s), below the floor of ` +
        `${MIN_DISCOVERED_JOURNALS}. The walk is broken — this is not a clean tree.`
    );
    return false;
  }

  /** @type {Violation[]} */
  const violations = [];
  for (const journal of journals) {
    violations.push(
      ...findJournalViolations(
        journal.journalPath,
        readFileSync(join(repoRoot, journal.journalPath), 'utf8'),
        journal.sqlFiles
      )
    );
  }

  console.log(`Checked ${journals.length} migration journal(s).`);
  if (violations.length === 0) {
    console.log('OK — every journal has unique `when` and `idx` values and matches its SQL files.');
    return true;
  }

  console.error(`FAIL — ${violations.length} journal violation(s):`);
  for (const v of violations) {
    console.error(`  XX  ${v.file}  [${v.rule}]  ${v.message}`);
  }
  console.error(
    '  A journal entry is selected by its `when`, not its position: `pendingMigrations` keeps ' +
      'only entries newer than the timestamp the database recorded. A duplicate therefore ' +
      'disappears silently on every database that is not brand new, which is every database ' +
      'that matters. See scripts/ci/check-migration-journals.mjs and POPS-2866.'
  );
  return false;
}

/**
 * Synthetic fixtures proving the guard's actual, documented coverage.
 *
 * ADR-045: a guard ships with a test proving it REPORTS, not merely that it
 * passes on today's tree. The collision this guard exists for cannot be
 * planted in the real tree — it only exists mid-merge — so every claim in the
 * success message below is backed by a fixture here.
 *
 * @returns {boolean}
 */
function selfTest() {
  /** @param {{ idx: number, when: number, tag: string }[]} entries */
  const journal = (entries) => JSON.stringify({ version: '7', dialect: 'sqlite', entries });
  const sql = (/** @type {string[]} */ ...tags) => tags.map((tag) => `${tag}.sql`);

  const clean = journal([
    { idx: 0, when: 1000, tag: '0001_a' },
    { idx: 1, when: 1001, tag: '0002_b' },
  ]);
  const collidingWhen = journal([
    { idx: 0, when: 1000, tag: '0001_a' },
    { idx: 1, when: 1000, tag: '0002_b' },
  ]);
  const collidingIdx = journal([
    { idx: 0, when: 1000, tag: '0001_a' },
    { idx: 0, when: 1001, tag: '0002_b' },
  ]);
  const gappedIdx = journal([
    { idx: 0, when: 1000, tag: '0001_a' },
    { idx: 2, when: 1001, tag: '0002_b' },
  ]);
  const descendingWhen = journal([
    { idx: 0, when: 2000, tag: '0001_a' },
    { idx: 1, when: 1001, tag: '0002_b' },
  ]);
  const missingSql = journal([{ idx: 0, when: 1000, tag: '0001_a' }]);
  const badEntry = journal(/** @type {never} */ ([{ idx: 0, when: '1000', tag: '0001_a' }]));

  const rulesOf = (/** @type {Violation[]} */ hits) => hits.map((v) => v.rule);

  const checks = {
    'stays silent on a clean journal':
      findJournalViolations('j', clean, sql('0001_a', '0002_b')).length === 0,
    'reports two entries sharing a `when`': rulesOf(
      findJournalViolations('j', collidingWhen, sql('0001_a', '0002_b'))
    ).includes('duplicate-when'),
    'reports two entries sharing an `idx`': rulesOf(
      findJournalViolations('j', collidingIdx, sql('0001_a', '0002_b'))
    ).includes('duplicate-idx'),
    'does NOT report a gap in `idx` (registry runs 0..10 then 12..16)':
      findJournalViolations('j', gappedIdx, sql('0001_a', '0002_b')).length === 0,
    'does NOT report a descending `when` (finance opens with its baseline)':
      findJournalViolations('j', descendingWhen, sql('0001_a', '0002_b')).length === 0,
    'reports an entry whose .sql file is absent': rulesOf(
      findJournalViolations('j', missingSql, [])
    ).includes('missing-sql'),
    'reports a .sql file with no entry': rulesOf(
      findJournalViolations('j', missingSql, sql('0001_a', '0002_stray'))
    ).includes('orphan-sql'),
    'reports a journal that is not valid JSON': rulesOf(
      findJournalViolations('j', '{ not json', [])
    ).includes('unparseable'),
    'reports a journal with no `entries` array': rulesOf(
      findJournalViolations('j', '{"version":"7"}', [])
    ).includes('malformed'),
    'reports an entry whose `when` is not a number': rulesOf(
      findJournalViolations('j', badEntry, sql('0001_a'))
    ).includes('malformed-entry'),
    'reports every collision, not just the first': (() => {
      const three = journal([
        { idx: 0, when: 1000, tag: '0001_a' },
        { idx: 1, when: 1000, tag: '0002_b' },
        { idx: 2, when: 1000, tag: '0003_c' },
      ]);
      const hits = findJournalViolations('j', three, sql('0001_a', '0002_b', '0003_c'));
      return hits.length === 1 && hits[0]?.message.includes('3 entries');
    })(),
  };

  const ok = Object.values(checks).every(Boolean);
  if (ok) {
    console.log(
      'self-test OK — guard reports a duplicate `when`, a duplicate `idx`, an entry with no ' +
        '.sql file, a .sql file with no entry, an unparseable journal, a journal with no ' +
        '`entries`, and an entry missing a required field; stays silent on a clean journal, ' +
        'on a gap in `idx`, and on a descending `when`.'
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
      'Usage: node scripts/ci/check-migration-journals.mjs [--self-test]\n' +
        'Fails if any pillars/<id>/migrations/meta/_journal.json has a duplicate `when` or\n' +
        '`idx`, an entry with no .sql file, or a .sql file with no entry. A duplicate `when`\n' +
        'makes the later entry unreachable on every database that applied the earlier one.'
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
