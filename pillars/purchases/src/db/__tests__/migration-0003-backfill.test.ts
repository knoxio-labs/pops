/**
 * The data move in migration 0003, run against rows shaped the way the two
 * shipped adapters actually wrote them.
 *
 * Nothing else in the suite covers a migration's *backfill*. Every other
 * test opens a database that was empty when the migration ran, so a
 * backfill that silently moved nothing — or moved the wrong rows — would
 * pass all of them and only be discovered against the live file, where the
 * original tag rows have already been deleted.
 *
 * The database is brought up to 0002 from a copy of the journal truncated
 * at that point, seeded with raw SQL, closed, then reopened against the
 * real migrations folder — which applies every entry after 0002 and none
 * before, because drizzle's migrator only runs entries newer than the last
 * one recorded.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { openPurchasesDb } from '../open-purchases-db.js';

import type { OpenedPurchasesDb } from '../index.js';

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'migrations'
);

const THROUGH_0002 = [
  { idx: 0, version: '6', when: 1785686400000, tag: '0000_purchases_init', breakpoints: true },
  { idx: 1, version: '6', when: 1786100000000, tag: '0001_purchase_tags', breakpoints: true },
  { idx: 2, version: '6', when: 1786200000000, tag: '0002_purchase_surcharge', breakpoints: true },
];

/**
 * Read rather than hard-coded: every migration added after this file was
 * written lands in the same reopen, and a literal count would fail the next
 * one for no reason a reader could act on.
 */
function journalEntryCount(): number {
  const journal: unknown = JSON.parse(
    readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8')
  );
  const { entries } = z.object({ entries: z.array(z.unknown()) }).parse(journal);
  return entries.length;
}

let dir: string;
let dbPath: string;

/** A migrations folder holding only the entries that existed before 0003. */
function stageMigrationsThrough0002(): string {
  const staged = join(dir, 'migrations');
  mkdirSync(join(staged, 'meta'), { recursive: true });
  for (const entry of THROUGH_0002) {
    cpSync(join(MIGRATIONS_DIR, `${entry.tag}.sql`), join(staged, `${entry.tag}.sql`));
  }
  writeFileSync(
    join(staged, 'meta', '_journal.json'),
    JSON.stringify({ version: '7', dialect: 'sqlite', entries: THROUGH_0002 })
  );
  return staged;
}

interface SeededItem {
  readonly id: string;
  readonly source: string;
  readonly merchantCategory?: string;
  readonly tags?: readonly string[];
}

/**
 * Explicit, so `confirmed_at` on a surviving row can be checked against the
 * timestamp the row was actually written at rather than against "some
 * string". A default would land at migration time and hide a backfill that
 * stamped `now` over the caller's own history.
 */
const TAG_WRITTEN_AT = '2026-03-04T05:06:07.008Z';

/**
 * The world as it stood at 0002: four sources, lines carrying the exact tag
 * shapes the Woolworths mapper and the drop-zone wrote, and lines carrying
 * what a caller could put in `POST /purchases` when its body still took a
 * free-form `tags: string[]`.
 */
