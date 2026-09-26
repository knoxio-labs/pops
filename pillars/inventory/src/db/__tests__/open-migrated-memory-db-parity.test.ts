/**
 * POPS-4356: `openMigratedMemoryDb` is the schema every unit test builds
 * fixtures against; `openInventoryDb` is what production actually mounts.
 * They must apply the same migrations journal to the same schema, or a test
 * suite could keep passing against a shape the production opener no longer
 * produces (or vice versa).
 *
 * This does not assert the two openers behave identically end to end: the
 * memory helper is deliberately narrower than the production one, skipping
 * `ensureComputedDependencyIndex`, `rebuildSearchIndexFromItems` and
 * `withPreMigrationBackup` (see `openMigratedMemoryDb` — it exists for tests
 * that read the migrated schema, not for restart/backup safety, and none of
 * those steps changes the schema on a fresh database with no rows). What
 * this test pins is the schema itself: every table, trigger and index
 * `sqlite_master` holds, byte for byte.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { openInventoryDb } from '../open-inventory-db.js';
import { openMigratedMemoryDb } from '../open-migrated-memory-db.js';

import type Database from 'better-sqlite3';

interface SchemaObject {
  readonly type: string;
  readonly name: string;
  readonly tbl_name: string;
  readonly sql: string | null;
}

function schemaObjects(raw: Database.Database): SchemaObject[] {
  return raw
    .prepare(
      `SELECT type, name, tbl_name, sql FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%'
       ORDER BY type, name`
    )
    .all() as SchemaObject[];
}

describe('openMigratedMemoryDb vs openInventoryDb', () => {
  it('apply the same migrations journal to the same schema', () => {
    const memory = openMigratedMemoryDb();
    const tmpDir = mkdtempSync(join(tmpdir(), 'inventory-schema-parity-'));
    try {
      const production = openInventoryDb(join(tmpDir, 'inventory.db'));
      try {
        const memorySchema = schemaObjects(memory.raw);
        const productionSchema = schemaObjects(production.raw);

        expect(memorySchema.length).toBeGreaterThan(0);
        expect(memorySchema).toEqual(productionSchema);
      } finally {
        production.raw.close();
      }
    } finally {
      memory.raw.close();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
