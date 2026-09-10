/**
 * A migration may not write a `facet:value` a row could carry unless the
 * vocabulary holds it by the time that migration finishes.
 *
 * `tag_vocabulary` is the only thing that confers standing on a tag value
 * (POPS-2606): every prompt is built from it, and a value absent from it is
 * silently dropped from all of them. So a migration that stamps a tag onto
 * `transactions`, `transaction_tag_rules` or `transaction_corrections` without
 * the value being in the vocabulary at that point leaves the exact
 * inconsistency POPS-2606 removed — a tag on a row that the closed set does
 * not contain.
 *
 * It has already happened once. 0105 appends `occasion:health` to pharmacy
 * rows; a database rebuilt from the journal has no such value, because it was
 * minted in production after the seed. 0105 carries an `INSERT OR IGNORE` for
 * it now, and nothing forced it to — "a test caught this one by accident"
 * (POPS-3301). This is that test, on purpose.
 *
 * ## What this does NOT decide
 *
 * Whether the seeded vocabulary should be brought up to the live set, or the
 * seed documented as a floor with the vocabulary declared runtime state, is
 * POPS-3301's first question and is open. This guard is right under either
 * answer: a migration must not write a value the chain does not have *yet*.
 *
 * ## Why the check is on the SQL, not on the resulting rows
 *
 * A fresh chain has no transactions, so a migration that updates rows touches
 * nothing and a state-based check would see nothing to judge — passing for the
 * one shape it exists to catch. So the literals are read out of the SQL, and
 * every migration is applied in order so the vocabulary can be asked what it
 * held at that step.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { registerFinanceSqlFunctions } from '../open-finance-db.js';
import { TAG_FACET_KINDS } from '../tag-facets.js';

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'migrations'
);

/** The tables whose tag columns a row is read from. */
const TAG_BEARING_TABLES = ['transactions', 'transaction_tag_rules', 'transaction_corrections'];

/** The source of each `json_insert(...)` call, arguments included. */
function jsonInsertCalls(sql: string): string[] {
  const calls: string[] = [];
  for (const match of sql.matchAll(/json_insert\(/giu)) {
    let depth = 1;
    let i = (match.index ?? 0) + match[0].length;
    for (; i < sql.length && depth > 0; i += 1) {
      if (sql[i] === '(') depth += 1;
      else if (sql[i] === ')') depth -= 1;
    }
    calls.push(sql.slice(match.index ?? 0, i));
  }
  return calls;
}

/**
 * The `facet:value` values one migration ADDS to a row, deduplicated.
 *
 * Adding, not mentioning. 0105 names `venue:homewares` a dozen times and never
 * writes it: every mention is a `je.value = 'venue:homewares'` predicate or the
 * strip that removes it. A check that flagged any literal in the file would
 * report that as a missing vocabulary entry, which is the kind of false alarm
 * that gets a guard ignored.
 *
 * `json_insert` is how every tag append in this chain is written. That is the
 * limitation, stated rather than hidden: a migration adding a tag some other
 * way — a whole-array `SET tags = '[...]'`, say — would not be seen. The
 * discovery floor below is what makes that fail loudly rather than quietly: if
 * the idiom changes, the count of checked migrations drops to zero and the
 * floor fires.
 *
 * The facet must be one the pillar declares, so a new facet is covered the
 * moment `TAG_FACET_KINDS` gains it, and a colon-bearing string that is not a
 * tag is never mistaken for one.
 */
export function tagsAddedIn(sql: string): string[] {
  const facets = Object.keys(TAG_FACET_KINDS).join('|');
  const pattern = new RegExp(`'((?:${facets}):[a-z0-9][a-z0-9-]*)'`, 'gu');
  const found = jsonInsertCalls(sql).flatMap((call) =>
    [...call.matchAll(pattern)].map((match) => match[1] ?? '')
  );
  return [...new Set(found)].filter((tag) => tag !== '');
}

/**
 * Whether a migration's SQL writes to any table a tag can sit on.
 *
 * The conflict clause is part of the verb, not noise: `INSERT OR IGNORE INTO`
 * and `UPDATE OR IGNORE` are the idempotent idiom this chain already uses
 * (0105 writes its vocabulary row that way), so a check anchored on a bare
 * `insert into` would skip exactly the migrations most likely to be appending
 * a tag defensively.
 */
export function touchesTagBearingTable(sql: string): boolean {
  const normalized = sql.toLowerCase();
  return TAG_BEARING_TABLES.some((table) =>
    new RegExp(
      `\\b(?:(?:insert|replace)(?:\\s+or\\s+[a-z]+)?\\s+into|update(?:\\s+or\\s+[a-z]+)?)\\s+\`?${table}\`?\\b`,
      'u'
    ).test(normalized)
  );
}

/**
 * The journal's order, which is NOT the filenames sorted.
 *
 * `meta/_journal.json` opens with `0053_finance_pillar_baseline` and only then
 * runs 0025 onwards — the pillar's schema was squashed into a baseline when it
 * split out of the monolith. Applying the directory listing instead fails on
 * `no such table`, and a guard that walked the wrong order would be asking the
 * vocabulary what it held at a step that never existed.
 */
function migrationFiles(): string[] {
  const journal: unknown = JSON.parse(
    readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8')
  );
  const entries =
    typeof journal === 'object' && journal !== null && 'entries' in journal
      ? (journal as { entries: { tag?: unknown }[] }).entries
      : [];
  const tags = entries
    .map((entry) => (typeof entry.tag === 'string' ? `${entry.tag}.sql` : ''))
    .filter((name) => name !== '');
  if (tags.length === 0) throw new Error('the finance migration journal names no migrations');
  return tags;
}

interface Offender {
  readonly migration: string;
  readonly tags: readonly string[];
}

/**
 * Apply the journal one migration at a time, checking each one's own tag
 * literals against the vocabulary as it stands once that migration has run.
 *
 * Checked AFTER rather than before, so a migration that mints the value it then
 * writes — which is the correct shape, and what 0105 does — passes.
 */
function offendersAcrossTheChain(): { offenders: Offender[]; checked: number } {
  const raw = new Database(':memory:');
  registerFinanceSqlFunctions(raw);
  const offenders: Offender[] = [];
  let checked = 0;
  try {
    for (const file of migrationFiles()) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      // `--> statement-breakpoint` is drizzle's own separator; the journal is
      // applied statement by statement, so this splits the same way.
      for (const statement of sql.split('--> statement-breakpoint')) {
        const trimmed = statement.trim();
        if (trimmed !== '') raw.exec(trimmed);
      }

      const literals = tagsAddedIn(sql);
      if (literals.length === 0 || !touchesTagBearingTable(sql)) continue;
      checked += 1;

      const known = new Set(
        (raw.prepare('SELECT tag FROM tag_vocabulary').all() as { tag: string }[]).map((row) =>
          row.tag.toLowerCase()
        )
      );
      const missing = literals.filter((tag) => !known.has(tag.toLowerCase()));
      if (missing.length > 0) offenders.push({ migration: file, tags: missing });
    }
  } finally {
    raw.close();
  }
  return { offenders, checked };
}