const SEED: readonly SeededItem[] = [
  {
    id: 'w-promo',
    source: 'woolworths',
    merchantCategory: 'gst-applicable',
    // Deliberately not alphabetical, and deliberately more than one, so the
    // ordering the migration produces is observable.
    tags: ['promotional-price', 'Qty 2 @ $9.24 each', 'PRICE REDUCED BY $7.26 each'],
  },
  { id: 'w-plain', source: 'woolworths', tags: ['0.202 kg NET @ $2.90/kg'] },
  { id: 'w-gst-only', source: 'woolworths', merchantCategory: 'gst-applicable' },
  { id: 'a-new', source: 'amazon', merchantCategory: 'New' },
  { id: 'r-note', source: 'receipt', tags: ['2 @ $3.00'] },
  // Entered by hand, stating a category the column was always documented to
  // hold. It must come out the other side untouched.
  { id: 'b-manual', source: 'bunnings', merchantCategory: 'Garden' },
  // Both kinds on one line: two slugs a caller asserted, and one piece of
  // prose. The partition has to split a single item's rows two ways.
  { id: 'b-both', source: 'bunnings', tags: ['fruit', 'single-origin', 'Qty 2 @ $9.24 each'] },
  // The same two strings again. `(item_id, tag)` means a duplicate can only
  // exist across lines, and each row must be decided on its own.
  { id: 'b-dup', source: 'bunnings', tags: ['fruit', 'Qty 2 @ $9.24 each'] },
  // Every way a string can miss the slug shape. None may survive as a tag.
  {
    id: 'b-misshapen',
    source: 'bunnings',
    tags: ['-leading', 'trailing-', 'double--hyphen', 'Upper', 'has space', 'under_score', '1.5'],
  },
  // A caller's tag on a line the mapper also marked promotional.
  { id: 'w-promo-tagged', source: 'woolworths', tags: ['promotional-price', 'healthy'] },
  // Adapter prose that happens to be slug-shaped, and therefore
  // indistinguishable from an assertion.
  { id: 'w-slug-prose', source: 'woolworths', tags: ['special'] },
];

function seedThrough0002(): void {
  const staged = stageMigrationsThrough0002();
  const raw = new Database(dbPath);
  raw.pragma('foreign_keys = ON');
  migrate(drizzle(raw), { migrationsFolder: staged });

  const sources = [...new Set(SEED.map((item) => item.source))];
  for (const source of sources) {
    raw.prepare(`INSERT INTO purchase_sources (id, label) VALUES (?, ?)`).run(source, source);
    raw
      .prepare(
        `INSERT INTO purchases (id, source, source_order_id, ingest_method, ordered_at, currency, total_cents, checksum)
         VALUES (?, ?, ?, 'export', '2026-02-02T01:41:21Z', 'AUD', 100, ?)`
      )
      .run(`p-${source}`, source, `order-${source}`, `checksum-${source}`);
  }

  for (const [position, item] of SEED.entries()) {
    raw
      .prepare(
        `INSERT INTO purchase_items (id, purchase_id, position, name, unit_price_cents, line_total_cents, merchant_category)
         VALUES (?, ?, ?, ?, 100, 100, ?)`
      )
      .run(item.id, `p-${item.source}`, position, item.id, item.merchantCategory ?? null);
    for (const tag of item.tags ?? []) {
      raw
        .prepare(`INSERT INTO purchase_item_tags (item_id, tag, created_at) VALUES (?, ?, ?)`)
        .run(item.id, tag, TAG_WRITTEN_AT);
    }
  }
  raw.close();
}

let opened: OpenedPurchasesDb;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'purchases-migration-'));
  dbPath = join(dir, 'purchases.db');
  seedThrough0002();
  opened = openPurchasesDb(dbPath);
});

afterEach(() => {
  opened.raw.close();
  rmSync(dir, { recursive: true, force: true });
});

function notesOf(itemId: string): string[] {
  return (
    opened.raw
      .prepare(`SELECT note FROM purchase_item_notes WHERE item_id = ? ORDER BY position`)
      .all(itemId) as { note: string }[]
  ).map((row) => row.note);
}

interface SurvivingTag {
  tag: string;
  created_at: string;
  confirmed_at: string | null;
}

function tagsOf(itemId: string): SurvivingTag[] {
  return opened.raw
    .prepare(
      `SELECT tag, created_at, confirmed_at FROM purchase_item_tags WHERE item_id = ? ORDER BY tag`
    )
    .all(itemId) as SurvivingTag[];
}

interface ItemFlags {
  promotional_price: number | null;
  gst_applicable: number | null;
  merchant_category: string | null;
  merchant_condition: string | null;
  kind: string | null;
  kind_confirmed_at: string | null;
}

function itemFlags(itemId: string): ItemFlags {
  return opened.raw
    .prepare(
      `SELECT promotional_price, gst_applicable, merchant_category, merchant_condition, kind, kind_confirmed_at
       FROM purchase_items WHERE id = ?`
    )
    .get(itemId) as ItemFlags;
}

