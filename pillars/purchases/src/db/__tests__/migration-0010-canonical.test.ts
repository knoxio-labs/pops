/**
 * Migration 0010 against rows written before `ordered_at` had one spelling.
 *
 * A canonicalising writer over a heterogeneous table fixes nothing: the rows
 * already in the file keep sorting where they always did, and every date
 * window stays as wrong as it was. Every other suite opens a database that
 * was empty when the migration ran, so a rewrite that touched nothing — or
 * that shifted rows already in the right form — passes all of them and is
 * discovered against the live file, by which point a wrongly-shifted
 * timestamp is indistinguishable from a correct one.
 *
 * The migration rewrites in SQLite and the write path rewrites in JavaScript,
 * so a row's spelling would depend on which of the two wrote it if the two
 * ever disagreed. The last two cases hold them to the same answer, and pin
 * the one place they do not: below a millisecond SQLite rounds where
 * `toISOString()` truncates.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { canonicalInstant } from '../index.js';
import { openSeededAtMigration } from './migration-harness.js';

import type Database from 'better-sqlite3';

import type { OpenedPurchasesDb } from '../index.js';

/** The last entry before 0010 canonicalises the column. */
const BEFORE_CANONICAL = '0009_product_dictionary';

interface SeededOrder {
  readonly id: string;
  readonly orderedAt: string;
  /** What 0010 must leave behind. */
  readonly expected: string;
}

/**
 * Finer than the column keeps, and the one case where SQLite and the writer
 * differ: `strftime` rounds the fraction to milliseconds, `toISOString()`
 * truncates it, so the two land a millisecond apart. Reimplementing ISO
 * parsing in SQL to truncate instead would be more risk than a millisecond
 * is worth on a column whose windows are days wide — and only a caller who
 * posted more than millisecond precision, which no adapter does, can have
 * produced a row this reaches.
 */
const SUB_MILLISECOND: SeededOrder = {
  id: 'p-nanos',
  orderedAt: '2026-02-02T01:41:21.987654321Z',
  expected: '2026-02-02T01:41:21.988Z',
};

/**
 * The spellings `IsoTimestampSchema` admitted and the old writer stored
 * verbatim. Sydney is UTC+10/+11, so the offset rows are the ones a caller
 * posting local time produced — and both of these sit on the evening of the
 * last day of a month, where the skew moves the order out of it.
 */
const SEED: readonly SeededOrder[] = [
  {
    id: 'p-utc',
    orderedAt: '2026-01-15T03:20:00.000Z',
    expected: '2026-01-15T03:20:00.000Z',
  },
  {
    id: 'p-sydney-evening',
    orderedAt: '2026-01-31T21:00:00+10:00',
    expected: '2026-01-31T11:00:00.000Z',
  },
  {
    id: 'p-sydney-dst',
    orderedAt: '2026-02-01T09:00:00+11:00',
    expected: '2026-01-31T22:00:00.000Z',
  },
  {
    id: 'p-coarse',
    orderedAt: '2026-02-02T01:41:21Z',
    expected: '2026-02-02T01:41:21.000Z',
  },
];

/**
 * A value SQLite's date functions cannot read. Left exactly as it was: the
 * column is NOT NULL, so writing the NULL that `strftime` returns for it
 * would abort the statement and take every later migration with it.
 */
const UNREADABLE: SeededOrder = {
  id: 'p-unreadable',
  orderedAt: 'sometime last winter',
  expected: 'sometime last winter',
};

let opened: OpenedPurchasesDb;
let cleanup: () => void;

function seedThrough0009(raw: Database.Database): void {
  raw.prepare(`INSERT INTO purchase_sources (id, label) VALUES ('woolworths', 'Woolworths')`).run();
  for (const order of [...SEED, SUB_MILLISECOND, UNREADABLE]) {
    raw
      .prepare(
        `INSERT INTO purchases (id, source, source_order_id, ingest_method, ordered_at, currency, total_cents, checksum)
         VALUES (?, 'woolworths', ?, 'upload', ?, 'AUD', 4500, ?)`
      )
      .run(order.id, `order-${order.id}`, order.orderedAt, `checksum-${order.id}`);
  }
}

function storedOrderedAt(id: string): string {
  const row = opened.raw.prepare(`SELECT ordered_at AS at FROM purchases WHERE id = ?`).get(id) as {
    at: string;
  };
  return row.at;
}

beforeEach(() => {
  ({ opened, cleanup } = openSeededAtMigration({
    through: BEFORE_CANONICAL,
    prefix: 'purchases-migration-0010-',
    seed: seedThrough0009,
  }));
});

afterEach(() => {
  cleanup();
});

describe('applying 0010 to a database written before the column had one spelling', () => {
  it.each(SEED)('rewrites $id to the instant it named', ({ id, expected }) => {
    expect(storedOrderedAt(id)).toBe(expected);
  });

  it('rounds a fraction finer than the column keeps rather than dropping the row', () => {
    expect(storedOrderedAt(SUB_MILLISECOND.id)).toBe(SUB_MILLISECOND.expected);
  });

  it('leaves a timestamp SQLite cannot read exactly as it was', () => {
    expect(storedOrderedAt(UNREADABLE.id)).toBe(UNREADABLE.orderedAt);
  });

  it('puts the rewritten rows in chronological order as text', () => {
    // The point of the whole exercise. Before it, the two offset rows sorted
    // past the coarse February one while naming January instants.
    const rewritten = [...SEED, SUB_MILLISECOND];
    const stored = opened.raw
      .prepare(`SELECT id FROM purchases WHERE id != ? ORDER BY ordered_at ASC`)
      .all(UNREADABLE.id)
      .map((row) => (row as { id: string }).id);

    expect(stored).toEqual(
      [...rewritten]
        .sort((a, b) => Date.parse(a.expected) - Date.parse(b.expected))
        .map((order) => order.id)
    );
  });

  it('agrees exactly with the writer that runs on every row written after it', () => {
    for (const order of SEED) {
      expect(canonicalInstant(order.orderedAt)).toBe(storedOrderedAt(order.id));
    }
  });

  it('stays within a millisecond of the writer even where the two round differently', () => {
    const written = canonicalInstant(SUB_MILLISECOND.orderedAt);

    expect(written).not.toBeNull();
    expect(Date.parse(written ?? '') - Date.parse(storedOrderedAt(SUB_MILLISECOND.id))).toBe(-1);
  });
});
