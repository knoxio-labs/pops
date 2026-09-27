import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerPersistedItemTypesMigrationFunctions } from '../migrations/persisted-item-types-bootstrap.js';
import { openInventoryDb } from '../open-inventory-db.js';
import { MIGRATIONS_DIR } from './migrated-db.js';

const TAG = '0023_item_type_parent';

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'inventory-item-type-parent-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

/** Creates a database using every migration before the parent column. */
function migratedBeforeParent(path: string): void {
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

type TypeRow = {
  revision: number;
  id: string;
  key: string;
  label: string;
  description: string | null;
  sort_order: number;
  capabilities_json: string;
  legacy_labels_json: string;
  presentation_json: string;
  archived_at: string | null;
  replaced_by: string | null;
};

describe(TAG, () => {
  it('adds a nullable parent column without changing published type rows', () => {
    const path = join(directory, 'inventory.db');
    migratedBeforeParent(path);

    const before = new Database(path);
    const beforeRows = before
      .prepare(
        `SELECT revision, id, key, label, description, sort_order, capabilities_json,
                legacy_labels_json, presentation_json, archived_at, replaced_by
           FROM item_types ORDER BY revision, id`
      )
      .all() as TypeRow[];
    expect(beforeRows.some((row) => row.revision === 1)).toBe(true);
    expect(
      before
        .prepare("SELECT name FROM pragma_table_info('item_types') WHERE name = 'parent_type_id'")
        .get()
    ).toBeUndefined();
    before.close();

    const opened = openInventoryDb(path);
    const afterRows = opened.raw
      .prepare(
        `SELECT revision, id, key, label, description, sort_order, capabilities_json,
                legacy_labels_json, presentation_json, archived_at, replaced_by,
                parent_type_id
           FROM item_types ORDER BY revision, id`
      )
      .all() as (TypeRow & { parent_type_id: string | null })[];

    expect(afterRows).toHaveLength(beforeRows.length);
    expect(afterRows.every((row) => row.parent_type_id === null)).toBe(true);
    expect(afterRows.map(({ parent_type_id: _parentTypeId, ...row }) => row)).toEqual(beforeRows);
    opened.raw.close();
  });
});