describe('applying 0003 to a database that already holds adapter-written tags', () => {
  it('leaves every migration recorded exactly once', () => {
    // If drizzle re-ran 0000 the reopen would have thrown; this asserts the
    // arrangement the rest of the file depends on rather than assuming it.
    const applied = (
      opened.raw
        .prepare(`SELECT created_at FROM __drizzle_migrations ORDER BY created_at`)
        .all() as { created_at: number }[]
    ).map((row) => row.created_at);
    expect(applied).toHaveLength(journalEntryCount());
  });

  it('moves every merchant note into the notes table', () => {
    expect(notesOf('w-promo')).toEqual(['PRICE REDUCED BY $7.26 each', 'Qty 2 @ $9.24 each']);
    expect(notesOf('w-plain')).toEqual(['0.202 kg NET @ $2.90/kg']);
    expect(notesOf('r-note')).toEqual(['2 @ $3.00']);
    expect(notesOf('w-gst-only')).toEqual([]);
    expect(notesOf('a-new')).toEqual([]);
  });

  it('gives a moved note the timestamp its tag row was written at', () => {
    const rows = opened.raw
      .prepare(`SELECT DISTINCT created_at FROM purchase_item_notes`)
      .all() as { created_at: string }[];
    expect(rows.map((row) => row.created_at)).toEqual([TAG_WRITTEN_AT]);
  });

  it('does not carry `promotional-price` across as a note', () => {
    // It is not prose. Leaving it in the notes would put a POPS-minted
    // marker in the column documented as verbatim merchant text — which is
    // the class of error this migration exists to undo.
    expect(notesOf('w-promo')).not.toContain('promotional-price');
  });

  it('turns the two receipt characters into stated booleans', () => {
    expect(itemFlags('w-promo').promotional_price).toBe(1);
    expect(itemFlags('w-promo').gst_applicable).toBe(1);
    expect(itemFlags('w-gst-only').gst_applicable).toBe(1);
    // Stated "no" rather than unstated: a Woolworths receipt prints the
    // marks on every line they apply to, so their absence is information.
    expect(itemFlags('w-plain').promotional_price).toBe(0);
    expect(itemFlags('w-plain').gst_applicable).toBe(0);
  });

  it('leaves both booleans NULL for sources that state neither', () => {
    // Backfilling these to 0 would assert that Amazon told us a line was
    // not on special, which it never did.
    expect(itemFlags('a-new')).toMatchObject({ promotional_price: null, gst_applicable: null });
    expect(itemFlags('r-note')).toMatchObject({ promotional_price: null, gst_applicable: null });
  });

  it('empties merchant_category of everything that was never a category', () => {
    expect(itemFlags('w-promo').merchant_category).toBeNull();
    expect(itemFlags('w-gst-only').merchant_category).toBeNull();
    expect(itemFlags('a-new').merchant_category).toBeNull();
    expect(itemFlags('a-new').merchant_condition).toBe('New');
  });

  it('leaves a hand-entered category alone', () => {
    // The one thing the column was ever documented to hold. A backfill that
    // moved "everything left" would have destroyed it.
    expect(itemFlags('b-manual')).toMatchObject({
      merchant_category: 'Garden',
      merchant_condition: null,
    });
  });

  it('classifies nothing — every line comes through unclassified', () => {
    for (const item of SEED) {
      expect(itemFlags(item.id), item.id).toMatchObject({ kind: null, kind_confirmed_at: null });
    }
  });

  it('cascades the new notes away with their line', () => {
    opened.raw.prepare(`DELETE FROM purchases WHERE id = 'p-woolworths'`).run();
    expect(notesOf('w-promo')).toEqual([]);
    expect(notesOf('w-plain')).toEqual([]);
    expect(notesOf('r-note')).toEqual(['2 @ $3.00']);
  });
});

