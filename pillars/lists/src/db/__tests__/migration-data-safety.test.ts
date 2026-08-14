/**
 * What the migration chain does to lists that were already stored.
 *
 * Finance and purchases run this shape against a tail of migrations that
 * actually rewrites pre-existing data (a column rename, a table rebuild, a
 * backfilled default). Lists has no such tail yet: `migrations/meta/_journal.json`
 * holds exactly one entry, `0062_chemical_donald_blake`, which creates the
 * schema from nothing. There is no earlier point to stage "before" — the
 * whole journal is the baseline.
 *
 * So this test currently proves something narrower than its siblings: that
 * `openListsDb` is idempotent against a database that already carries rows
 * and a full schema (nothing pending, so `withPreMigrationBackup` takes no
 * snapshot — see `pre-migration-backup.ts`), and that the seeded rows survive
 * that reopen byte-for-byte with their foreign key and check constraints
 * intact. The schema also has no JSON-bearing column, so unlike finance's
 * `tags` there is nothing to assert stays parseable here.
 *
 * The day a second migration lands, staging through `0062_chemical_donald_blake`
 * starts meaning what it means in finance and purchases: everything after that
 * point in the journal applies to the data seeded below, and this test starts
 * covering real migration safety instead of just reopen-idempotency.
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readMigrationJournal, stageMigrationsThrough } from '@pops/pillar-sdk/db';

import { openListsDb } from '../open-lists-db.js';

import type { OpenedListsDb } from '../open-lists-db.js';

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'migrations'
);

/** The only entry in the journal today — see the header comment. */
const THROUGH = '0062_chemical_donald_blake';

interface SeededList {
  readonly id: number;
  readonly name: string;
  readonly kind: string;
  readonly ownerApp: string;
  readonly archivedAt: string | null;
}

const LISTS: readonly SeededList[] = [
  {
    id: 1,
    name: 'Weekly Shop',
    kind: 'shopping',
    ownerApp: 'lists-mobile',
    archivedAt: null,
  },
  {
    id: 2,
    name: 'Camping Trip',
    kind: 'packing',
    ownerApp: 'lists-web',
    archivedAt: '2026-01-05T00:00:00Z',
  },
];

/** The value most likely to break a naive rebuild that quotes column values inline. */
const QUOTED_LABEL = `O'Brien's "Deluxe" Pack — 5kg's worth`;
const QUOTED_NOTES = `Ask for the one behind the counter — she said "hold it 'til Friday"`;

interface SeededItem {
  readonly id: number;
  readonly listId: number;
  readonly position: number;
  readonly label: string;
  readonly qty: number | null;
  readonly unit: string | null;
  readonly refKind: string;
  readonly refId: number | null;
  readonly checked: 0 | 1;
  readonly checkedAt: string | null;
  readonly dueAt: string | null;
  readonly notes: string | null;
}

/** Every row carries a genuine FK into `lists`, exercised by `PRAGMA foreign_key_check` below. */
const ITEMS: readonly SeededItem[] = [
  {
    id: 1,
    listId: 1,
    position: 0,
    label: 'Milk',
    qty: 2.5,
    unit: 'L',
    refKind: 'ingredient',
    refId: 42,
    checked: 0,
    checkedAt: null,
    dueAt: null,
    notes: null,
  },
  {
    id: 2,
    listId: 1,
    position: 1,
    label: QUOTED_LABEL,
    qty: 1,
    unit: null,
    refKind: 'free',
    refId: null,
    checked: 1,
    checkedAt: '2026-01-02T00:00:00Z',
    dueAt: null,
    notes: QUOTED_NOTES,
  },
  {
    id: 3,
    listId: 2,
    position: 0,
    label: 'Tent stakes',
    qty: null,
    unit: null,
    refKind: 'custom',
    refId: 7,
    checked: 0,
    checkedAt: null,
    dueAt: '2026-02-01',
    notes: null,
  },
];

let dir: string;
let dbPath: string;
let opened: OpenedListsDb;

