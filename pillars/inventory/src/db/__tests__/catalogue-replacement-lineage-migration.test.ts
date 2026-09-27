/**
 * Migration `0020_catalogue_replacement_lineage` adds `replaced_by` to type
 * and field definitions: existing published rows gain no lineage, stay
 * immutable, and lineage can only sit on an archived definition.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadPublishedCatalogue } from '../../catalogue/catalogue.js';
import { registerPersistedItemTypesMigrationFunctions } from '../migrations/persisted-item-types-bootstrap.js';
import { openInventoryDb } from '../open-inventory-db.js';
import { MIGRATIONS_DIR } from './migrated-db.js';

const TAG = '0020_catalogue_replacement_lineage';

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'inventory-replacement-lineage-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

/** A database migrated by every journal entry before 0020, as production held it. */
function migratedBeforeLineage(path: string): void {
  const folder = join(directory, 'migrations');
  cpSync(MIGRATIONS_DIR, folder, { recursive: true });
  const journalPath = join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: { tag: string }[];
  };
  const cut = journal.entries.findIndex((entry) => entry.tag === TAG);
  expect(cut).toBeGreaterThan(0);
  writeFileSync(
    journalPath,
    JSON.stringify({ ...journal, entries: journal.entries.slice(0, cut) })
  );
  const raw = new Database(path);
  raw.pragma('foreign_keys = ON');
  registerPersistedItemTypesMigrationFunctions(raw);
  migrate(drizzle(raw), { migrationsFolder: folder });
  raw.close();
}

function columns(raw: Database.Database, table: string): string[] {
  return (raw.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
    (column) => column.name
  );
}

describe(TAG, () => {
  it('leaves every existing published definition without lineage, and still immutable', () => {
    const path = join(directory, 'inventory.db');
    migratedBeforeLineage(path);
    const before = new Database(path);
    const types = before.prepare('SELECT count(*) AS n FROM item_types').get() as { n: number };
    expect(columns(before, 'item_types')).not.toContain('replaced_by');
    before.close();

    const opened = openInventoryDb(path);

    expect(columns(opened.raw, 'item_types')).toContain('replaced_by');
    expect(columns(opened.raw, 'item_type_fields')).toContain('replaced_by');
    expect(types.n).toBeGreaterThan(0);
    expect(
      opened.raw
        .prepare(
          `SELECT (SELECT count(*) FROM item_types WHERE replaced_by IS NOT NULL)
                + (SELECT count(*) FROM item_type_fields WHERE replaced_by IS NOT NULL) AS n`
        )
        .get()
    ).toEqual({ n: 0 });
    const catalogue = loadPublishedCatalogue(opened.db);
    expect(catalogue?.types.length).toBe(types.n);
    expect(catalogue?.types.every((type) => type.replacedBy === null)).toBe(true);
    expect(() =>
      opened.raw.exec("UPDATE item_types SET archived_at = 'now', replaced_by = id || 'x'")
    ).toThrow(/immutable/);
    opened.raw.close();
  });

  it('refuses lineage on a live definition or on itself', () => {
    const opened = openInventoryDb(join(directory, 'inventory.db'));
    opened.raw.exec(`
      INSERT INTO catalogue_revisions
        (revision, base_revision, status, minimum_protocol, created_actor_kind, created_at)
      VALUES (100, 1, 'draft', 1, 'web', 'now');
      INSERT INTO item_types
        SELECT 100, id, key, label, description, sort_order, capabilities_json,
               legacy_labels_json, presentation_json, archived_at, replaced_by, NULL
        FROM item_types WHERE revision = 1;
    `);
    const id = opened.raw
      .prepare('SELECT id FROM item_types WHERE revision = 100')
      .pluck()
      .get() as string;
    const set = (archivedAt: string | null, replacedBy: string): void => {
      opened.raw
        .prepare(
          'UPDATE item_types SET archived_at = ?, replaced_by = ? WHERE revision = 100 AND id = ?'
        )
        .run(archivedAt, replacedBy, id);
    };

    expect(() => set(null, 'another')).toThrow(/ck_item_types_replaced_by/);
    expect(() => set('now', id)).toThrow(/ck_item_types_replaced_by/);
    expect(() => set('now', 'another')).not.toThrow();
    opened.raw.close();
  });
});