/**
 * The half of the partition that is destructive, and the reason this file
 * exists at all.
 *
 * `purchase_item_tags` held adapter prose and caller-asserted POPS tags in
 * the same rows, and the first draft of 0003 emptied the table outright
 * after moving the prose out. That is silent, one-way, and runs inside
 * `openPurchasesDb` at process start: a classification a caller asserted
 * through `POST /purchases` — the exact thing the confirmed/proposed
 * distinction exists to protect — would have been gone before anyone could
 * look. Shape is the only signal available to tell the two apart, so these
 * tests pin what each shape does.
 */
describe('the tags a caller asserted survive 0003', () => {
  it('keeps a slug-shaped tag, marked asserted from its own created_at', () => {
    expect(tagsOf('b-both')).toEqual([
      { tag: 'fruit', created_at: TAG_WRITTEN_AT, confirmed_at: TAG_WRITTEN_AT },
      { tag: 'single-origin', created_at: TAG_WRITTEN_AT, confirmed_at: TAG_WRITTEN_AT },
    ]);
  });

  it('does not stamp the confirmation with the time the migration ran', () => {
    // `confirmed_at = created_at` is not decoration. Stamping `now` would
    // date every asserted tag in the fleet to whenever the container
    // happened to restart, and there is no second copy to restore from.
    const stamped = opened.raw
      .prepare(`SELECT count(*) AS n FROM purchase_item_tags WHERE confirmed_at <> created_at`)
      .get() as { n: number };
    expect(stamped.n).toBe(0);
  });

  it('splits one line whose rows are both kinds', () => {
    expect(tagsOf('b-both').map((row) => row.tag)).toEqual(['fruit', 'single-origin']);
    expect(notesOf('b-both')).toEqual(['Qty 2 @ $9.24 each']);
  });

  it('decides a repeated string the same way on every line it appears on', () => {
    expect(tagsOf('b-dup').map((row) => row.tag)).toEqual(['fruit']);
    expect(notesOf('b-dup')).toEqual(['Qty 2 @ $9.24 each']);
  });

  it('moves everything that misses the slug shape, keeping none of it', () => {
    expect(tagsOf('b-misshapen')).toEqual([]);
    expect(notesOf('b-misshapen')).toEqual([
      '-leading',
      '1.5',
      'Upper',
      'double--hyphen',
      'has space',
      'trailing-',
      'under_score',
    ]);
  });

  it('numbers the notes from zero even where a tag was held back', () => {
    // The window function runs after the WHERE, so excluding the kept rows
    // must not leave a hole where `single-origin` would have sorted.
    const positions = opened.raw
      .prepare(`SELECT position FROM purchase_item_notes WHERE item_id = 'b-both'`)
      .all() as { position: number }[];
    expect(positions.map((row) => row.position)).toEqual([0]);
  });

  it('consumes `promotional-price` without taking the tag beside it', () => {
    // Slug-shaped, but a POPS-minted marker for what is now a column. The
    // fact is not lost — it moves to `promotional_price`.
    expect(tagsOf('w-promo-tagged').map((row) => row.tag)).toEqual(['healthy']);
    expect(notesOf('w-promo-tagged')).toEqual([]);
    expect(itemFlags('w-promo-tagged').promotional_price).toBe(1);
  });

  it('keeps slug-shaped prose as a tag, because nothing can tell it apart', () => {
    // The one case the shape decides wrongly, and deliberately so: the
    // prose is re-derivable by re-ingesting the export, an asserted tag is
    // not, so an ambiguous row is kept rather than destroyed.
    expect(tagsOf('w-slug-prose').map((row) => row.tag)).toEqual(['special']);
    expect(notesOf('w-slug-prose')).toEqual([]);
  });

  it('leaves nothing unmarked behind in the tag table', () => {
    // A survivor without a marker would read as a machine proposal that no
    // pass ever made.
    const unmarked = opened.raw
      .prepare(`SELECT count(*) AS n FROM purchase_item_tags WHERE confirmed_at IS NULL`)
      .get() as { n: number };
    expect(unmarked.n).toBe(0);
  });

  it('cascades a surviving tag away with its line', () => {
    opened.raw.prepare(`DELETE FROM purchases WHERE id = 'p-bunnings'`).run();
    expect(tagsOf('b-both')).toEqual([]);
  });
});