function seedThroughJournal(): void {
  const staged = stageMigrationsThrough({
    migrationsFolder: MIGRATIONS_DIR,
    through: THROUGH,
    targetFolder: join(dir, 'staged-migrations'),
  });

  const raw = new Database(dbPath);
  raw.pragma('foreign_keys = ON');
  migrate(drizzle(raw), { migrationsFolder: staged });

  for (const list of LISTS) {
    raw
      .prepare(
        `INSERT INTO lists (id, name, kind, owner_app, archived_at, created_at)
         VALUES (?, ?, ?, ?, ?, '2026-01-01T00:00:00Z')`
      )
      .run(list.id, list.name, list.kind, list.ownerApp, list.archivedAt);
  }

  for (const item of ITEMS) {
    raw
      .prepare(
        `INSERT INTO list_items
           (id, list_id, position, label, qty, unit, ref_kind, ref_id, checked, checked_at, due_at, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-01-01T00:00:00Z')`
      )
      .run(
        item.id,
        item.listId,
        item.position,
        item.label,
        item.qty,
        item.unit,
        item.refKind,
        item.refId,
        item.checked,
        item.checkedAt,
        item.dueAt,
        item.notes
      );
  }

  raw.close();
}

function rows<T>(sql: string): T[] {
  return opened.raw.prepare(sql).all() as T[];
}

function count(table: string): number {
  return (opened.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lists-migration-safety-'));
  dbPath = join(dir, 'lists.db');
  seedThroughJournal();
  opened = openListsDb(dbPath);
});

afterEach(() => {
  opened.raw.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('reopening a populated lists database with the full journal', () => {
  it('applies every journal entry exactly once', () => {
    const applied = rows<{ created_at: number }>(
      `SELECT created_at FROM __drizzle_migrations ORDER BY created_at`
    );
    expect(applied).toHaveLength(readMigrationJournal(MIGRATIONS_DIR).length);
  });

  it('loses no rows from either table', () => {
    expect(count('lists')).toBe(LISTS.length);
    expect(count('list_items')).toBe(ITEMS.length);
  });

  it('takes no pre-migration snapshot when nothing was pending', () => {
    expect(readdirSync(dir).filter((name) => name.includes('.pre-migration-'))).toEqual([]);
  });

  it('keeps every list column intact, including a null archived_at', () => {
    const stored = rows<{
      id: number;
      name: string;
      kind: string;
      owner_app: string;
      archived_at: string | null;
    }>(`SELECT id, name, kind, owner_app, archived_at FROM lists ORDER BY id`);
    expect(stored).toEqual(
      LISTS.map((list) => ({
        id: list.id,
        name: list.name,
        kind: list.kind,
        owner_app: list.ownerApp,
        archived_at: list.archivedAt,
      }))
    );
  });

  it('keeps every item column intact, including nullable qty/unit/refs', () => {
    const stored = rows<{
      id: number;
      list_id: number;
      position: number;
      label: string;
      qty: number | null;
      unit: string | null;
      ref_kind: string;
      ref_id: number | null;
      checked: number;
      checked_at: string | null;
      due_at: string | null;
      notes: string | null;
    }>(
      `SELECT id, list_id, position, label, qty, unit, ref_kind, ref_id, checked, checked_at, due_at, notes
       FROM list_items ORDER BY id`
    );
    expect(stored).toEqual(
      ITEMS.map((item) => ({
        id: item.id,
        list_id: item.listId,
        position: item.position,
        label: item.label,
        qty: item.qty,
        unit: item.unit,
        ref_kind: item.refKind,
        ref_id: item.refId,
        checked: item.checked,
        checked_at: item.checkedAt,
        due_at: item.dueAt,
        notes: item.notes,
      }))
    );
  });

  it('leaves quotes and special characters byte-identical', () => {
    const stored = rows<{ label: string; notes: string | null }>(
      `SELECT label, notes FROM list_items WHERE id = 2`
    );
    expect(stored).toEqual([{ label: QUOTED_LABEL, notes: QUOTED_NOTES }]);
  });

  it('keeps every item attached to its list', () => {
    const stored = rows<{ id: number; list_id: number }>(
      `SELECT i.id, i.list_id FROM list_items i JOIN lists l ON l.id = i.list_id ORDER BY i.id`
    );
    expect(stored).toEqual(ITEMS.map((item) => ({ id: item.id, list_id: item.listId })));
  });

  it('leaves no broken foreign key and no corrupted page', () => {
    expect(rows(`PRAGMA foreign_key_check`)).toEqual([]);
    expect(rows(`PRAGMA integrity_check`)).toEqual([{ integrity_check: 'ok' }]);
  });
});