describe('the migration chain and the tag vocabulary', () => {
  const { offenders, checked } = offendersAcrossTheChain();

  it('reached at least one migration that writes a tag, rather than checking nothing', () => {
    // ADR-045's floor. A scan that matched no migration would pass hardest
    // when it had stopped reading anything — and both halves of the match
    // (a tag literal, and a write to a tag-bearing table) are regexes over
    // SQL that a reformat could break.
    expect(checked).toBeGreaterThan(0);
  });

  it('writes no tag the vocabulary does not hold by the end of that migration', () => {
    expect(offenders.map(({ migration, tags }) => `${migration}: ${tags.join(', ')}`)).toEqual([]);
  });
});

describe('tagsAddedIn', () => {
  const APPEND = "SET `tags` = json_insert(`tags`, '$[#]', 'occasion:health')";

  it('finds a value the migration appends', () => {
    expect(tagsAddedIn(APPEND)).toEqual(['occasion:health']);
  });

  it('says nothing about a value the migration only matches on', () => {
    // 0105's own shape, and the false alarm this exists to avoid: it names
    // `venue:homewares` a dozen times and writes it nowhere.
    const predicate =
      "WHERE EXISTS (SELECT 1 FROM json_each(t.`tags`) je WHERE je.value = 'venue:homewares')";
    expect(tagsAddedIn(predicate)).toEqual([]);
  });

  it('says nothing about a value the migration strips', () => {
    const strip =
      "SELECT json_group_array(je.value) FROM json_each(t.`tags`) je WHERE je.value <> 'occasion:home'";
    expect(tagsAddedIn(strip)).toEqual([]);
  });

  it('deduplicates a value appended more than once', () => {
    expect(tagsAddedIn(`${APPEND} ... ${APPEND}`)).toEqual(['occasion:health']);
  });

  it('reads past a nested call rather than stopping at its closing paren', () => {
    const nested = "json_insert(json_remove(`tags`, '$[0]'), '$[#]', 'venue:hardware')";
    expect(tagsAddedIn(nested)).toEqual(['venue:hardware']);
  });

  it('ignores a colon-bearing string that is not a declared facet', () => {
    expect(tagsAddedIn("json_insert(`t`, '$[#]', 'https://example.test')")).toEqual([]);
  });

  it('covers a facet the pillar declares, without a second list to keep in step', () => {
    for (const facet of Object.keys(TAG_FACET_KINDS)) {
      expect(tagsAddedIn(`json_insert(\`t\`, '$[#]', '${facet}:whatever')`)).toEqual([
        `${facet}:whatever`,
      ]);
    }
  });
});

describe('touchesTagBearingTable', () => {
  it.each([
    'UPDATE `transactions` SET tags = x',
    'update transactions set tags = x',
    'INSERT INTO `transaction_tag_rules` (tags) VALUES (x)',
    'INSERT INTO transaction_corrections (tags) VALUES (x)',
    'INSERT OR IGNORE INTO transaction_corrections (tags) VALUES (x)',
    'insert or replace into `transactions` (tags) values (x)',
    'insert or ignore into transactions (tags) values (x)',
    'UPDATE OR IGNORE `transactions` SET tags = x',
    'REPLACE INTO transaction_tag_rules (tags) VALUES (x)',
  ])('recognises %s', (sql) => {
    expect(touchesTagBearingTable(sql)).toBe(true);
  });

  it('does not mistake a longer table name for one of these', () => {
    expect(touchesTagBearingTable('INSERT INTO transactions_archive (tags) VALUES (x)')).toBe(
      false
    );
  });

  it('says no to a migration that only touches the vocabulary itself', () => {
    // A migration seeding `tag_vocabulary` names tag values by definition and
    // is not writing them onto a row.
    expect(touchesTagBearingTable("INSERT INTO `tag_vocabulary` (tag) VALUES ('venue:pub')")).toBe(
      false
    );
  });
});
